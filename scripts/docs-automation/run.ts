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
  models: Record<keyof typeof schemas, string>;
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
  if (!path.startsWith('packages/docs/content/docs/')) return false;
  if (/^packages\/docs\/content\/docs\/(sdk|decision-guides)(\/|\.)/.test(path)) return false;
  // The FHIR content adapter owns these type-page URLs; their section indexes are hand-written.
  // Other API Markdown (operations, auth, OAuth, project administration, etc.) is also hand-written.
  if (/^packages\/docs\/content\/docs\/api\/fhir\/(resources|datatypes|medplum)(\/|\.)/.test(path)) {
    return /^packages\/docs\/content\/docs\/api\/fhir\/(resources|datatypes|medplum)\/_index\.md$/.test(path);
  }
  return true;
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
  if ((result.outcome === 'needs-human') !== result.questions.length > 0)
    throw new Error('Only needs-human decisions must include questions');
  if ((result.outcome === 'update-docs') !== result.changes.length > 0)
    throw new Error('Only update-docs decisions must include a plan');
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
// The drafter edits planned files directly; permission rules limit it to those paths. Re-check what
// actually changed on disk against the plan before anything is verified, built, or published.
export function checkDraftedFiles(root: string, classification: Classification, draft: Draft): string[] {
  validateSchema(draft, schemas.draft);
  if (classification.outcome !== 'update-docs') throw new Error('No draftable change');
  const changed = git(['status', '--porcelain', '-z', '--untracked-files=all'], root)
    .split('\0')
    .filter(Boolean)
    .map((entry) => entry.slice(3));
  const planned = new Set(classification.changes.map((change) => change.path));
  // A draft with open questions may cover only part of the plan.
  if (!changed.length || (!draft.questions.length && changed.length !== planned.size)) {
    throw new Error('Drafted files do not match the plan');
  }
  let bytes = 0;
  for (const path of changed) {
    if (!allowedDoc(path) || !planned.has(path)) throw new Error(`Unplanned change: ${path}`);
    noSymlinks(root, path);
    const content = readFileSync(join(root, path), 'utf8');
    bytes += Buffer.byteLength(content);
    if (bytes > config.maxDraftBytes || content.includes('\0')) throw new Error('Draft exceeds content limits');
    if (/<\s*(script|iframe)\b/i.test(content)) throw new Error('Executable HTML is outside draft scope');
    if (
      path.startsWith('packages/docs/content/') &&
      !/^---\r?\n[\s\S]*?\btitle:\s*\S[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content)
    ) {
      throw new Error(`Missing YAML front matter/title: ${path}`);
    }
  }
  return changed;
}
// Only the draft stage gets Edit/Write, and only for the exact planned paths. Edit rules also cover Write.
export function args(stage: keyof typeof schemas, editPaths: string[] = []): string {
  const model = config.models[stage];
  if (!/^claude-[a-z0-9.-]+$/.test(model) || !['low', 'medium', 'high', 'xhigh', 'max'].includes(config.effort)) {
    throw new Error('Invalid model/effort configuration');
  }
  if (!Number.isInteger(config.maxTurns) || config.maxTurns < 1 || !Number.isFinite(config.budgetUsd[stage])) {
    throw new Error('Invalid agent limits');
  }
  if ((stage !== 'draft' && editPaths.length) || !editPaths.every(allowedDoc)) throw new Error('Invalid edit path');
  const tools = ['Read', 'Glob', 'Grep', ...(editPaths.length ? ['Edit', 'Write'] : [])];
  const allowed = ['Read', 'Glob', 'Grep', ...editPaths.map((path) => `Edit(repo/${path})`)];
  return (
    `--model ${model} --effort ${config.effort} --max-turns ${config.maxTurns} ` +
    `--max-budget-usd ${config.budgetUsd[stage]} --tools ${tools.join(',')} --allowedTools '${allowed.join(',')}' ` +
    `--disallowedTools 'mcp__*' --setting-sources user --permission-mode dontAsk ` +
    `--json-schema '${JSON.stringify(schemas[stage])}'`
  );
}

