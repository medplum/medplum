import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  allowedDoc,
  args,
  checkDraftedFiles,
  config,
  landedDiff,
  normalizePaths,
  reviewQuestions,
  sourceNumber,
  structuredResult,
  validateClassification,
} from './run.ts';
import type { Classification, Draft, Verification } from './schema.ts';
import { schemas, validateSchema } from './schema.ts';

const temps: string[] = [];
const page = 'packages/docs/content/docs/bots/example.md';
const code = 'packages/core/src/example.ts';
const original = '---\ntitle: Example\n---\n\nOriginal guidance.\n';
const content = '---\ntitle: Example\n---\n\nUpdated guidance.\n';
function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'docs-automation-'));
  temps.push(root);
  return root;
}
function workspace(root = tempDir()): string {
  edit(root, page, original);
  edit(root, code, 'export const example = true;\n');
  return root;
}
function classification(): Classification {
  return {
    outcome: 'update-docs',
    rationale: 'The behavior changed.',
    userImpact: 'A new documented option is available.',
    evidence: [{ path: code, line: 1, reason: 'Implementation' }],
    changes: [{ path: page, action: 'update', purpose: 'Explain changed behavior' }],
    questions: [],
  };
}
function draft(): Draft {
  return { notes: 'Updated prose.', questions: [] };
}
function verification(): Verification {
  return {
    verdict: 'ready',
    findings: [],
    evidence: [{ path: code, line: 1, reason: 'Implementation' }],
    examples: 'none',
    availability: 'Existing supported behavior; no release claim.',
  };
}
function controller() {
  const base = tempDir();
  const root = workspace(join(base, 'repo'));
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  git('init', '-qb', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const run = join(base, '.docs-run');
  mkdirSync(run);
  const write = (name: string, data: unknown): void => writeFileSync(join(run, name), JSON.stringify(data));
  write('context.json', { mode: 'draft', baseSha: git('rev-parse', 'HEAD').trim() });
  const output = join(base, 'outputs');
  const command = (stage: string, result?: unknown, env: Record<string, string> = {}): void => {
    const execution = join(base, 'execution.json');
    writeFileSync(
      execution,
      JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, structured_output: result }])
    );
    execFileSync(process.execPath, [fileURLToPath(new URL('./run.ts', import.meta.url)), stage], {
      cwd: base,
      env: { ...process.env, GITHUB_OUTPUT: output, EXECUTION_FILE: execution, ...env },
      stdio: 'pipe',
    });
  };
  return { base, root, run, git, write, output, command };
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('accepts PR numbers and rejects command/URL/option injection', () => {
  assert.equal(sourceNumber('11443'), 11443);
  for (const value of ['', '0', '-1', '1; touch /tmp/a', '$(env)', '1\n2', 'https://github.com/org/repo/pull/1']) {
    assert.throws(() => sourceNumber(value));
  }
});
test('accepts xhigh effort and rejects invalid configuration', () => {
  const effort = config.effort;
  try {
    config.effort = 'xhigh';
    assert.match(args('draft'), /--effort xhigh/);
    config.effort = 'anything';
    assert.throws(() => args('draft'));
  } finally {
    config.effort = effort;
  }
});
test('uses landed contents despite changed context or merge-time edits, and rejects partial file coverage', () => {
  const { root, git } = controller();
  const base = git('rev-parse', 'HEAD').trim();
  git('checkout', '-qb', 'feature');
  writeFileSync(join(root, code), 'export const example = false;\n');
  git('commit', '-qam', 'first change');
  const first = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(root, page), content);
  git('commit', '-qam', 'second change');
  const head = git('rev-parse', 'HEAD').trim();
  const files = [code, page];
  const otherPr = (): boolean => false;
  git('checkout', '-q', 'main');
  writeFileSync(join(root, 'unrelated.txt'), 'Another PR landed first.\n');
  writeFileSync(join(root, page), original.replace('title: Example', 'title: Renamed'));
  git('add', '.');
  git('commit', '-qm', 'unrelated change');
  const newBase = git('rev-parse', 'HEAD').trim();
  git('merge', '--squash', 'feature');
  writeFileSync(join(root, code), 'export const example = false; // Reconciled at merge time.\n');
  git('add', '.');
  git('commit', '-qm', 'squashed PR');
  const squash = git('rev-parse', 'HEAD').trim();
  assert.equal(landedDiff(root, squash, head, files, otherPr)?.diff, git('diff', newBase, squash));
  assert.equal(landedDiff(root, squash, head, [page], otherPr), undefined);
  git('checkout', '-qb', 'rebased', newBase);
  git('cherry-pick', first, head);
  assert.equal(landedDiff(root, git('rev-parse', 'HEAD').trim(), head, files, otherPr), undefined);
  // A real merge can resolve a conflict differently from the PR's original patch.
  git('checkout', '-qb', 'merged', newBase);
  writeFileSync(join(root, page), original.replace('Original guidance.', 'Guidance from main.'));
  git('commit', '-qam', 'main edit');
  assert.throws(() => git('merge', '--no-ff', '--no-commit', 'feature'));
  writeFileSync(join(root, page), content + '\nResolved while merging.\n');
  git('add', '.');
  git('commit', '-qm', 'merge PR');
  const merge = git('rev-parse', 'HEAD').trim();
  assert.match(landedDiff(root, merge, head, files, otherPr)?.diff ?? '', /Resolved while merging/);
  assert.equal(landedDiff(root, merge, base, files, otherPr), undefined);
});
test('rejects the last rebase commit even when every commit touches the same file', () => {
  const { root, git } = controller();
  writeFileSync(join(root, page), content);
  git('commit', '-qam', 'first rebased commit');
  const parent = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(root, page), content + '\nAnother change to the same page.\n');
  git('commit', '-qam', 'last rebased commit');
  const head = git('rev-parse', 'HEAD').trim();
  let checked = false;
  assert.equal(
    landedDiff(root, head, head, [page], (sha) => {
      assert.equal(sha, parent);
      checked = true;
      return true;
    }),
    undefined
  );
  assert.ok(checked);
});
test('rename coverage includes both the old and new paths', () => {
  const { root, git } = controller();
  const renamed = 'packages/docs/content/docs/bots/renamed.md';
  git('mv', page, renamed);
  git('commit', '-qm', 'rename page');
  const sha = git('rev-parse', 'HEAD').trim();
  const change = landedDiff(root, sha, sha, [page, renamed], () => false);
  assert.deepEqual(change?.files.sort(), [page, renamed].sort());
  assert.match(change?.diff ?? '', /rename from/);
});
test('write scope excludes code, generated reference, decision guides, and traversal', () => {
  for (const path of [
    page,
    'packages/docs/assets/fhir/resources/patient.md',
    'packages/docs/content/docs/api/_index.md',
    'packages/docs/content/docs/api/fhir/operations/user-update-email.md',
    'packages/docs/content/docs/api/fhir/overview.md',
    'packages/docs/content/docs/api/auth/resetpassword.md',
    'packages/docs/content/docs/api/oauth/token.md',
    'packages/docs/content/docs/api/project-admin/invite.md',
    'packages/docs/content/docs/api/scim/users.md',
    ...['resources', 'datatypes', 'medplum'].map(
      (section) => `packages/docs/content/docs/api/fhir/${section}/_index.md`
    ),
  ])
    assert.equal(allowedDoc(path), true, path);
  for (const path of [
    '/etc/passwd',
    '../file.md',
    'packages/docs/content/docs/../evil.md',
    'packages/docs/content/docs/sdk/client.md',
    'packages/docs/content/docs/api/fhir/resources/patient.md',
    'packages/docs/content/docs/api/fhir/datatypes/reference.md',
    'packages/docs/content/docs/api/fhir/medplum/user.md',
    'packages/docs/content/docs/api/fhir/resources.md',
    'packages/docs/content/docs/api/fhir/resources/patient/index.md',
    'packages/docs/content/docs/api/fhir/_content.gotmpl',
    'packages/docs/content/docs/decision-guides/access.md',
    '.github/workflows/change.yml',
    'packages/core/src/example.ts',
    'packages/docs/content/docs/a\\b.md',
  ])
    assert.equal(allowedDoc(path), false, path);
});
test('classification requires valid local evidence and concrete coverage', () => {
  const root = workspace();
  validateClassification(root, classification());
  assert.throws(() => validateClassification(root, { ...classification(), evidence: [] }));
  assert.throws(() =>
    validateClassification(root, { ...classification(), evidence: [{ path: code, line: 999, reason: 'Invalid' }] })
  );
  assert.throws(() => validateClassification(root, { ...classification(), outcome: 'already-covered', changes: [] }));
  validateClassification(root, {
    ...classification(),
    outcome: 'already-covered',
    changes: [],
    evidence: [{ path: page, line: 5, reason: 'Coverage' }],
  });
  assert.throws(() =>
    validateClassification(root, { ...classification(), changes: [], questions: ['Unknown behavior'] })
  );
  assert.throws(() =>
    validateClassification(root, { ...classification(), outcome: 'needs-human', changes: [], questions: [] })
  );
  assert.throws(() =>
    validateClassification(root, {
      ...classification(),
      outcome: 'no-docs',
      changes: [],
      questions: ['Unclear impact'],
    })
  );
});
test('extracts only successful structured results without leaking the execution transcript', () => {
  const result = { type: 'result', subtype: 'success', is_error: false, structured_output: draft() };
  assert.deepEqual(structuredResult([{ type: 'assistant', message: 'Private scratch work' }, result]), draft());
  for (const messages of [
    {},
    [],
    [{ ...result, subtype: 'error_max_turns' }],
    [{ ...result, is_error: true }],
    [{ ...result, structured_output: undefined }],
  ])
    assert.throws(() => structuredResult(messages));
});
test('unknown and malformed structured output fails closed', () => {
  for (const value of [
    null,
    {},
    { ...classification(), outcome: 'probably-fine' },
    { ...classification(), publish: true },
  ]) {
    assert.throws(() => validateSchema(value, schemas.classify));
  }
  assert.throws(() => validateSchema({ ...classification(), changes: 'anything' }, schemas.classify));
});
test('agent paths drop the repo/ prefix and run-artifact evidence', () => {
  const normalized = normalizePaths({
    ...verification(),
    evidence: [
      { path: `repo/${code}`, line: 1, reason: 'Prefixed' },
      { path: '.docs-run/docs.patch', line: 13, reason: 'Artifact' },
    ],
  });
  assert.deepEqual(normalized.evidence, [{ path: code, line: 1, reason: 'Prefixed' }]);
  const plan = normalizePaths({
    ...classification(),
    changes: [{ path: `repo/${page}`, action: 'update', purpose: 'x' }],
  });
  assert.equal(plan.changes[0].path, page);
  assert.deepEqual(normalizePaths(draft()), draft());
});
function edit(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function stagePatch(root: string, git: (...args: string[]) => string, run: string, files: [string, string][]): void {
  for (const [path, text] of files) edit(root, path, text);
  git('add', '-A');
  writeFileSync(join(run, 'docs.patch'), git('diff', '--cached'));
  git('reset', '-q', '--hard');
  git('clean', '-qfd');
}
test('only the draft stage can edit, and only its planned files', () => {
  const draftArgs = args('draft', [page]);
  assert.match(draftArgs, /--tools Read,Glob,Grep,Edit,Write /);
  assert.ok(draftArgs.includes(`--allowedTools 'Read,Glob,Grep,Edit(repo/${page})'`));
  assert.doesNotMatch(args('classify'), /Edit|Write/);
  assert.doesNotMatch(args('verify'), /Edit|Write/);
  assert.throws(() => args('verify', [page]));
  assert.throws(() => args('draft', [code]));
});
test('drafted files must match the plan, stay in scope, and pass content checks', () => {
  const { root, git } = controller();
  const reset = (): void => {
    git('checkout', '-q', '--', '.');
    git('clean', '-qfd');
  };
  assert.throws(() => checkDraftedFiles(root, classification(), draft()));
  edit(root, page, content);
  assert.deepEqual(checkDraftedFiles(root, classification(), draft()), [page]);
  const twoPages: Classification = {
    ...classification(),
    changes: [
      ...classification().changes,
      { path: 'packages/docs/content/docs/bots/other.md', action: 'create', purpose: 'x' },
    ],
  };
  assert.deepEqual(checkDraftedFiles(root, twoPages, { ...draft(), questions: ['The second page was too long.'] }), [
    page,
  ]);
  assert.throws(() => checkDraftedFiles(root, twoPages, draft()));
  for (const [path, text] of [
    ['packages/docs/content/docs/unplanned.md', content],
    [code, 'export const example = false;\n'],
    [page, '# Missing front matter'],
    [page, content + '<script>alert(1)</script>'],
    [page, content + '<iframe src="https://example.com"></iframe>'],
    [page, content + 'x'.repeat(160001)],
  ]) {
    reset();
    edit(root, page, content);
    edit(root, path, text);
    assert.throws(() => checkDraftedFiles(root, classification(), draft()), Error, path);
  }
  reset();
  edit(root, page, content);
  symlinkSync(tmpdir(), join(root, 'packages/docs/content/docs/escape'));
  assert.throws(() => checkDraftedFiles(root, classification(), draft()));
});
test('hand-written API updates allow optional collapsible examples', () => {
  const { root, git } = controller();
  const path = 'packages/docs/content/docs/api/fhir/operations/user-update-email.md';
  edit(root, path, original);
  git('add', '.');
  git('commit', '-qm', 'API page');
  const plan: Classification = {
    ...classification(),
    changes: [{ path, action: 'update', purpose: 'Explain the response' }],
  };
  validateClassification(root, plan);
  edit(
    root,
    path,
    content +
      '\n<details>\n<summary>Example Response</summary>\n\n```json\n{"emailVerified": false}\n```\n\n</details>\n'
  );
  assert.deepEqual(checkDraftedFiles(root, plan, draft()), [path]);
});
test('symlinked output directories cannot escape the docs tree', () => {
  const root = workspace();
  symlinkSync(tmpdir(), join(root, 'packages/docs/content/docs/escape'));
  const path = 'packages/docs/content/docs/escape/page.md';
  assert.throws(() =>
    validateClassification(root, { ...classification(), changes: [{ path, action: 'create', purpose: 'Escape' }] })
  );
});
test('needs-input drafts give the reviewer a reason', () => {
  const questions = (changes: Partial<Verification>): string[] =>
    reviewQuestions(classification(), draft(), { ...verification(), ...changes });
  assert.deepEqual(questions({}), []);
  assert.match(questions({ examples: 'requires-execution' })[0], /Run the new inline examples/);
  assert.match(questions({ verdict: 'needs-human' })[0], /verifier requested human input/);
  assert.match(questions({ evidence: [] })[0], /verifier cited no source/);
  assert.deepEqual(questions({ findings: ['Wrong default'] }), ['Wrong default']);
  assert.deepEqual(reviewQuestions(classification(), { ...draft(), questions: ['Unknown version'] }, verification()), [
    'Unknown version',
  ]);
});
test('draft questions keep supported edits and publish them as a needs-input draft PR', () => {
  const { root, run, git, command, write, output } = controller();
  command('classify', classification());
  const uncertain = { notes: 'No draft applied.', questions: ['Which version shipped this change?'] };
  command('draft', uncertain);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(readFileSync(join(root, page), 'utf8'), original);
  assert.equal(existsSync(join(run, 'docs.patch')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(run, 'draft.json'), 'utf8')), uncertain);
  assert.match(readFileSync(output, 'utf8'), /applied=false/);
  write('context.json', { mode: 'open-pr', baseSha: git('rev-parse', 'HEAD').trim() });
  command('validation');
  assert.equal(JSON.parse(readFileSync(join(run, 'validation.json'), 'utf8')).outcome, 'needs-human');
  assert.ok(readFileSync(output, 'utf8').trim().endsWith('publication=comment'));
  assert.throws(() => command('draft', { ...uncertain, questions: [] }));
  edit(root, page, content);
  command('draft', uncertain);
  assert.equal(readFileSync(join(root, page), 'utf8'), content);
  assert.match(readFileSync(join(run, 'docs.patch'), 'utf8'), /Updated guidance/);
  assert.match(readFileSync(output, 'utf8'), /applied=true/);
  command('verify', verification());
  command('validation', undefined, { INSTALL_RESULT: 'success', BUILD_RESULT: 'success' });
  assert.equal(JSON.parse(readFileSync(join(run, 'validation.json'), 'utf8')).outcome, 'needs-human');
  assert.ok(readFileSync(output, 'utf8').trim().endsWith('publication=pr'));
});
test('controller applies only planned edits, captures new API guides, and gates dry-run publication', () => {
  const { root, run, write, command, output } = controller();
  const newPage = 'packages/docs/content/docs/api/fhir/operations/new-example.md';
  const plan = {
    ...classification(),
    changes: [...classification().changes, { path: newPage, action: 'create', purpose: 'New guide' }],
  };
  command('classify', plan);
  edit(root, page, content);
  edit(root, newPage, content + 'x'.repeat(140000) + '\n');
  command('draft', draft());
  assert.equal(readFileSync(join(root, page), 'utf8'), content);
  assert.match(readFileSync(join(run, 'docs.patch'), 'utf8'), /new-example.md/);
  command('verify', { ...verification(), verdict: 'needs-human', findings: ['Confirm availability.'] });
  command('validation');
  assert.equal(JSON.parse(readFileSync(join(run, 'validation.json'), 'utf8')).outcome, 'needs-human');
  command('verify', verification());
  command('validation', undefined, { INSTALL_RESULT: 'success', BUILD_RESULT: 'success' });
  assert.ok(readFileSync(output, 'utf8').trim().endsWith('publication=none'));
  write('context.json', { mode: 'open-pr' });
  command('validation', undefined, { INSTALL_RESULT: 'success', BUILD_RESULT: 'failure' });
  assert.ok(readFileSync(output, 'utf8').trim().endsWith('publication=comment'));
  command('validation', undefined, { INSTALL_RESULT: 'success', BUILD_RESULT: 'success' });
  assert.ok(readFileSync(output, 'utf8').trim().endsWith('publication=pr'));
});

