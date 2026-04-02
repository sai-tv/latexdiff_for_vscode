import * as assert from 'assert';
import * as path from 'path';
import {
  getComparisonFileLabel,
  getCompilerCommand,
  isLatexPath,
  isPathInsideRoot,
  isSameFilePath,
  resolveOutputDirectory,
  sanitizeLabel,
} from '../../helpers';

suite('Extension Test Suite', () => {
  test('resolveOutputDirectory keeps output inside the workspace', () => {
    const rootPath = path.join(path.sep, 'workspace', 'paper');

    assert.strictEqual(
      resolveOutputDirectory(rootPath, '.latexdiff'),
      path.join(rootPath, '.latexdiff'),
    );

    assert.strictEqual(
      resolveOutputDirectory(rootPath, 'artifacts/diff'),
      path.join(rootPath, 'artifacts', 'diff'),
    );
  });

  test('resolveOutputDirectory rejects traversal outside the workspace', () => {
    const rootPath = path.join(path.sep, 'workspace', 'paper');

    assert.throws(
      () => resolveOutputDirectory(rootPath, '../outside'),
      /must stay inside the current workspace folder/,
    );
  });

  test('isPathInsideRoot only accepts paths within the workspace', () => {
    const rootPath = path.join(path.sep, 'workspace', 'paper');

    assert.strictEqual(
      isPathInsideRoot(rootPath, path.join(rootPath, 'drafts', 'main.tex')),
      true,
    );
    assert.strictEqual(
      isPathInsideRoot(rootPath, path.join(rootPath, '..', 'other', 'main.tex')),
      false,
    );
  });

  test('getComparisonFileLabel prefers workspace-relative labels', () => {
    const rootPath = path.join(path.sep, 'workspace', 'paper');

    assert.strictEqual(
      getComparisonFileLabel(path.join(rootPath, 'versions', 'v1', 'main.tex'), rootPath),
      'versions/v1/main.tex',
    );
    assert.strictEqual(
      getComparisonFileLabel(path.join(path.sep, 'tmp', 'snapshot.tex'), rootPath),
      'snapshot.tex',
    );
  });

  test('path and label helpers normalize expected values', () => {
    assert.strictEqual(sanitizeLabel('sections/chapter 1.tex'), 'sections_chapter_1.tex');
    assert.strictEqual(isLatexPath('paper.TEX'), true);
    assert.strictEqual(
      isSameFilePath(path.join('paper', '.', 'main.tex'), path.join('paper', 'main.tex')),
      true,
    );
  });

  test('getCompilerCommand returns expected arguments', () => {
    const outputDirectory = path.join(path.sep, 'workspace', 'paper', '.latexdiff');
    const diffFilePath = path.join(outputDirectory, 'main_diff.tex');

    assert.deepStrictEqual(
      getCompilerCommand('latexmk', outputDirectory, diffFilePath),
      {
        executable: 'latexmk',
        args: ['-pdf', '-interaction=nonstopmode', `-output-directory=${outputDirectory}`, diffFilePath],
      },
    );
    assert.deepStrictEqual(
      getCompilerCommand('tectonic', outputDirectory, diffFilePath),
      {
        executable: 'tectonic',
        args: ['-o', outputDirectory, diffFilePath],
      },
    );
  });
});
