import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  DEFAULT_OUTPUT_DIRECTORY,
  getComparisonFileLabel,
  getCompilerCommand,
  isLatexPath,
  isSameFilePath,
  resolveOutputDirectory,
  sanitizeLabel,
} from './helpers';

const execFileAsync = promisify(execFile);
const STATUS_BAR_COMMAND = 'latexdiff.openCompareMenu';
const RECENT_COMMIT_LIMIT = 15;
const MAX_OUTPUT_BUFFER = 10 * 1024 * 1024;
const TRUST_REQUIRED_MESSAGE = 'Latexdiff is disabled in Restricted Mode because it executes external tools. Trust this workspace to use the extension.';

type LatexContext = {
  document: vscode.TextDocument;
  rootPath: string;
  filePath: string;
  relativeFilePath: string;
};

type ComparePick = vscode.QuickPickItem & {
  action: 'gitHead' | 'gitRef' | 'file';
  ref?: string;
};

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = STATUS_BAR_COMMAND;
  statusBarItem.text = '$(diff) Latexdiff';
  statusBarItem.tooltip = 'Generate a latexdiff PDF for the current LaTeX file';

  const updateStatusBar = (editor = vscode.window.activeTextEditor) => {
    if (vscode.workspace.isTrusted && getLatexContext(editor, false)) {
      statusBarItem.show();
      return;
    }

    statusBarItem.hide();
  };

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand(STATUS_BAR_COMMAND, async () => {
      await openCompareMenu();
    }),
    vscode.commands.registerCommand('latexdiff.compareWithHead', async () => {
      const latexContext = await prepareLatexContext();
      if (!latexContext) {
        return;
      }

      await compareWithGitRef('HEAD', latexContext);
    }),
    vscode.commands.registerCommand('latexdiff.compareWithCommit', async () => {
      const latexContext = await prepareLatexContext();
      if (!latexContext) {
        return;
      }

      const ref = await promptForGitRef(latexContext);
      if (!ref) {
        return;
      }

      await compareWithGitRef(ref, latexContext);
    }),
    vscode.commands.registerCommand('latexdiff.compareWithFile', async () => {
      const latexContext = await prepareLatexContext();
      if (!latexContext) {
        return;
      }

      const previousFileUri = await promptForComparisonFile(latexContext);
      if (!previousFileUri) {
        return;
      }

      await compareWithFile(previousFileUri, latexContext);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateStatusBar(editor);
    }),
    vscode.workspace.onDidOpenTextDocument(() => {
      updateStatusBar();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      updateStatusBar();
    }),
  );

  updateStatusBar();
}

async function openCompareMenu() {
  const latexContext = await prepareLatexContext();
  if (!latexContext) {
    return;
  }

  const hasGitRepository = await isGitRepository(latexContext);
  const picks: ComparePick[] = [];

  if (hasGitRepository) {
    picks.push(
      {
        label: 'Compare with HEAD',
        description: 'Use the current committed version of this file',
        action: 'gitHead',
        ref: 'HEAD',
      },
      {
        label: 'Compare with Another Git Ref...',
        description: 'Pick a recent commit or enter a branch, tag, or SHA',
        action: 'gitRef',
      },
    );
  }

  picks.push({
    label: 'Compare with Another File...',
    description: 'Pick an older .tex file from any folder such as v1/ or archive/',
    action: 'file',
  });

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: `Choose a comparison target for ${path.basename(latexContext.filePath)}`,
  });

  if (!selected) {
    return;
  }

  if (selected.action === 'gitHead' && selected.ref) {
    await compareWithGitRef(selected.ref, latexContext);
    return;
  }

  if (selected.action === 'gitRef') {
    const ref = await promptForGitRef(latexContext);
    if (!ref) {
      return;
    }

    await compareWithGitRef(ref, latexContext);
    return;
  }

  const previousFileUri = await promptForComparisonFile(latexContext);
  if (!previousFileUri) {
    return;
  }

  await compareWithFile(previousFileUri, latexContext);
}

