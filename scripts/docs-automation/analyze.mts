import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod/v4';
import config from './config.json' with { type: 'json' };
import { append, capturePatch, checkedPath, docPath, load, read, run, save } from './pilot.mts';

const text = z.string().min(1).max(1600);
const list = z.array(text).max(8);
const schemas = {
  classify: z.strictObject({
    outcome: z.enum(['no-docs', 'already-covered', 'update-docs', 'needs-human']),
    summary: text,
    pages: z.array(text).max(config.maxDraftFiles),
    evidence: list,
    questions: list,
  }),
  draft: z.strictObject({ notes: text, questions: list }),
  verify: z.strictObject({ findings: list, evidence: list }),
};
type Stage = keyof typeof schemas;

function ask(stage: Stage, pages: string[] = []): unknown {
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
function evidence(citations: string[]): string[] {
  return citations.map(relative).filter((ref) => {
    const match =
      /^((?:packages|examples|scripts|charts|terraform|\.github)\/[^:\s]+):([1-9]\d*)(?:-([1-9]\d*))?\b/.exec(ref);
    if (!match) return false;
    const lines = read(checkedPath(match[1])).split(/\r\n|[\r\n]/);
    if (lines.at(-1) === '') lines.pop();
    const start = Number(match[2]);
    const end = Number(match[3] ?? match[2]);
    assert(start <= end && end <= lines.length, `Invalid evidence: ${ref}`);
    return true;
  });
}

function classify(value: unknown): z.infer<typeof schemas.classify> {
  const plan = schemas.classify.parse(value);
  plan.evidence = evidence(plan.evidence);
  plan.pages = plan.pages.map(relative);
  assert((plan.outcome === 'needs-human') === !!plan.questions.length, 'An unresolved decision needs questions');
  assert(plan.outcome === 'needs-human' || plan.evidence.length, 'A conclusive decision needs evidence');
  const citesDocs = plan.evidence.some((ref) => ref.startsWith('packages/docs/'));
  assert(plan.outcome !== 'already-covered' || citesDocs, 'Cite the existing docs');
  assert(
    (plan.outcome === 'update-docs') === !!plan.pages.length && new Set(plan.pages).size === plan.pages.length,
    'Invalid page plan'
  );
  plan.pages.forEach(docPath);
  save('classification.json', plan);
  return plan;
}

export function review(agent = ask): void {
  const plan = existsSync(run + '/classification.json')
    ? schemas.classify.parse(load('classification.json'))
    : classify(agent('classify'));
  const questions = [...plan.questions];
  const details = [plan.summary, ...plan.evidence, ...plan.pages];
  let tree = '';
  if (process.env.MODE !== 'classify' && plan.outcome === 'update-docs') {
    const draft = schemas.draft.parse(agent('draft', plan.pages));
    save('draft.json', draft);
    details.push(draft.notes);
    questions.push(...draft.questions);
    tree = capturePatch(plan.pages, draft.questions.length > 0);
    if (tree) {
      const check = schemas.verify.parse(agent('verify'));
      check.evidence = evidence(check.evidence);
      if (!check.evidence.length)
        check.findings.push('Check the draft against the implementation. The verifier cited no source.');
      save('verification.json', check);
      questions.push(...check.findings);
      details.push(...check.evidence);
    }
  }
  const lines = [`**${questions.length ? 'needs-human' : plan.outcome}**`];
  if (questions.length) {
    lines.push('### Open Questions', questions.map((q) => '- ' + q).join('\n'));
  }
  const report = [...lines, ...new Set(details)].join('\n\n').replaceAll('@', '@\u200b').replaceAll('<', '&lt;') + '\n';
  writeFileSync(run + '/review.md', report);
  append('GITHUB_STEP_SUMMARY', '\n' + report);
  append('GITHUB_OUTPUT', `tree=${tree}\nneeds_input=${questions.length > 0}`);
}

if (import.meta.main) review();
