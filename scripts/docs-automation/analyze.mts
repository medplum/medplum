import { fromMarkdown } from 'mdast-util-from-markdown';
import { defaultHandlers, toMarkdown } from 'mdast-util-to-markdown';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import config from './config.json' with { type: 'json' };
import { append, capturePatch, checkedPath, docPath, load, read, run, save } from './pilot.mts';

const text = z.string().min(1).max(1600);
const list = z.array(text).max(8);
const relativePath = text.transform((ref) => ref.replace(/^(?:\.\/)?repo\//, ''));
const citation = z.strictObject({ path: relativePath, line: z.number().int().min(1), note: text });
const cites = z
  .array(citation)
  .max(8)
  .transform((items) => items.filter(hasLine));
const schemas = {
  classify: z.strictObject({
    outcome: z.enum(['no-docs', 'already-covered', 'update-docs', 'needs-human']),
    summary: text,
    pages: z.array(relativePath).max(config.maxDraftFiles),
    evidence: cites,
    questions: list,
  }),
  draft: z.strictObject({ notes: text, questions: list }),
  verify: z.strictObject({ findings: list, evidence: cites }),
};
function ask(stage: keyof typeof schemas, pages: string[] = []): unknown {
  const tools = ['Read', 'Glob', 'Grep'];
  const allowed = [...tools, ...pages.map((page) => `Edit(/${docPath(page)})`)];
  if (pages.length) tools.push('Edit', 'Write');
  const model = config.models[stage];
  const schema = z.toJSONSchema(schemas[stage], { target: 'draft-7', io: 'input' });
  const options = {
    '--output-format': 'json',
    '--json-schema': JSON.stringify(schema),
    '--model': model,
    '--effort': config.effort,
    '--max-turns': String(config.maxTurns),
    '--max-budget-usd': String(config.budgetUsd[stage]),
    '--tools': tools.join(','),
    '--allowedTools': allowed.join(','),
    '--permission-mode': 'dontAsk',
    '--setting-sources': 'user',
    '--settings': join(import.meta.dirname, 'agent-settings.json'),
  };
  const flags = ['--strict-mcp-config', '--no-session-persistence'];
  const prompt = read(join(import.meta.dirname, 'prompts', stage + '.md'));
  const output = execFileSync('claude', ['-p', ...Object.entries(options).flat(), ...flags, '--', prompt], {
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
  });
  const result = JSON.parse(output);
  assert(result.subtype === 'success' && result.is_error === false, stage + ' did not complete');
  append('GITHUB_STEP_SUMMARY', `- ${stage}: ${model}, ${config.effort} effort`);
  return result.structured_output;
}

function reportText(value: string): string {
  // Treat model-supplied HTML as text. Neutralize mentions in prose while preserving literal code.
  const markdown = fromMarkdown(value, { extensions: [{ disable: { null: ['htmlFlow', 'htmlText'] } }] });
  return toMarkdown(markdown, {
    bullet: '-',
    fences: true,
    handlers: {
      text(node, parent, state, info) {
        return defaultHandlers.text({ ...node, value: node.value.replaceAll('@', '@\u200b') }, parent, state, info);
      },
    },
  }).trimEnd();
}

function bullets(items: string[]): string {
  return items.map((item) => '- ' + item.replace(/\n(?=[^\n])/g, '\n  ')).join('\n');
}

function hasLine({ path, line }: z.infer<typeof citation>): boolean {
  if (!/^(packages|examples|scripts|charts|terraform|\.github)\//.test(path)) return false;
  const file = checkedPath(path);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return false;
  const lines = read(file).split(/\r\n|[\r\n]/);
  if (lines.at(-1) === '') lines.pop();
  return line <= lines.length;
}

function classify(value: unknown): z.infer<typeof schemas.classify> {
  const plan = schemas.classify.parse(value);
  assert((plan.outcome === 'needs-human') === !!plan.questions.length, 'An unresolved decision needs questions');
  assert(plan.outcome === 'needs-human' || plan.evidence.length, 'A conclusive decision needs evidence');
  const citesDocs = plan.evidence.some(({ path }) => path.startsWith('packages/docs/'));
  assert(plan.outcome !== 'already-covered' || citesDocs, 'Cite the existing docs');
  assert((plan.outcome === 'update-docs') === !!plan.pages.length, 'Invalid page plan');
  assert(new Set(plan.pages).size === plan.pages.length, 'Duplicate planned page');
  plan.pages.forEach(docPath);
  save('classification.json', plan);
  return plan;
}

export function review(agent = ask): void {
  const context = load<{ base: string; repository?: string }>('context.json');
  const repository = context.repository ?? process.env.GITHUB_REPOSITORY;
  const citations = new Map<string, string>();
  function cite(entries: z.infer<typeof cites>, edits: string[] = []): void {
    for (const { path, line, note } of entries) {
      let label = `\`${path}:${line}\``;
      if (edits.includes(path)) label = 'Draft line ' + label;
      else if (repository) label = `[${label}](https://github.com/${repository}/blob/${context.base}/${path}#L${line})`;
      if (!citations.has(label)) citations.set(label, `${label} ${reportText(note)}`);
    }
  }
  const plan = existsSync(run + '/classification.json')
    ? schemas.classify.parse(load('classification.json'))
    : classify(agent('classify'));
  const questions = new Set(plan.questions);
  cite(plan.evidence);
  let { pages } = plan;
  let notes = '';
  let tree = '';
  let headline = {
    'no-docs': 'No documentation update needed.',
    'already-covered': 'The docs already cover this change.',
    'needs-human': 'Documentation decision needed.',
    'update-docs': 'Documentation update recommended.',
  }[plan.outcome];
  if (process.env.MODE !== 'classify' && plan.outcome === 'update-docs') {
    const draft = schemas.draft.parse(agent('draft', pages));
    save('draft.json', draft);
    notes = draft.notes;
    draft.questions.forEach((q) => questions.add(q));
    ({ tree, pages } = capturePatch(pages, draft.questions.length > 0));
    if (tree) {
      const check = schemas.verify.parse(agent('verify'));
      if (!check.evidence.length)
        questions.add('Check the draft against the implementation. The verifier cited no source.');
      save('verification.json', check);
      check.findings.forEach((q) => questions.add(q));
      cite(check.evidence, pages);
    }
    headline = pages.length ? `Drafted ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}.` : 'No pages drafted.';
    if (questions.size) headline += ` ${questions.size} ${questions.size === 1 ? 'item needs' : 'items need'} review.`;
  }
  const lines = [`**${headline}**`];
  if (questions.size) {
    lines.push('### Needs attention');
    if (tree) lines.push('Address these items before merging.');
    lines.push(bullets(Array.from(questions, reportText)));
  }
  if (!questions.has(plan.summary)) lines.push('### Summary', reportText(plan.summary));
  if (pages.length)
    lines.push(notes ? '### Pages drafted' : '### Planned pages', bullets(pages.map((p) => `\`${p}\``)));
  if (notes) lines.push('### Reviewer notes', reportText(notes));
  if (citations.size)
    lines.push('<details><summary>Evidence</summary>', bullets([...citations.values()]), '</details>');
  const report = lines.join('\n\n') + '\n';
  writeFileSync(run + '/review.md', report);
  append('GITHUB_STEP_SUMMARY', '\n' + report);
  append('GITHUB_OUTPUT', `tree=${tree}\nneeds_input=${questions.size > 0}`);
}

if (import.meta.main) review();