async function promptForGitRef(existingContext?: LatexContext) {
  const latexContext = existingContext ?? await prepareLatexContext();
  if (!latexContext) {
    return undefined;
  }

  if (!(await isGitRepository(latexContext))) {
    vscode.window.showErrorMessage('This command requires a Git repository. Use "Compare with Another File..." for folder-based versions.');
    return undefined;
  }

  const picks: ComparePick[] = [
    {
      label: 'HEAD~1',
      description: 'Previous commit',
      action: 'gitRef',
      ref: 'HEAD~1',
    },
  ];

  const recentCommits = await getRecentCommits(latexContext);
  picks.push(...recentCommits);
  picks.push({
    label: 'Enter a Custom Git Ref...',
    description: 'Type a commit SHA, branch, tag, or expression like HEAD~2',
    action: 'gitRef',
  });

  const selected = await vscode.window.showQuickPick(picks, {
    placeHolder: 'Choose a Git ref to compare against',
  });

  if (!selected) {
    return undefined;
  }

  if (selected.ref) {
    return selected.ref;
  }

  const customRef = await vscode.window.showInputBox({
    prompt: 'Enter a Git ref (commit SHA, branch, tag, or expression like HEAD~2)',
    placeHolder: 'HEAD~1',
    value: 'HEAD~1',
    validateInput: (value) => value.trim() ? null : 'A Git ref is required.',
  });

  return customRef?.trim();
}

async function promptForComparisonFile(latexContext: LatexContext) {
  const selectedFiles = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(latexContext.rootPath),
    openLabel: 'Compare with This File',
    filters: {
      'TeX files': ['tex'],
    },
  });

  const selectedFile = selectedFiles?.[0];
  if (!selectedFile) {
    return undefined;
  }

  if (!isLatexPath(selectedFile.fsPath)) {
    vscode.window.showErrorMessage('Selected file must be a .tex document.');
    return undefined;
  }

  if (isSameFilePath(selectedFile.fsPath, latexContext.filePath)) {
    vscode.window.showErrorMessage('Select a different file to compare against the active document.');
    return undefined;
  }

  return selectedFile;
}

async function getRecentCommits(latexContext: LatexContext) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        'log',
        '--pretty=format:%H%x09%s',
        '-n',
        String(RECENT_COMMIT_LIMIT),
        '--',
        latexContext.relativeFilePath,
      ],
      {
        cwd: latexContext.rootPath,
        env: getExecEnv(),
      },
    );

    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, ...subjectParts] = line.split('\t');
        const subject = subjectParts.join('\t').trim() || 'No commit message';

        return {
          label: hash.slice(0, 8),
          description: subject,
          detail: hash,
          action: 'gitRef',
          ref: hash,
        } satisfies ComparePick;
      });
  } catch {
    return [];
  }
}

async function compareWithGitRef(commitId: string, existingContext?: LatexContext) {
  const latexContext = existingContext ?? await prepareLatexContext();
  if (!latexContext) {
    return;
  }

  if (!(await isGitRepository(latexContext))) {
    vscode.window.showErrorMessage('This file is not in a Git repository. Use "Compare with Another File..." instead.');
    return;
  }

  const config = vscode.workspace.getConfiguration('latexdiff');
  const outDirPath = resolveOutputDirectory(
    latexContext.rootPath,
    config.get<string>('outputDirectory') || DEFAULT_OUTPUT_DIRECTORY,
  );

  await fs.mkdir(outDirPath, { recursive: true });

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating latexdiff against ${commitId}`,
        cancellable: false,
      },
      async () => {
        const previousVersion = await execFileAsync(
          'git',
          ['show', `${commitId}:${latexContext.relativeFilePath}`],
          {
            cwd: latexContext.rootPath,
            env: getExecEnv(),
            maxBuffer: MAX_OUTPUT_BUFFER,
          },
        );

        const oldFileName = `${sanitizeLabel(latexContext.relativeFilePath)}_${sanitizeLabel(commitId)}_old.tex`;
        const oldFilePath = path.join(outDirPath, oldFileName);
        await fs.writeFile(oldFilePath, previousVersion.stdout);

        await generateAndCompileDiff({
          latexContext,
          previousFilePath: oldFilePath,
          comparisonLabel: commitId,
          config,
        });
      },
    );

    vscode.window.showInformationMessage(`Latexdiff compiled successfully against ${commitId}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Latexdiff Error: ${message}`);
  }
}

async function compareWithFile(previousFileUri: vscode.Uri, existingContext?: LatexContext) {
  const latexContext = existingContext ?? await prepareLatexContext();
  if (!latexContext) {
    return;
  }

  const config = vscode.workspace.getConfiguration('latexdiff');
  const comparisonLabel = getComparisonFileLabel(previousFileUri.fsPath, latexContext.rootPath);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating latexdiff against ${path.basename(previousFileUri.fsPath)}`,
        cancellable: false,
      },
      async () => {
        await generateAndCompileDiff({
          latexContext,
          previousFilePath: previousFileUri.fsPath,
          comparisonLabel,
          config,
        });
      },
    );

    vscode.window.showInformationMessage(`Latexdiff compiled successfully against ${path.basename(previousFileUri.fsPath)}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Latexdiff Error: ${message}`);
  }
}

