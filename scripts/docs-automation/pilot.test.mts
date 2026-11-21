import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { review } from './analyze.mts';
import { capturePatch, docPath, git, load, publish, read, run, save } from './pilot.mts';

const page = 'packages/docs/content/docs/example.md';
const added = page.replace('example', 'new');
const citation = (path: string, line = 2) => ({ path, line, note: 'Checked.' });
const evidence = [citation(page)];
const plan = { outcome: 'update-docs', pages: [page, added], evidence, questions: [], summary: 'Update.' };
const report = () => read(run + '/review.md');
const cwd = process.cwd();
const env = process.env;
let base: string;
let work: string;

beforeEach(() => {
  work = fs.mkdtempSync(join(tmpdir(), 'docs-pilot-'));
  process.chdir(work);
  process.env = { ...env, MODE: 'draft', GITHUB_OUTPUT: 'outputs', GITHUB_STEP_SUMMARY: 'summary', GITHUB_RUN_ID: '1' };
  fs.mkdirSync(dirname(docPath(page)), { recursive: true });
  fs.writeFileSync(docPath(page), '---\ntitle: Example\n---\n');
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base');
  base = git('rev-parse', 'HEAD').trim();
  fs.mkdirSync(run);
  save('context.json', { number: 42, repository: 'org/repo', base, assignee: 'author' });
});
afterEach(() => {
  process.chdir(cwd);
  process.env = env;
  fs.rmSync(work, { recursive: true, force: true });
});

function draft(sources: typeof evidence, findings: string[], edited = added): void {
  review((stage) => {
    if (stage === 'classify') return plan;
    if (stage === 'verify') return { findings, evidence: sources };
    fs.writeFileSync(docPath(edited), read(docPath(page)) + '\nUpdated.\n');
    return { notes: 'Added example.', questions: ['Which release?'] };
  });
}
function publication(existing = false): string {
  const calls: string[] = [];
  const pulls = existing ? [{ html_url: 'docs-pr', state: 'open', assignees: [] }] : [];
  publish(42, 'org/repo', (args) => {
    calls.push(args.join(' '));
    return args[1].includes('/pulls?') ? JSON.stringify(pulls) : '17';
  });
  return calls.join('\n');
}

for (const edited of [page, added]) {
  test(`review and publish a partial draft of ${edited}, including retries`, () => {
    process.env.MODE = 'classify';
    review(() => plan);
    assert.match(report(), /Documentation update recommended\.[\s\S]+Planned pages/);
    process.env.MODE = 'draft';
    draft([citation(edited), { ...citation(page), note: 'Duplicate.' }], ['Check rollout.'], edited);
    const result = report();
    assert.match(result, /Drafted 1 page\. 2 items need review\.[\s\S]+Address these items before merging\./);
    assert(result.includes('### Pages drafted\n\n- `' + edited + '`\n\n'));
    assert(result.includes('/blob/' + base + '/' + page + '#L2'));
    assert(result.includes('Draft line `' + edited + ':2`'));
    assert(!result.includes('Duplicate.'));
    assert.match(read('outputs'), /tree=[0-9a-f]{40}\nneeds_input=true\n$/);
    const tree = git('write-tree').trim();
    Object.assign(process.env, { MODE: 'open-pr', BASE_BRANCH: 'main', BUILD: 'success', DOCS_TREE: tree });
    git('init', '--bare', '-q', '../origin.git');
    git('remote', 'add', 'origin', '../origin.git');
    for (let attempt = 0; attempt < 2; attempt++) {
      git('checkout', '-q', '--detach', '-f', base);
      assert.match(publication(), /pr create .*--assignee author .*org\/repo\/actions\/runs\/1/);
      assert.equal(git('rev-parse', 'refs/remotes/origin/docs/automated-pr-42^{tree}').trim(), tree);
    }
    git('checkout', '-q', '--detach', '-f', base);
    fs.writeFileSync(run + '/docs.patch', read(run + '/docs.patch').replace('+Updated.', '+Different.'));
    assert.throws(() => publish(42, 'org/repo', () => '[]'), /Patch differs/);
  });
}

test('invalid citations, unsafe paths, and unplanned edits', () => {
  fs.symlinkSync(process.cwd(), dirname(docPath(page)) + '/link');
  for (const path of ['../x.md', 'link/x.md', 'sdk/x.md', 'api/fhir/resources/patient.md'])
    assert.throws(() => docPath(page.replace('example.md', path)));
  docPath(page.replace('example.md', 'api/fhir/resources/_index.md'));
  assert.throws(() => capturePatch([page], true), /plan/);
  const evidence = ['packages/docs', added, '.docs-run/context.json'].map((path) => citation(path, 1));
  evidence.push(citation(page, 4));
  assert.throws(() => review(() => ({ ...plan, evidence })), /needs evidence/);
  assert.throws(() => review(() => ({ ...plan, pages: 'unexpected' })));
});

test('an eight-finding verifier response keeps its last finding and missing-evidence warning', () => {
  const findings = Array.from({ length: 8 }, (_, i) => 'Check passage ' + i);
  draft([], findings);
  assert.deepEqual(load<{ findings: string[] }>('verification.json').findings, findings);
  assert(report().includes(findings[7]) && report().includes('The verifier cited no source.'));
});

test('a decision without a patch preserves code in the report and links to it from the source PR', () => {
  const code = '```tsx\nconst view = <Patient />; // @medplum/core\n```';
  const summary = 'Ask @author about <b>labels</b> and `<Patient />`.\n\n' + code;
  review(() => ({ ...plan, outcome: 'needs-human', pages: [], questions: ['Which default?'], summary }));
  assert(report().startsWith('**Documentation decision needed.**'));
  assert(report().includes('Ask @\u200bauthor about \\<b>labels\\</b> and `<Patient />`'));
  assert(report().includes(code) && read('outputs').endsWith('tree=\nneeds_input=true\n'));
  Object.assign(process.env, { MODE: 'open-pr', NEEDS_INPUT: 'true' });
  assert.match(publication(), /PATCH[\s\S]+Documentation decision needed[\s\S]+actions\/runs\/1/);
  Object.assign(process.env, { DOCS_TREE: base, BUILD: 'failure' });
  assert.match(publication(), /PATCH[\s\S]+build failed/);
  process.env.BUILD = 'success';
  assert.match(publication(true), /docs-pr[\s\S]+actions\/runs\/1[\s\S]+pr edit docs-pr --add-assignee author/);
});
