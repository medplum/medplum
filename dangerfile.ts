import { danger, message, warn } from 'danger';
import { statSync } from 'fs';

// Keep package-lock.json up to date
// See: https://danger.systems/js/
const packageChanged = danger.git.modified_files.includes('package.json');
const lockfileChanged = danger.git.modified_files.includes('package-lock.json');
if (packageChanged && !lockfileChanged) {
  const message = 'Changes were made to package.json, but not to package-lock.json';
  const idea = 'Perhaps you need to run `npm install`?';
  warn(`${message} - <i>${idea}</i>`);
}

// Show the size of minified JS output
message(`@medplum/core: ${(statSync('packages/core/dist/cjs/index.cjs').size / 1024).toFixed(1)} kB`);
message(`@medplum/react: ${(statSync('packages/react/dist/cjs/index.cjs').size / 1024).toFixed(1)} kB`);
