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
const maxItems = 8;
const list = z.array(text).max(maxItems);
const cites = z.array(z.strictObject({ path: text, line: z.number().int().min(1), note: text })).max(8);
const schemas = {
  classify: z.strictObject({
    outcome: z.enum(['no-docs', 'already-covered', 'update-docs', 'needs-human']),
    summary: text,
    pages: z.array(text).max(config.maxDraftFiles),
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
  const schema = z.toJSONSchema(schemas[stage], { target: 'draft-7' });
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

const relative = (ref: string): string => ref.replace(/^(?:\.\/)?repo\//, '');
const cited = (c: z.infer<typeof cites>[number]): string => `\`${c.path}:${c.line}\` ${reportText(c.note)}`;

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

function evidence(citations: z.infer<typeof cites>): z.infer<typeof cites> {
  return citations
    .map((c) => ({ ...c, path: relative(c.path) }))
    .filter(({ path, line }) => {
      if (!/^(packages|examples|scripts|charts|terraform|\.github)\//.test(path)) return false;
      const file = checkedPath(path);
      if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return false;
      const lines = read(file).split(/\r\n|[\r\n]/);
      if (lines.at(-1) === '') lines.pop();
      return line <= lines.length;
    });
}

function classify(value: unknown): z.infer<typeof schemas.classify> {
  const plan = schemas.classify.parse(value);
  plan.evidence = evidence(plan.evidence);
  plan.pages = plan.pages.map(relative);
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

function reviewReport(
  plan: z.infer<typeof schemas.classify>,
  attention: string[],
  citations: string[],
  draft?: { pages: string[]; notes: string }
): string {
  let headline = {
    'no-docs': 'No documentation update needed.',
    'already-covered': 'The docs already cover this change.',
    'needs-human': 'The documentation decision needs review.',
    'update-docs': 'Documentation update recommended.',
  }[plan.outcome];
  if (draft) {
    const count = draft.pages.length;
    headline = count ? `Drafted ${count} ${count === 1 ? 'page' : 'pages'}.` : 'No pages drafted.';
  }
  if (attention.length)
    headline += ` ${attention.length} ${attention.length === 1 ? 'item needs' : 'items need'} review.`;
  const lines = [`**${headline}**`];
  if (attention.length) lines.push('### Needs attention', bullets(attention.map(reportText)));
  if (!attention.includes(plan.summary)) lines.push('### Summary', reportText(plan.summary));
  const pages = draft?.pages ?? plan.pages;
  if (pages.length)
    lines.push(draft ? '### Pages drafted' : '### Planned pages', bullets(pages.map((p) => `\`${p}\``)));
  if (draft) lines.push('### Reviewer notes', reportText(draft.notes));
  if (citations.length)
    lines.push('<details><summary>Evidence</summary>', bullets([...new Set(citations)]), '</details>');
  return lines.join('\n\n') + '\n';
}

export function review(agent = ask): void {
  const plan = existsSync(run + '/classification.json')
    ? schemas.classify.parse(load('classification.json'))
    : classify(agent('classify'));
  const questions = [...plan.questions];
  const citations = plan.evidence.map(cited);
  let drafted: { pages: string[]; notes: string } | undefined;
  let tree = '';
  if (process.env.MODE !== 'classify' && plan.outcome === 'update-docs') {
    const draft = schemas.draft.parse(agent('draft', plan.pages));
    save('draft.json', draft);
    questions.push(...draft.questions);
    const patch = capturePatch(plan.pages, draft.questions.length > 0);
    tree = patch.tree;
    drafted = { pages: patch.pages, notes: draft.notes };
    if (tree) {
      const check = schemas.verify.parse(agent('verify'));
      check.evidence = evidence(check.evidence);
      if (!check.evidence.length) {
        // Keep the controller warning in the report even when all verifier slots are in use.
        const items = check.findings.length === maxItems ? questions : check.findings;
        items.push('Check the draft against the implementation. The verifier cited no source.');
      }
      save('verification.json', check);
      questions.push(...check.findings);
      citations.push(...check.evidence.map(cited));
    }
  }
  const report = reviewReport(plan, [...new Set(questions)], citations, drafted);
  writeFileSync(run + '/review.md', report);
  append('GITHUB_STEP_SUMMARY', '\n' + report);
  append('GITHUB_OUTPUT', `tree=${tree}\nneeds_input=${questions.length > 0}`);
}

if (import.meta.main) review();
