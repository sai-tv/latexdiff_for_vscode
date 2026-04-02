import * as fs from 'fs';
import * as path from 'path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

const TEST_VSCODE_VERSION = '1.80.0';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const vscodeExecutablePath = await resolveTestExecutablePath();

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath
    });
  } catch (err) {
    console.error('Failed to run tests');
    console.error(err);
    process.exit(1);
  }
}

async function resolveTestExecutablePath() {
  const downloadedExecutablePath = await downloadAndUnzipVSCode(TEST_VSCODE_VERSION);

  if (process.platform !== 'darwin') {
    return downloadedExecutablePath;
  }

  const macOsDirectory = path.dirname(downloadedExecutablePath);
  const preferredExecutablePath = path.join(macOsDirectory, 'Code');

  if (path.basename(downloadedExecutablePath) === 'Electron' && fs.existsSync(preferredExecutablePath)) {
    return preferredExecutablePath;
  }

  return downloadedExecutablePath;
}

main();
