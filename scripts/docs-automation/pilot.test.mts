import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { review } from './analyze.mts';
import { capture, docPath, load, publish, read, run, save } from './pilot.mts';

const page = 'packages/docs/content/docs/example.md';
const plan = {
  outcome: 'update-docs',
  summary: 'Explain the default.',
  evidence: [page + ':2'],
  pages: [page, page.replace('example', 'other')],
  questions: [],
};
const cwd = process.cwd();
const env = process.env;
let work: string;

beforeEach(() => {
  work = fs.mkdtempSync(join(tmpdir(), 'docs-pilot-'));
  process.chdir(work);
  process.env = { ...env, MODE: 'draft', GITHUB_OUTPUT: 'outputs', GITHUB_STEP_SUMMARY: 'summary' };
  fs.mkdirSync(dirname(docPath(page)), { recursive: true });
  fs.writeFileSync(docPath(page), '---\ntitle: Example\n---\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: 'repo' });
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base');
  fs.mkdirSync(run);
  save('context.json', { number: 42, base: git('rev-parse', 'HEAD').toString().trim() });
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
  process.env.MODE = 'draft';
  review((stage, pages) => {
    if (stage === 'draft') {
      assert.deepEqual(pages, plan.pages);
      fs.appendFileSync(docPath(page), '\nNew behavior.\n');
      return { notes: 'Check rollout.', questions: ['Which release?'] };
    }
    assert.equal(stage, 'verify');
    return { evidence: [page + ':2'], findings: ['Check the default.'], examplesNeedExecution: true };
  });
  assert.match(read(run + '/docs.patch'), /\+New behavior\./);
  assert.equal(load<{ findings: string[] }>('verification.json').findings.length, 2);
  assert(read('outputs').endsWith('next=pr\n'));
  save('classification.json', { ...plan, outcome: 'needs-human', pages: [], questions: ['Which default?'] });
  review(() => assert.fail('Unexpected model call'));
  assert(read('outputs').endsWith('next=comment\n'));
});

test('edits must stay on planned, hand-written pages and citations must exist', () => {
  fs.symlinkSync(work, dirname(docPath(page)) + '/link');
  for (const name of ['../x.md', 'link/x.md', 'sdk/x.md', 'api/fhir/resources/patient.md']) {
    assert.throws(() => docPath('packages/docs/content/docs/' + name));
  }
  docPath('packages/docs/content/docs/api/fhir/resources/_index.md');
  assert.throws(() => capture([page], true), /plan/);
  assert.throws(() => review(() => ({ ...plan, evidence: [page + ':4'] })), /Invalid evidence/);
  assert.throws(() => review(() => ({ ...plan, pages: 'unexpected' })));
});

test('a failed build or existing PR updates only the source comment', () => {
  fs.writeFileSync(run + '/review.md', 'Check the option.');
  fs.mkdirSync('bin');
  fs.writeFileSync(
    'bin/gh',
    `#!/bin/sh
case "$2" in
  --paginate) echo 17 ;;
  --silent) echo "$@" >> ../comments ;;
  *pulls?state=all*) echo '[{"html_url":"existing-pr"}]' ;;
  *) exit 1 ;;
esac\n`,
    { mode: 0o755 }
  );
  Object.assign(process.env, {
    PATH: join(work, 'bin') + ':' + env.PATH,
    MODE: 'open-pr',
    NEXT: 'pr',
    BUILD: 'failure',
    GITHUB_RUN_ID: '1',
  });
  publish(42, 'org/repo');
  assert.match(read('comments'), /PATCH[\s\S]+build failed/);
  process.env.BUILD = 'success';
  publish(42, 'org/repo');
  assert.match(read('comments'), /Existing documentation PR: existing-pr/);
});
