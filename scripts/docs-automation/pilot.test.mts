import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { review } from './analyze.mts';
import { capturePatch, docPath, load, publish, read, run, save } from './pilot.mts';

const page = 'packages/docs/content/docs/example.md';
const plan = {
  outcome: 'update-docs',
  summary: 'Explain the default.',
  evidence: [
    { path: page, line: 2, note: 'Sets the title.' },
    { path: '.docs-run/docs.patch', line: 1, note: 'Run artifact.' },
  ],
  pages: [page, page.replace('example', 'other')],
  questions: [],
};
const git = (...args: string[]): string => execFileSync('git', args, { cwd: 'repo', encoding: 'utf8' });
const cwd = process.cwd();
const env = process.env;
let work: string;

beforeEach(() => {
  work = fs.mkdtempSync(join(tmpdir(), 'docs-pilot-'));
  process.chdir(work);
  process.env = { ...env, MODE: 'draft', GITHUB_OUTPUT: 'outputs', GITHUB_STEP_SUMMARY: 'summary' };
  fs.mkdirSync(dirname(docPath(page)), { recursive: true });
  fs.writeFileSync(docPath(page), '---\ntitle: Example\n---\n');
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base');
  fs.mkdirSync(run);
  save('context.json', { number: 42, assignee: 'source-author', base: git('rev-parse', 'HEAD').trim() });
});
afterEach(() => {
  process.env = env;
  process.chdir(cwd);
  fs.rmSync(work, { recursive: true, force: true });
});

test('classify stops at the plan, drafts with open questions get reviewed, and questions alone request a comment', () => {
  process.env.MODE = 'classify';
  review((stage) => {
    assert.equal(stage, 'classify');
    return plan;
  });
  assert(!fs.existsSync(run + '/docs.patch'));
  assert.deepEqual(load<typeof plan>('classification.json').evidence, [plan.evidence[0]]);
  process.env.MODE = 'draft';
  review((stage, pages) => {
    if (stage === 'draft') {
      assert.deepEqual(pages, plan.pages);
      fs.appendFileSync(docPath(page), '\nNew behavior.\n');
      return { notes: 'Check rollout.', questions: ['Which release?'] };
    }
    assert.equal(stage, 'verify');
    return { evidence: [plan.evidence[0]], findings: ['Check the default.', 'Run the inline example.'] };
  });
  assert.match(read(run + '/docs.patch'), /\+New behavior\./);
  assert.equal(load<{ findings: string[] }>('verification.json').findings.length, 2);
  assert.match(read('outputs'), /tree=[0-9a-f]{40}\nneeds_input=true\n$/);
  const tree = git('write-tree').trim();
  git('read-tree', 'HEAD');
  fs.writeFileSync(run + '/docs.patch', read(run + '/docs.patch').replace('+New behavior.', '+Different content.'));
  Object.assign(process.env, { MODE: 'open-pr', BUILD: 'success', DOCS_TREE: tree });
  assert.throws(() => publish(42, 'org/repo', () => '[]'), /Patch differs from the reviewed docs tree/);
  save('classification.json', { ...plan, outcome: 'needs-human', pages: [], questions: ['Which default?'] });
  review(() => assert.fail('Unexpected model call'));
  assert(read('outputs').endsWith('tree=\nneeds_input=true\n'));
});

test('edits must stay on planned, hand-written pages and citations must exist', () => {
  fs.symlinkSync(work, dirname(docPath(page)) + '/link');
  for (const name of ['../x.md', 'link/x.md', 'sdk/x.md', 'api/fhir/resources/patient.md']) {
    assert.throws(() => docPath('packages/docs/content/docs/' + name));
  }
  docPath('packages/docs/content/docs/api/fhir/resources/_index.md');
  assert.throws(() => capturePatch([page], true), /plan/);
  const missing = { path: page, line: 4, note: 'Past the end.' };
  const absent = { path: 'packages/docs/missing.md', line: 1, note: 'No such file.' };
  const folder = { path: 'packages/docs', line: 1, note: 'A directory.' };
  assert.throws(() => review(() => ({ ...plan, evidence: [missing, absent, folder] })), /needs evidence/);
  assert.throws(() => review(() => ({ ...plan, pages: 'unexpected' })));
});

test('a failed build updates the comment and a retry recovers an unassigned PR', () => {
  fs.writeFileSync(run + '/review.md', 'Check the option.');
  const calls: string[][] = [];
  function github(args: string[]): string {
    calls.push(args);
    if (args[1] === '--paginate') return '17';
    if (args[1].includes('/pulls?')) return JSON.stringify([{ html_url: 'existing-pr', state: 'open', assignees: [] }]);
    if (args[1] === '--silent' || args[1] === 'edit') return '';
    return assert.fail('Unexpected GitHub command: ' + args.join(' '));
  }
  Object.assign(process.env, { MODE: 'open-pr', DOCS_TREE: 'a'.repeat(40), BUILD: 'failure', GITHUB_RUN_ID: '1' });
  publish(42, 'org/repo', github);
  assert.match(calls.at(-1)!.join(' '), /PATCH[\s\S]+build failed/);
  process.env.BUILD = 'success';
  publish(42, 'org/repo', github);
  assert.match(calls.at(-2)!.join(' '), /Existing documentation PR: existing-pr/);
  assert.deepEqual(calls.at(-1), ['pr', 'edit', 'existing-pr', '--add-assignee', 'source-author']);
});
