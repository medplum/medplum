import { execSync } from 'child_process';
import { danger, message, warn } from 'danger';
import { readFileSync, statSync } from 'fs';

// Gather changes
const modifiedFiles = danger.git.modified_files ?? [];
if (!modifiedFiles.length) {
  warn('No files were modified by this PR. Make sure this is expected!');
}
const modifiedSourceFiles = modifiedFiles.filter((path) => /\/src\/.+\.tsx?/.exec(path));

// Keep package-lock.json up to date
// See: https://danger.systems/js/
const packageChanged = modifiedFiles.includes('package.json');
const lockfileChanged = modifiedFiles.includes('package-lock.json');
if (packageChanged && !lockfileChanged) {
  const message = 'Changes were made to package.json, but not to package-lock.json';
  const idea = 'Perhaps you need to run `npm install`?';
  warn(`${message} - <i>${idea}</i>`);
}

// Check for console.log statements
const statements = ['console.debug', 'describe.only', 'test.only'];
modifiedSourceFiles.forEach((file) => {
  const content = readFileSync(file).toString();
  for (const statement of statements) {
    if (content.includes(statement)) {
      fail(`A \`${statement}\` was left in file (${file})`);
    }
  }
});

// Show the size of minified JS output
message(`@medplum/core: ${getAssetSizeStats('packages/core/dist/cjs/index.cjs')}`);
message(`@medplum/react: ${getAssetSizeStats('packages/react/dist/cjs/index.cjs')}`);

function getAssetSizeStats(filename: string): string {
  const originalStats = statSync(filename);
  execSync(`gzip -c ${filename} > ${filename}.gz`);
  const gzippedStats = statSync(`${filename}.gz`);
  return `${(originalStats.size / 1024).toFixed(1)} kB (${(gzippedStats.size / 1024).toFixed(1)} kB gzip)`;
}
