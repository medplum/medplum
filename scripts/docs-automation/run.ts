import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Classification, Draft, Evidence, Verification } from './schema.ts';
import { schemas, validateSchema } from './schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const repo = resolve('repo');
const runDir = resolve('.docs-run');
const artifact = (name: string): string => join(runDir, name);
const readJson = <T>(name: string): T => JSON.parse(readFileSync(artifact(name), 'utf8')) as T;
const save = (name: string, value: unknown): void =>
  writeFileSync(artifact(name), JSON.stringify(value, null, 2) + '\n');
function output(name: string, value: string): void {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function git(args: string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}
function api<T>(endpoint: string, method = 'GET', body?: unknown): T {
  const args = ['api', '--method', method, endpoint];
  if (body) args.push('--input', '-');
  return JSON.parse(
    execFileSync('gh', args, {
      encoding: 'utf8',
      input: body ? JSON.stringify(body) : undefined,
      maxBuffer: 20 * 1024 * 1024,
    })
  ) as T;
}

interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  merged: boolean;
  merge_commit_sha: string;
  html_url: string;
  user: { login: string; type: string };
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  changed_files: number;
}
interface Context {
  repository: string;
  source: PullRequest;
  baseSha: string;
  baseBranch: string;
  mode: string;
  workflowSha: string;
  model: string;
  effort: string;
  files: string[];
  docsHints: string[];
}