// Fake only GitHub's API boundary; branch/commit/push operations use a real local bare remote.
function mockGitHub(base: string, files: Record<string, unknown>) {
  for (const [name, value] of Object.entries(files))
    writeFileSync(join(base, '.docs-run', `${name}.json`), JSON.stringify(value));
  const bin = join(base, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const file = process.env.MOCK_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const [command, flag, method, endpoint] = process.argv.slice(2);
if (command !== 'api' || flag !== '--method') throw new Error('Unexpected command');
const body = method === 'POST' || method === 'PATCH' ? JSON.parse(fs.readFileSync(0, 'utf8')) : undefined;
state.calls.push({ method, endpoint, body });
let response;
const comment = (id, text) => ({ id, body: text, user: { login: 'github-actions[bot]' }, html_url: 'https://github.com/org/repo/pull/123#issuecomment-' + id });
if (method === 'GET' && endpoint.startsWith('repos/org/repo/pulls?')) response = state.created ? [state.created] : [];
else if (method === 'POST' && endpoint === 'repos/org/repo/pulls') {
  state.created = { number: 456, html_url: 'https://github.com/org/repo/pull/456' };
  response = state.created;
} else if (method === 'POST' && endpoint === 'repos/org/repo/issues/456/assignees') {
  response = { assignees: body.assignees.map(login => ({ login })) };
} else if (method === 'GET' && endpoint.startsWith('repos/org/repo/issues/123/comments?')) {
  const page = Number(new URLSearchParams(endpoint.split('?')[1]).get('page') || 1);
  response = state.comments.slice(100 * (page - 1), 100 * page);
}
else if (method === 'POST' && endpoint === 'repos/org/repo/issues/123/comments') {
  response = comment(state.comments.length + 1, body.body);
  state.comments.push(response);
} else if (method === 'PATCH' && endpoint.startsWith('repos/org/repo/issues/comments/')) {
  const id = Number(endpoint.split('/').pop());
  response = comment(id, body.body);
  state.comments[id - 1] = response;
} else throw new Error('Unexpected endpoint ' + method + ' ' + endpoint);
fs.writeFileSync(file, JSON.stringify(state));
process.stdout.write(JSON.stringify(response));
`
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const statePath = join(base, 'api.json');
  writeFileSync(statePath, JSON.stringify({ calls: [], comments: [] }));
  const publish = (): void => {
    execFileSync(process.execPath, [fileURLToPath(new URL('./run.ts', import.meta.url)), 'publish'], {
      cwd: base,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        MOCK_GH_STATE: statePath,
        GITHUB_REPOSITORY: 'org/repo',
      },
      stdio: 'pipe',
    });
  };
  type Call = { method: string; endpoint: string; body?: Record<string, unknown> };
  const state = (): { calls: Call[]; comments: { body: string }[] } => JSON.parse(readFileSync(statePath, 'utf8'));
  const call = (method: string, endpoint: string): Call | undefined =>
    state().calls.find((item) => item.method === method && item.endpoint === endpoint);
  return { publish, state, call };
}
function sourceContext(baseSha: string) {
  return {
    repository: 'org/repo',
    baseSha,
    baseBranch: 'main',
    mode: 'open-pr',
    source: { number: 123, user: { type: 'User', login: 'original-author' } },
    model: config.model,
    effort: 'high',
  };
}

test('publisher creates and assigns one draft PR, links it from the source PR, and preserves reviewer edits', () => {
  const { base, root, git, run } = controller();
  const sha = git('rev-parse', 'HEAD').trim();
  const remote = join(base, 'remote.git');
  git('init', '--bare', '-q', remote);
  git('remote', 'add', 'origin', remote);
  git('push', '-q', 'origin', 'main');
  const { publish, state, call } = mockGitHub(base, {
    context: sourceContext(sha),
    classification: classification(),
    draft: { ...draft(), notes: 'Ask @release-team <b>first</b>.' },
    verification: verification(),
    validation: { install: 'success', build: 'success' },
  });
  stagePatch(root, git, run, [[page, content]]);
  publish();
  const created = call('POST', 'repos/org/repo/pulls')?.body ?? {};
  assert.equal(created.draft, true);
  assert.equal(created.head, 'docs/automated-pr-123');
  assert.equal(created.title, 'docs: follow up on #123');
  assert.match(String(created.body), /Status: \*\*ready for review\*\*/);
  assert.match(String(created.body), /## Reviewer Checks\nAsk @\u200brelease-team &lt;b>first&lt;\/b>\./);
  assert.deepEqual(call('POST', 'repos/org/repo/issues/456/assignees')?.body?.assignees, ['original-author']);
  assert.match(
    state().comments[0].body,
    /Documentation follow-up:\*\* https:\/\/github.com\/org\/repo\/pull\/456, ready for review/
  );
  assert.match(git('ls-remote', '--heads', 'origin', 'docs/automated-pr-123'), /docs\/automated-pr-123/);
  assert.match(git('log', '-1', '--format=%B'), /Signed-off-by: github-actions\[bot\]/);
  writeFileSync(join(root, page), content + '\nHuman correction.\n');
  publish();
  assert.match(readFileSync(join(root, page), 'utf8'), /Human correction/);
  assert.equal(state().calls.filter((item) => item.method === 'POST').length, 3);
  assert.equal(state().comments.length, 1);
  assert.match(state().comments[0].body, /Existing documentation PR/);
  assert.doesNotMatch(state().comments[0].body, /ready for review/);
  assert.ok(call('PATCH', 'repos/org/repo/issues/comments/1'));
  assert.match(JSON.parse(readFileSync(join(run, 'publication.json'), 'utf8')).status, /Existing PR retained/);
});

test('a draft with open questions is published as a needs-input draft PR', () => {
  const { base, root, git, run } = controller();
  const sha = git('rev-parse', 'HEAD').trim();
  git('init', '--bare', '-q', join(base, 'remote.git'));
  git('remote', 'add', 'origin', join(base, 'remote.git'));
  const { publish, state, call } = mockGitHub(base, {
    context: sourceContext(sha),
    classification: classification(),
    draft: { ...draft(), questions: ['Which release ships this?'] },
    verification: { ...verification(), verdict: 'needs-human', findings: ['Confirm the policy name.'] },
    validation: { install: 'success', build: 'success' },
  });
  stagePatch(root, git, run, [[page, content]]);
  publish();
  const created = call('POST', 'repos/org/repo/pulls')?.body ?? {};
  assert.equal(created.title, 'docs: follow up on #123 (needs input)');
  assert.match(String(created.body), /## Open Questions\n- Which release ships this\?\n- Confirm the policy name\./);
  assert.match(state().comments[0].body, /needs human input/);
});

test('needs-human without a buildable patch comments on the source PR once', () => {
  const { base, git, run } = controller();
  const { publish, state, call } = mockGitHub(base, {
    context: sourceContext(git('rev-parse', 'HEAD').trim()),
    classification: {
      ...classification(),
      outcome: 'needs-human',
      changes: [],
      questions: ['Should @someone update <the demo app> at `/auth/external/<client-id>`?'],
    },
    validation: { install: 'skipped', build: 'skipped' },
  });
  const stored = join(base, 'api.json');
  writeFileSync(
    stored,
    JSON.stringify({
      calls: [],
      comments: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        user: { login: 'human' },
        body: 'Discussion',
      })),
    })
  );
  publish();
  publish();
  assert.equal(call('POST', 'repos/org/repo/pulls'), undefined);
  assert.equal(state().comments.length, 101);
  const comment = state().comments[100].body;
  assert.match(comment, /needs human input/);
  assert.match(comment, /- Should @\u200bsomeone update &lt;the demo app> at `\/auth\/external\/<client-id>`\?/);
  assert.match(JSON.parse(readFileSync(join(run, 'publication.json'), 'utf8')).status, /Commented on the source PR/);
});