// Use what landed, tolerating changed context and merge-time edits. File coverage
// plus the parent's PR association guards against analyzing only the last rebase commit.
export function landedDiff(
  root: string,
  mergeSha: string,
  headSha: string,
  prFiles: string[],
  parentFromSamePr: (sha: string) => boolean
): { diff: string; files: string[] } | undefined {
  for (const sha of [mergeSha, headSha]) {
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid source revision');
  }
  const parents = git(['rev-list', '--parents', '-n', '1', mergeSha], root).trim().split(' ').slice(1);
  if (parents.length !== 1 && (parents.length !== 2 || parents[1] !== headSha)) return undefined;
  const files = git(['diff', '--name-only', '--no-renames', '-z', parents[0], mergeSha, '--'], root)
    .split('\0')
    .filter(Boolean);
  if (parents.length === 1) {
    const expected = new Set(prFiles);
    if (files.length !== expected.size || files.some((path) => !expected.has(path)) || parentFromSamePr(parents[0]))
      return undefined;
  }
  const diff = git(['diff', '--no-ext-diff', '--no-textconv', parents[0], mergeSha, '--'], root);
  return diff.trim() ? { diff, files } : undefined;
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
    models: config.models,
    effort: config.effort,
    files: [],
    docsHints: [],
  };
  save('context.json', context);
  output('base_sha', context.baseSha);
  for (const stage of ['classify', 'verify'] as const) output(`${stage}_args`, args(stage));
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
  // Only fetch the landed revision; the PR branch is never checked out or executed.
  if (!/^[a-f0-9]{40}$/.test(source.merge_commit_sha)) throw new Error('Invalid source revision');
  git(['fetch', '--no-tags', 'origin', source.merge_commit_sha]);
  git(['merge-base', '--is-ancestor', source.merge_commit_sha, context.baseSha]);
  // The pilot's 80-file limit fits in one page; verify completeness explicitly.
  const prFiles = api<{ filename: string; previous_filename?: string }[]>(
    `repos/${repository}/pulls/${number}/files?per_page=100`
  );
  if (prFiles.length !== source.changed_files) throw new Error('Incomplete PR file list');
  const change = landedDiff(
    repo,
    source.merge_commit_sha,
    source.head.sha,
    prFiles.flatMap((file) => (file.previous_filename ? [file.previous_filename, file.filename] : [file.filename])),
    (parent) => {
      const associated = api<{ number: number }[]>(`repos/${repository}/commits/${parent}/pulls?per_page=100`);
      return associated.length === 100 || associated.some((pr) => pr.number === number);
    }
  );
  if (!change) {
    stop(
      'needs-human',
      'The landed change is empty, has a different file set, or cannot be isolated from earlier commits in this PR. Review its merge history.'
    );
    return;
  }
  if (Buffer.byteLength(change.diff) > config.maxDiffBytes) {
    stop(
      'needs-human',
      `Landed diff is ${Buffer.byteLength(change.diff)} bytes; pilot limit is ${config.maxDiffBytes}.`
    );
    return;
  }
  context.files = change.files;
  if (context.files.length > config.maxSourceFiles) {
    stop('needs-human', `Landed change exceeds the ${config.maxSourceFiles}-file pilot limit.`);
    return;
  }
  context.docsHints = [
    ...new Set<string>(
      config.sourceToDocs.flatMap((mapping: { source: string; docs: string[] }) =>
        context.files.some((path) => path.startsWith(mapping.source)) ? mapping.docs : []
      )
    ),
  ];
  save('context.json', context);
  writeFileSync(artifact('source.diff'), change.diff);
  output('analyze', 'true');
}

// The plan was validated before drafting (classify stage, or publish before applying the patch).
function captureDraft(): void {
  const classification = readJson<Classification>('classification.json');
  if (git(['rev-parse', 'HEAD']).trim() !== readJson<Context>('context.json').baseSha) {
    throw new Error('Draft must be on the pinned base revision');
  }
  const paths = checkDraftedFiles(repo, classification, readJson<Draft>('draft.json'));
  // Stage only checked files, including new pages, so the artifact includes the complete patch.
  git(['add', '--', ...paths]);
  git(['diff', '--cached', '--check']);
  writeFileSync(artifact('docs.patch'), git(['diff', '--cached', '--no-ext-diff', '--no-textconv']));
}

export function structuredResult(messages: unknown): unknown {
  if (!Array.isArray(messages)) throw new Error('Expected an execution message array');
  const result = messages.findLast((message) => message?.type === 'result');
  if (result?.subtype !== 'success' || result.is_error !== false || !result.structured_output) {
    throw new Error('Agent did not finish with a successful structured result');
  }
  return result.structured_output;
}