export function sourceNumber(value: string): number {
  if (!/^[1-9]\d{0,8}$/.test(value))
    throw new Error('pr_number must be a positive PR number, not a URL or shell expression');
  return Number(value);
}
export function safePath(path: string): boolean {
  return (
    !isAbsolute(path) &&
    /^[a-zA-Z0-9_./-]+$/.test(path) &&
    !path.split('/').some((part) => !part || part === '.' || part === '..')
  );
}
export function allowedDoc(path: string): boolean {
  if (!safePath(path) || !path.endsWith('.md')) return false;
  if (/^packages\/docs\/assets\/fhir\/resources\/[a-z0-9-]+\.md$/.test(path)) return true;
  return (
    path.startsWith('packages/docs/content/docs/') &&
    !/^packages\/docs\/content\/docs\/(api|sdk|decision-guides)(\/|\.)/.test(path)
  );
}
function noSymlinks(root: string, path: string): void {
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Symlink in path: ${path}`);
  }
}
export function validateEvidence(root: string, evidence: Evidence[]): void {
  for (const item of evidence) {
    if (!safePath(item.path) || !/^(packages|examples|scripts|charts|terraform|\.github)\//.test(item.path)) {
      throw new Error(`Invalid evidence path: ${item.path}`);
    }
    noSymlinks(root, item.path);
    const text = readFileSync(join(root, item.path), 'utf8');
    if (item.line > text.split('\n').length) throw new Error(`Evidence line does not exist: ${item.path}:${item.line}`);
  }
}
export function validateClassification(root: string, result: Classification): void {
  validateSchema(result, schemas.classify);
  validateEvidence(root, result.evidence);
  if (result.outcome !== 'needs-human' && result.evidence.length === 0)
    throw new Error('A conclusive decision needs evidence');
  if (result.outcome === 'already-covered' && !result.evidence.some((item) => item.path.startsWith('packages/docs/'))) {
    throw new Error('Already-covered needs documentation evidence');
  }
  if (result.outcome === 'needs-human' && !result.questions.length)
    throw new Error('Needs-human must explain the question');
  if (result.outcome !== 'needs-human' && result.questions.length)
    throw new Error('Unresolved questions require needs-human');
  if (result.outcome !== 'update-docs' && result.changes.length)
    throw new Error('Only update-docs may include planned edits');
  if (result.outcome === 'update-docs' && (!result.changes.length || result.questions.length)) {
    throw new Error('A draftable decision needs a concrete plan and no unresolved questions');
  }
  if (result.changes.length > config.maxDraftFiles) throw new Error('Too many planned files');
  const paths = new Set<string>();
  for (const change of result.changes) {
    if (!allowedDoc(change.path) || paths.has(change.path))
      throw new Error(`Invalid/duplicate planned path: ${change.path}`);
    paths.add(change.path);
    noSymlinks(root, change.path);
    if (existsSync(join(root, change.path)) !== (change.action === 'update')) {
      throw new Error(`Plan action does not match file existence: ${change.path}`);
    }
  }
}
export function validateDraft(root: string, classification: Classification, draft: Draft): void {
  validateSchema(draft, schemas.draft);
  if (draft.questions.length) throw new Error('Draft has unresolved questions; review the draft artifact');
  if (classification.outcome !== 'update-docs' || !draft.edits.length) throw new Error('No draftable change');
  const planned = new Set(classification.changes.map((change) => change.path));
  if (draft.edits.length !== planned.size || draft.edits.length > config.maxDraftFiles)
    throw new Error('Draft does not match plan');
  let bytes = 0;
  for (const edit of draft.edits) {
    if (!allowedDoc(edit.path) || !planned.delete(edit.path)) throw new Error(`Unplanned/duplicate path: ${edit.path}`);
    noSymlinks(root, edit.path);
    bytes += Buffer.byteLength(edit.content);
    if (bytes > config.maxDraftBytes || edit.content.includes('\0')) throw new Error('Draft exceeds content limits');
    if (/<\s*(script|iframe)\b/i.test(edit.content)) throw new Error('Executable HTML is outside draft scope');
    if (
      edit.path.startsWith('packages/docs/content/') &&
      !/^---\r?\n[\s\S]*?\btitle:\s*\S[\s\S]*?\r?\n---(?:\r?\n|$)/.test(edit.content)
    ) {
      throw new Error(`Missing YAML front matter/title: ${edit.path}`);
    }
  }
}
export function readyToPublish(classification: Classification, draft: Draft, verification: Verification): boolean {
  validateSchema(verification, schemas.verify);
  return (
    classification.outcome === 'update-docs' &&
    !classification.questions.length &&
    !draft.questions.length &&
    verification.verdict === 'ready' &&
    !verification.findings.length &&
    verification.evidence.length > 0 &&
    verification.examples !== 'requires-execution'
  );
}

function args(stage: keyof typeof schemas): string {
  if (!/^claude-[a-z0-9.-]+$/.test(config.model) || !['low', 'medium', 'high', 'max'].includes(config.effort)) {
    throw new Error('Invalid model/effort configuration');
  }
  if (!Number.isInteger(config.maxTurns) || config.maxTurns < 1 || !Number.isFinite(config.budgetUsd[stage])) {
    throw new Error('Invalid agent limits');
  }
  return (
    `--model ${config.model} --effort ${config.effort} --max-turns ${config.maxTurns} ` +
    `--max-budget-usd ${config.budgetUsd[stage]} --tools Read,Glob,Grep --allowedTools Read,Glob,Grep ` +
    `--disallowedTools 'mcp__*' --json-schema '${JSON.stringify(schemas[stage])}'`
  );
}

function prepare(): void {
  mkdirSync(runDir, { recursive: true });
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  const number = sourceNumber(process.env.PR_NUMBER ?? '');
  const mode = process.env.MODE ?? 'draft';
  if (!['classify', 'draft', 'open-pr'].includes(mode)) throw new Error('Invalid mode');
  const details = api<{ default_branch: string }>(`repos/${repository}`);
  const source = api<PullRequest>(`repos/${repository}/pulls/${number}`);
  if (!source.merged || source.base.ref !== details.default_branch)
    throw new Error('Select a merged PR targeting the default branch');
  const context: Context = {
    repository,
    source: { ...source, body: source.body?.slice(0, 12000) ?? null },
    baseSha: git(['rev-parse', 'HEAD']).trim(),
    baseBranch: details.default_branch,
    mode,
    workflowSha: process.env.GITHUB_SHA ?? 'local',
    model: config.model,
    effort: config.effort,
    files: [],
    docsHints: [],
  };
  save('context.json', context);
  output('base_sha', context.baseSha);
  for (const stage of ['classify', 'draft', 'verify'] as const) output(`${stage}_args`, args(stage));
  output('analyze', 'false');
  const stop = (outcome: Classification['outcome'], rationale: string): void => {
    save('classification.json', {
      outcome,
      rationale,
      userImpact: 'Not assessed by the model.',
      evidence: [],
      changes: [],
      questions: outcome === 'needs-human' ? [rationale] : [],
    });
  };
  if (source.head.ref.startsWith('docs/automated-pr-')) {
    stop('no-docs', 'Documentation automation output; do not recursively draft another PR.');
    return;
  }
  if (source.changed_files > config.maxSourceFiles) {
    stop(
      'needs-human',
      `PR has ${source.changed_files} files; pilot limit is ${config.maxSourceFiles}. Split the analysis.`
    );
    return;
  }
  for (let page = 1; ; page++) {
    const files = api<{ filename: string }[]>(`repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`);
    context.files.push(...files.map((file) => file.filename));
    if (files.length < 100) break;
  }
  if (context.files.length !== source.changed_files) throw new Error('Incomplete PR file list');
  context.docsHints = [
    ...new Set<string>(
      config.sourceToDocs.flatMap((mapping: { source: string; docs: string[] }) =>
        context.files.some((path) => path.startsWith(mapping.source)) ? mapping.docs : []
      )
    ),
  ];
  save('context.json', context);
  // Retrieve immutable objects, without checking out or executing the PR branch.
  for (const sha of [source.base.sha, source.head.sha, source.merge_commit_sha]) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source revision');
    git(['fetch', '--no-tags', 'origin', sha]);
  }
  git(['merge-base', '--is-ancestor', source.merge_commit_sha, context.baseSha]);
  const diff = git(['diff', '--no-ext-diff', '--no-textconv', `${source.base.sha}...${source.head.sha}`, '--']);
  if (Buffer.byteLength(diff) > config.maxDiffBytes) {
    stop('needs-human', `PR diff exceeds ${config.maxDiffBytes} bytes; no truncated classification was attempted.`);
    return;
  }
  if (!diff.trim()) throw new Error('Source PR diff is empty');
  writeFileSync(artifact('source.diff'), diff);
  output('analyze', 'true');
}

function applyDraft(): void {
  const classification = readJson<Classification>('classification.json');
  const draft = readJson<Draft>('draft.json');
  validateClassification(repo, classification);
  validateDraft(repo, classification, draft);
  const context = readJson<Context>('context.json');
  if (git(['rev-parse', 'HEAD']).trim() !== context.baseSha || git(['status', '--porcelain']).trim()) {
    throw new Error('Draft must be applied to the clean, pinned base revision');
  }
  for (const edit of draft.edits) {
    mkdirSync(dirname(join(repo, edit.path)), { recursive: true });
    writeFileSync(join(repo, edit.path), edit.content);
  }
  // Add only validated files, including new pages, so the artifact includes the complete patch.
  git(['add', '--', ...draft.edits.map((edit) => edit.path)]);
  git(['diff', '--cached', '--check']);
  const patch = git(['diff', '--cached', '--no-ext-diff', '--no-textconv']);
  if (!patch.trim()) throw new Error('Agent produced no effective documentation changes');
  writeFileSync(artifact('docs.patch'), patch);
}

export function structuredResult(messages: unknown): unknown {
  if (!Array.isArray(messages)) throw new Error('Expected an execution message array');
  const result = messages.findLast((message) => message?.type === 'result');
  if (result?.subtype !== 'success' || result.is_error !== false || !result.structured_output) {
    throw new Error('Agent did not finish with a successful structured result');
  }
  return result.structured_output;
}

function accept(stage: 'classify' | 'draft' | 'verify'): void {
  // Read the action's result file to avoid Linux's per-environment-variable size limit.
  // Only the structured result is saved; the execution transcript stays out of artifacts.
  const result = structuredResult(JSON.parse(readFileSync(process.env.EXECUTION_FILE ?? '', 'utf8')));
  validateSchema(result, schemas[stage]);
  const name = stage === 'classify' ? 'classification' : stage === 'verify' ? 'verification' : 'draft';
  save(`${name}.json`, result);
  if (stage === 'classify') {
    validateClassification(repo, result as Classification);
    output('draft', String((result as Classification).outcome === 'update-docs'));
  } else if (stage === 'draft') {
    applyDraft();
  } else {
    validateEvidence(repo, (result as Verification).evidence);
    const ready = readyToPublish(readJson('classification.json'), readJson('draft.json'), result as Verification);
    output('ready', String(ready));
  }
}

function formatDraft(): void {
  const draft = readJson<Draft>('draft.json');
  const classification = readJson<Classification>('classification.json');
  validateDraft(repo, classification, draft);
  execFileSync('npm', ['exec', '--no', '--', 'prettier', '--write', ...draft.edits.map((edit) => edit.path)], {
    cwd: repo,
    stdio: 'inherit',
  });
  for (const edit of draft.edits) edit.content = readFileSync(join(repo, edit.path), 'utf8');
  validateDraft(repo, classification, draft);
  save('draft.json', draft);
  git(['add', '--', ...draft.edits.map((edit) => edit.path)]);
  git(['diff', '--cached', '--check']);
  writeFileSync(artifact('docs.patch'), git(['diff', '--cached', '--no-ext-diff', '--no-textconv']));
}

function renderSummary(): void {
  const blocks = ['# Documentation automation', '', 'Manual pilot. No automatic merge trigger is enabled.', ''];
  for (const name of ['context', 'classification', 'draft', 'verification', 'validation', 'publication']) {
    if (!existsSync(artifact(`${name}.json`))) continue;
    const value = readJson<Record<string, unknown>>(`${name}.json`);
    if (name === 'context') {
      const context = value as unknown as Context;
      blocks.push(
        `Source: ${context.repository}#${context.source.number}`,
        `Mode: ${context.mode}`,
        `Model: ${context.model}; effort: ${context.effort}`,
        `Docs base: ${context.baseSha}`,
        ''
      );
      continue;
    }
    if (name === 'draft') {
      const draft = value as unknown as Draft;
      value.edits = draft.edits.map((edit) => ({ path: edit.path, bytes: Buffer.byteLength(edit.content) }));
    }
    // Escape HTML and fence delimiters from model-generated text in the Actions summary.
    blocks.push(
      `## ${name}`,
      '',
      '```json',
      JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/`/g, '\\u0060'),
      '```',
      ''
    );
  }
  blocks.push(
    'Artifacts include the decision, evidence, proposed patch, and check results. No raw agent transcript is uploaded.',
    'A successful site build does not execute Markdown examples. Human technical review is required.',
    ''
  );
  const summary = blocks.join('\n');
  writeFileSync(artifact('summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

function recordValidation(): void {
  const validation = {
    install: process.env.INSTALL_RESULT ?? 'skipped',
    format: process.env.FORMAT_RESULT ?? 'skipped',
    build: process.env.BUILD_RESULT ?? 'skipped',
    examples: 'Inline snippets were not executed. Existing source example references are reviewed by the verifier.',
  };
  save('validation.json', validation);
  const context = readJson<Context>('context.json');
  const ready =
    existsSync(artifact('verification.json')) &&
    readyToPublish(readJson('classification.json'), readJson('draft.json'), readJson('verification.json'));
  output(
    'publishable',
    String(
      context.mode === 'open-pr' &&
        ready &&
        validation.install === 'success' &&
        validation.format === 'success' &&
        validation.build === 'success'
    )
  );
}

function publish(): void {
  const context = readJson<Context>('context.json');
  const validation = readJson<{ install: string; format: string; build: string }>('validation.json');
  if (
    context.repository !== process.env.GITHUB_REPOSITORY ||
    context.mode !== 'open-pr' ||
    !readyToPublish(readJson('classification.json'), readJson('draft.json'), readJson('verification.json')) ||
    ![validation.install, validation.format, validation.build].every((result) => result === 'success')
  ) {
    throw new Error('Publication preconditions failed');
  }
  const branch = `docs/automated-pr-${sourceNumber(String(context.source.number))}`;
  const owner = context.repository.split('/')[0];
  const existing = api<{ html_url: string }[]>(
    `repos/${context.repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}`
  );
  if (existing.length) {
    save('publication.json', {
      url: existing[0].html_url,
      status: 'Existing PR retained; reviewer edits were not overwritten.',
    });
    return;
  }
  applyDraft();
  const expected = readFileSync(artifact('docs.patch'), 'utf8');
  if (!expected.trim()) throw new Error('Empty patch');
  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['checkout', '-b', branch]);
  git(['commit', '--signoff', '-m', `docs: follow up on #${context.source.number}`]);
  // A failed earlier publish may have pushed the branch before PR creation. Reuse only an identical tree.
  const remote = git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]).trim();
  if (remote) {
    git(['fetch', 'origin', `refs/heads/${branch}`]);
    if (git(['rev-parse', 'FETCH_HEAD^{tree}']).trim() !== git(['rev-parse', 'HEAD^{tree}']).trim()) {
      throw new Error('An existing automation branch has different edits; inspect it before retrying');
    }
  } else {
    git(['push', 'origin', `HEAD:refs/heads/${branch}`]);
  }
  const classification = readJson<Classification>('classification.json');
  const body = [
    `<!-- docs-automation: ${context.repository}#${context.source.number} -->`,
    `Documentation follow-up for #${context.source.number}.`,
    '',
    classification.userImpact,
    '',
    '## Changes',
    ...classification.changes.map((change) => `- ${change.path}: ${change.purpose}`),
    '',
    '## Evidence',
    ...classification.evidence.map(
      (item) =>
        `- [${item.path}:${item.line}](https://github.com/${context.repository}/blob/${context.baseSha}/${item.path}#L${item.line}): ${item.reason}`
    ),
    '',
    '## Validation',
    '- Formatting and Hugo docs build passed.',
    '- Separate AI verification completed; human technical review is required.',
    '- Inline examples were not executed by this workflow.',
    '',
    `Model: ${context.model}; effort: ${context.effort}.`,
    `Run: https://github.com/${context.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    '',
    'Review current behavior, release availability, examples, and rendered layout before publishing.',
  ].join('\n');
  const created = api<{ number: number; html_url: string }>(`repos/${context.repository}/pulls`, 'POST', {
    title: `docs: follow up on #${context.source.number}`,
    head: branch,
    base: context.baseBranch,
    body,
    draft: true,
  });
  // Save the PR before assigning so a failed assignment remains recoverable and visible.
  save('publication.json', { url: created.html_url, status: 'Created draft PR; assignment pending' });
  const assignee = context.source.user.type === 'User' ? context.source.user.login : config.fallbackAssignee;
  if (!assignee || !/^[a-zA-Z0-9-]+$/.test(assignee)) {
    save('publication.json', {
      url: created.html_url,
      status: 'Needs maintainer assignment: source author is a bot or unavailable',
    });
    throw new Error('Draft created, but no human assignee is configured');
  }
  try {
    const assigned = api<{ assignees: { login: string }[] }>(
      `repos/${context.repository}/issues/${created.number}/assignees`,
      'POST',
      { assignees: [assignee] }
    );
    if (!assigned.assignees.some((user) => user.login === assignee))
      throw new Error('GitHub did not assign the requested user');
    save('publication.json', { url: created.html_url, assignee, status: 'Draft assigned for human review' });
  } catch {
    save('publication.json', { url: created.html_url, status: `Draft created; assign ${assignee} manually` });
    throw new Error('Draft created but assignment failed; see publication artifact');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'prepare') prepare();
  else if (command === 'classify' || command === 'draft' || command === 'verify') accept(command);
  else if (command === 'validation') recordValidation();
  else if (command === 'format') formatDraft();
  else if (command === 'publish') publish();
  else if (command === 'summary') {
    mkdirSync(runDir, { recursive: true });
    renderSummary();
  } else throw new Error(`Unknown command: ${command}`);
}