async function generateAndCompileDiff(options: {
  latexContext: LatexContext;
  previousFilePath: string;
  comparisonLabel: string;
  config: vscode.WorkspaceConfiguration;
}) {
  const { latexContext, previousFilePath, comparisonLabel, config } = options;
  const executablePath = getExecutablePath(config);
  const outDirPath = resolveOutputDirectory(
    latexContext.rootPath,
    config.get<string>('outputDirectory') || DEFAULT_OUTPUT_DIRECTORY,
  );

  await fs.mkdir(outDirPath, { recursive: true });

  const diffFileName = `${path.parse(latexContext.filePath).name}_${sanitizeLabel(comparisonLabel)}_diff.tex`;
  const diffFilePath = path.join(outDirPath, diffFileName);

  const latexdiffResult = await execFileAsync(
    executablePath,
    [previousFilePath, latexContext.filePath],
    {
      cwd: latexContext.rootPath,
      env: getExecEnv(),
      maxBuffer: MAX_OUTPUT_BUFFER,
    },
  );

  await fs.writeFile(diffFilePath, latexdiffResult.stdout);

  const compiler = config.get<string>('compilerTool') || 'latexmk';
  const compilerCommand = getCompilerCommand(compiler, outDirPath, diffFilePath);
  await execFileAsync(compilerCommand.executable, compilerCommand.args, {
    cwd: latexContext.rootPath,
    env: getExecEnv(),
    maxBuffer: MAX_OUTPUT_BUFFER,
  });

  const pdfFilePath = path.join(outDirPath, `${path.parse(diffFileName).name}.pdf`);
  if (await fileExists(pdfFilePath)) {
    await vscode.env.openExternal(vscode.Uri.file(pdfFilePath));
  }
}

async function prepareLatexContext(existingContext?: LatexContext) {
  if (!(await ensureTrustedWorkspace())) {
    return undefined;
  }

  const latexContext = existingContext ?? getLatexContext();
  if (!latexContext) {
    return undefined;
  }

  if (!(await ensureDocumentSaved(latexContext.document))) {
    return undefined;
  }

  return latexContext;
}

async function ensureTrustedWorkspace() {
  if (vscode.workspace.isTrusted) {
    return true;
  }

  vscode.window.showWarningMessage(TRUST_REQUIRED_MESSAGE);
  return false;
}

async function ensureDocumentSaved(document: vscode.TextDocument) {
  if (!document.isDirty) {
    return true;
  }

  const saved = await document.save();
  if (saved) {
    return true;
  }

  vscode.window.showErrorMessage('Save the active LaTeX document before running latexdiff.');
  return false;
}

function getExecEnv() {
  const env = Object.assign({}, process.env);
  if (process.platform === 'darwin') {
    const additionalPaths = ['/Library/TeX/texbin', '/opt/homebrew/bin', '/usr/local/bin'];
    const currentPath = env.PATH || '';
    env.PATH = `${additionalPaths.join(':')}:${currentPath}`;
  }
  return env;
}

function getExecutablePath(config: vscode.WorkspaceConfiguration) {
  const configuredPath = config.get<string>('executablePath')?.trim();
  if (configuredPath) {
    return configuredPath;
  }

  return 'latexdiff';
}

async function isGitRepository(latexContext: LatexContext) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--is-inside-work-tree'],
      {
        cwd: latexContext.rootPath,
        env: getExecEnv(),
      },
    );

    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

function getLatexContext(editor = vscode.window.activeTextEditor, showErrors = true): LatexContext | undefined {
  if (!editor) {
    if (showErrors) {
      vscode.window.showErrorMessage('No active text editor found.');
    }

    return undefined;
  }

  const document = editor.document;
  if (!isLatexDocument(document)) {
    if (showErrors) {
      vscode.window.showErrorMessage('Active file is not a LaTeX document.');
    }

    return undefined;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    if (showErrors) {
      vscode.window.showErrorMessage('File must be part of a workspace.');
    }

    return undefined;
  }

  const relativeFilePath = path.relative(workspaceFolder.uri.fsPath, document.fileName);

  return {
    document,
    rootPath: workspaceFolder.uri.fsPath,
    filePath: document.fileName,
    relativeFilePath: relativeFilePath.split(path.sep).join('/'),
  };
}

function isLatexDocument(document: vscode.TextDocument) {
  return document.languageId === 'latex' || document.fileName.endsWith('.tex');
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function deactivate() {
  // VS Code calls this during shutdown; no explicit teardown is required.
}