// Agents sometimes prefix paths with the workspace's `repo/` folder or cite run artifacts.
// Normalize the prefix and drop artifact citations rather than failing the run.
export function normalizePaths<T extends Classification | Draft | Verification>(result: T): T {
  const strip = (path: string): string => path.replace(/^(?:\.\/)?repo\//, '');
  const value = structuredClone(result) as Partial<Classification & Draft & Verification>;
  if (value.evidence) {
    value.evidence = value.evidence
      .map((item) => ({ ...item, path: strip(item.path) }))
      .filter((item) => {
        if (!item.path.startsWith('.docs-run/')) return true;
        console.warn(`Ignoring run artifact cited as evidence: ${item.path}:${item.line}`);
        return false;
      });
  }
  if (value.changes) value.changes = value.changes.map((change) => ({ ...change, path: strip(change.path) }));
  return value as T;
}

function accept(stage: 'classify' | 'draft' | 'verify'): void {
  // Read the action's result file to avoid Linux's per-environment-variable size limit.
  // Only the structured result is saved; the execution transcript stays out of artifacts.
  const raw = structuredResult(JSON.parse(readFileSync(process.env.EXECUTION_FILE ?? '', 'utf8')));
  validateSchema(raw, schemas[stage]);
  const result = normalizePaths(raw as Classification | Draft | Verification);
  const name = stage === 'classify' ? 'classification' : stage === 'verify' ? 'verification' : 'draft';
  save(`${name}.json`, result);
  if (stage === 'classify') {
    const classification = result as Classification;
    validateClassification(repo, classification);
    if (classification.outcome === 'update-docs') {
      const paths = classification.changes.map((change) => change.path);
      output('draft_args', args('draft', paths));
    }
  } else if (stage === 'draft') {
    if (!git(['status', '--porcelain']).trim() && (result as Draft).questions.length) {
      output('applied', 'false');
      return;
    }
    captureDraft();
    output('applied', 'true');
  } else {
    validateEvidence(repo, (result as Verification).evidence);
  }
}

function renderSummary(): void {
  const blocks = ['# Documentation automation', ''];
  for (const name of ['context', 'classification', 'draft', 'verification', 'validation', 'publication']) {
    if (!existsSync(artifact(`${name}.json`))) continue;
    const value = readJson<Record<string, unknown>>(`${name}.json`);
    if (name === 'context') {
      const context = value as unknown as Context;
      blocks.push(
        `Source: ${context.repository}#${context.source.number}`,
        `Mode: ${context.mode}`,
        `Configured models (${context.effort} effort): classify \`${context.models.classify}\`, draft \`${context.models.draft}\`, verify \`${context.models.verify}\`.`,
        `Docs base: ${context.baseSha}`,
        ''
      );
      continue;
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
  const summary = blocks.join('\n');
  writeFileSync(artifact('summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

const optional = <T>(name: string): T | undefined => (existsSync(artifact(name)) ? readJson<T>(name) : undefined);
// Model text goes into public GitHub bodies: neutralize @mentions and raw HTML outside code spans.
export const safe = (text: string): string =>
  text
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 ? part : part.replace(/@(?=[\w-])/g, '@\u200b').replace(/</g, '&lt;')))
    .join('');

export function reviewQuestions(classification: Classification, draft?: Draft, verification?: Verification): string[] {
  const questions = [...classification.questions, ...(draft?.questions ?? [])];
  if (verification) {
    validateSchema(verification, schemas.verify);
    questions.push(...verification.findings);
    if (verification.examples === 'requires-execution') questions.push('Run the new inline examples before merging.');
    if (!verification.evidence.length)
      questions.push('Check the draft against the implementation. The verifier cited no source.');
    if (verification.verdict === 'needs-human' && !questions.length)
      questions.push('Review the draft. The verifier requested human input without giving a reason.');
  }
  return questions;
}

function assess(mode: string, install: string, build: string) {
  const classification = optional<Classification>('classification.json');
  const draft = optional<Draft>('draft.json');
  const verification = optional<Verification>('verification.json');
  const patch = existsSync(artifact('docs.patch'));
  const built = patch && install === 'success' && build === 'success';
  const questions = classification ? reviewQuestions(classification, draft, verification) : [];
  if (install === 'failure') questions.push('Dependency installation failed. See the workflow run.');
  if (build === 'failure') questions.push('The docs build failed. See the workflow run.');
  const outcome = questions.length ? 'needs-human' : classification?.outcome;
  let action: 'pr' | 'comment' | 'none' = 'none';
  if (mode === 'open-pr') {
    if (built && classification?.outcome === 'update-docs' && draft && verification) action = 'pr';
    else if (outcome === 'needs-human') action = 'comment';
  }
  return { classification, draft, outcome, action, questions };
}

function recordValidation(): void {
  const install = process.env.INSTALL_RESULT ?? 'skipped';
  const build = process.env.BUILD_RESULT ?? 'skipped';
  const { outcome, action } = assess(readJson<Context>('context.json').mode, install, build);
  save('validation.json', {
    outcome,
    publication: action,
    install,
    build,
    examples: 'Inline snippets were not executed. Existing source example references are reviewed by the verifier.',
  });
  output('publication', action);
}

// One comment per source PR, updated on reruns, so the original author sees the result where they work.
function upsertSourceComment(context: Context, lines: string[]): string {
  const marker = `<!-- docs-automation: ${context.repository}#${context.source.number} -->`;
  const issue = `repos/${context.repository}/issues/${context.source.number}`;
  const body = [marker, ...lines].join('\n');
  type Comment = { id: number; body: string; user: { login: string } };
  for (let page = 1; ; page++) {
    const comments = api<Comment[]>(`${issue}/comments?per_page=100&page=${page}`);
    const previous = comments.find((c) => c.user.login === 'github-actions[bot]' && c.body.startsWith(marker));
    if (previous) {
      const endpoint = `repos/${context.repository}/issues/comments/${previous.id}`;
      return api<{ html_url: string }>(endpoint, 'PATCH', { body }).html_url;
    }
    if (comments.length < 100) break;
  }
  return api<{ html_url: string }>(`${issue}/comments`, 'POST', { body }).html_url;
}

function publish(): void {
  const context = readJson<Context>('context.json');
  const validation = readJson<{ install: string; build: string }>('validation.json');
  const { classification, draft, action, questions } = assess(context.mode, validation.install, validation.build);
  if (context.repository !== process.env.GITHUB_REPOSITORY || action === 'none' || !classification) {
    throw new Error('Publication preconditions failed');
  }
  const run = `https://github.com/${context.repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const questionList = questions.map((question) => `- ${safe(question)}`);
  if (action === 'comment') {
    const url = upsertSourceComment(context, [
      '**Documentation check: needs human input**',
      '',
      ...questionList,
      '',
      `[Workflow run and artifacts](${run})`,
    ]);
    save('publication.json', { url, status: 'Commented on the source PR with open questions' });
    return;
  }
  if (!draft) throw new Error('Publication preconditions failed');
  const needsInput = questions.length > 0;
  const status = needsInput ? 'needs human input' : 'ready for review';
  const branch = `docs/automated-pr-${sourceNumber(String(context.source.number))}`;
  const owner = context.repository.split('/')[0];
  const existing = api<{ html_url: string }[]>(
    `repos/${context.repository}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}`
  );
  if (existing.length) {
    const url = existing[0].html_url;
    upsertSourceComment(context, [`**Existing documentation PR:** ${url}. [Latest run](${run}).`]);
    save('publication.json', { url, status: 'Existing PR retained' });
    return;
  }
  // Recreate the reviewed patch on a clean pinned checkout, then re-check it as the draft stage did.
  if (git(['status', '--porcelain']).trim()) throw new Error('Publication needs a clean checkout');
  validateClassification(repo, classification);
  git(['apply', '--index', artifact('docs.patch')]);
  captureDraft();
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
  const body = [
    `<!-- docs-automation: ${context.repository}#${context.source.number} -->`,
    `Documentation follow-up for #${context.source.number}. Status: **${status}**.`,
    '',
    safe(classification.userImpact),
    ...(questions.length ? ['', '## Open Questions', ...questionList] : []),
    '',
    '## Evidence',
    ...classification.evidence.map(
      (item) =>
        `- [${item.path}:${item.line}](https://github.com/${context.repository}/blob/${context.baseSha}/${item.path}#L${item.line}): ${safe(item.reason)}`
    ),
    '',
    '## Reviewer Checks',
    safe(draft.notes),
    '',
    `Drafted with \`${context.models.draft}\` and checked with \`${context.models.verify}\` at ${context.effort} effort. [Verification and Hugo build](${run}). Inline examples require manual testing.`,
  ].join('\n');
  const created = api<{ number: number; html_url: string }>(`repos/${context.repository}/pulls`, 'POST', {
    title: `docs: follow up on #${context.source.number}${needsInput ? ' (needs input)' : ''}`,
    head: branch,
    base: context.baseBranch,
    body,
    draft: true,
  });
  // Save and link the PR before assigning so a failed assignment remains recoverable and visible.
  save('publication.json', { url: created.html_url, status: 'Created draft PR; assignment pending' });
  upsertSourceComment(context, [`**Documentation follow-up:** ${created.html_url}, ${status}.`]);
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
  else if (command === 'publish') publish();
  else if (command === 'summary') {
    mkdirSync(runDir, { recursive: true });
    renderSummary();
  } else throw new Error(`Unknown command: ${command}`);
}
