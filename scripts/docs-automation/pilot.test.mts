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
  save('context.json', {
    number: 42,
    repository: 'org/repo',
    assignee: 'source-author',
    base: git('rev-parse', 'HEAD').trim(),
  });
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
  assert.match(read(run + '/review.md'), /Documentation update recommended\.[\s\S]*### Planned pages/);
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
  const report = read(run + '/review.md');
  assert(report.startsWith('**Drafted 1 page. 3 items need review.**\n\n### Needs attention'));
  assert(report.includes('Address these items before merging.'));
  assert(report.includes(`/blob/${git('rev-parse', 'HEAD').trim()}/${page}#L2`));
  assert(report.includes(`[Draft line \`${page}:2\`]`));
  assert(report.includes(`### Pages drafted\n\n- \`${page}\``));
  assert(!report.includes(plan.pages[1]));
  assert(report.includes('<details><summary>Evidence</summary>'));
  assert.match(read('outputs'), /tree=[0-9a-f]{40}\nneeds_input=true\n$/);
  const tree = git('write-tree').trim();
  git('read-tree', 'HEAD');
  fs.writeFileSync(run + '/docs.patch', read(run + '/docs.patch').replace('+New behavior.', '+Different content.'));
  Object.assign(process.env, { MODE: 'open-pr', BUILD: 'success', DOCS_TREE: tree });
  assert.throws(() => publish(42, 'org/repo', () => '[]'), /Patch differs from the reviewed docs tree/);
  save('classification.json', { ...plan, outcome: 'needs-human', pages: [], questions: ['Which default?'] });
  review(() => assert.fail('Unexpected model call'));
  assert(read('outputs').endsWith('tree=\nneeds_input=true\n'));
  assert(read(run + '/review.md').startsWith('**Documentation decision needed.**\n\n### Needs attention'));
});

test('publication links new pages to the draft commit, including when it reuses an existing branch', () => {
  const added = plan.pages[1];
  const base = git('rev-parse', 'HEAD').trim();
  review((stage) => {
    if (stage === 'classify') return { ...plan, pages: [added] };
    if (stage === 'verify')
      return { findings: [], evidence: [page, added].map((path) => ({ path, line: 1, note: 'Checked.' })) };
    fs.copyFileSync(docPath(page), docPath(added));
    return { notes: 'Added a page.', questions: [] };
  });
  const report = read(run + '/review.md');
  const blob = 'https://github.com/org/repo/blob/';
  assert(report.includes(`${blob}${base}/${page}#L1`));
  assert(report.includes(`[Draft line \`${added}:1\`]`));
  assert(!report.includes(`${blob}${base}/${added}`));
  assert(!report.includes('Address these items'));
  Object.assign(process.env, {
    MODE: 'open-pr',
    BASE_BRANCH: 'main',
    BUILD: 'success',
    DOCS_TREE: git('write-tree').trim(),
  });
  git('init', '--bare', '-q', '../origin.git');
  git('remote', 'add', 'origin', '../origin.git');
  for (let attempt = 0; attempt < 2; attempt++) {
    // Each publish job starts from the same clean checkout; the second finds the branch already pushed.
    git('checkout', '-q', '--detach', '-f', base);
    let body = '';
    publish(42, 'org/repo', (args, input) => {
      if (args[1].includes('/pulls?')) return '[]';
      if (args[1] === 'create') body = input!;
      return '';
    });
    const sha = git('rev-parse', 'refs/remotes/origin/docs/automated-pr-42').trim();
    assert.notEqual(sha, base);
    assert(body.includes(`[Draft line \`${added}:1\`]: ${blob}${sha}/${added}#L1`));
  }
});

test('the report preserves inline and fenced code, and escapes HTML and mentions in prose', () => {
  const example = '```tsx\nconst view = <Patient />; // @medplum/core\n```';
  const summary = 'Ask @reviewer about <b>labels</b>. Use `label ?? <AppointmentPatientName/>` and `@medplum/core`.';
  review(() => ({ ...plan, outcome: 'no-docs', pages: [], summary: summary + '\n\n' + example }));
  const report = read(run + '/review.md');
  assert(report.includes('Ask @\u200breviewer about \\<b>labels\\</b>.'));
  assert(report.includes('`label ?? <AppointmentPatientName/>` and `@medplum/core`'));
  assert(report.includes(example));
  assert(!report.includes('### Needs attention'));
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

test('a full verifier response keeps its overflow notice and still reports missing evidence', () => {
  const findings = Array.from({ length: 7 }, (_, i) => `Fix passage ${i + 1}.`);
  findings.push('Review is incomplete. Check the remaining examples on the operation page.');
  review((stage) => {
    if (stage === 'classify') return { ...plan, pages: [page] };
    if (stage === 'verify') return { findings, evidence: [] };
    fs.appendFileSync(docPath(page), '\nNew behavior.\n');
    return { notes: 'Added an example.', questions: [] };
  });
  assert.deepEqual(load<{ findings: string[] }>('verification.json').findings, findings);
  const report = read(run + '/review.md');
  assert(report.includes(findings[7]));
  assert(report.includes('The verifier cited no source.'));
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
  assert(
    calls
      .at(-2)!
      .at(-1)!
      .includes('Existing documentation PR: existing-pr\n\n[Workflow run](https://github.com/org/repo/actions/runs/1)')
  );
  assert.deepEqual(calls.at(-1), ['pr', 'edit', 'existing-pr', '--add-assignee', 'source-author']);
});
