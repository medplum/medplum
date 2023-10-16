import { danger, message, warn } from 'danger';

// Print modified files
// See: https://danger.systems/js/guides/getting_started#creating-a-dangerfile
const modifiedMarkdown = danger.git.modified_files.join('- ');
message('Changed Files in this PR: \n - ' + modifiedMarkdown);

// Keep package-lock.json up to date
// See: https://danger.systems/js/
const packageChanged = danger.git.modified_files.includes('package.json');
const lockfileChanged = danger.git.modified_files.includes('package-lock.json');
if (packageChanged && !lockfileChanged) {
  const message = 'Changes were made to package.json, but not to package-lock.json';
  const idea = 'Perhaps you need to run `npm install`?';
  warn(`${message} - <i>${idea}</i>`);
}
