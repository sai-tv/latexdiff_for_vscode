import * as path from 'path';

export const DEFAULT_OUTPUT_DIRECTORY = '.latexdiff';

export type CompilerCommand = {
  executable: string;
  args: string[];
};

export function resolveOutputDirectory(rootPath: string, configuredPath: string) {
  const trimmedPath = configuredPath.trim();
  const requestedPath = trimmedPath || DEFAULT_OUTPUT_DIRECTORY;
  const resolvedPath = path.resolve(rootPath, requestedPath);

  if (!isPathInsideRoot(rootPath, resolvedPath)) {
    throw new Error('latexdiff.outputDirectory must stay inside the current workspace folder.');
  }

  return resolvedPath;
}

export function isPathInsideRoot(rootPath: string, candidatePath: string) {
  const normalizedRoot = normalizeForComparison(rootPath);
  const normalizedCandidate = normalizeForComparison(candidatePath);
  const relativePath = path.relative(normalizedRoot, normalizedCandidate);

  if (!relativePath) {
    return true;
  }

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export function getComparisonFileLabel(filePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, filePath);
  if (relativePath && isPathInsideRoot(rootPath, filePath)) {
    return relativePath.split(path.sep).join('/');
  }

  return path.basename(filePath);
}

export function sanitizeLabel(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export function isLatexPath(filePath: string) {
  return filePath.toLowerCase().endsWith('.tex');
}

export function isSameFilePath(leftPath: string, rightPath: string) {
  return normalizeForComparison(leftPath) === normalizeForComparison(rightPath);
}

export function getCompilerCommand(compiler: string, outDirPath: string, diffFilePath: string): CompilerCommand {
  if (compiler === 'pdflatex') {
    return {
      executable: 'pdflatex',
      args: ['-interaction=nonstopmode', `-output-directory=${outDirPath}`, diffFilePath],
    };
  }

  if (compiler === 'tectonic') {
    return {
      executable: 'tectonic',
      args: ['-o', outDirPath, diffFilePath],
    };
  }

  return {
    executable: 'latexmk',
    args: ['-pdf', '-interaction=nonstopmode', `-output-directory=${outDirPath}`, diffFilePath],
  };
}

function normalizeForComparison(filePath: string) {
  const normalizedPath = path.resolve(filePath);

  if (process.platform === 'win32') {
    return normalizedPath.toLowerCase();
  }

  return normalizedPath;
}
