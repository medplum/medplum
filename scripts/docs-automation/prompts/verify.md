# Verify the Draft

Read `context.json`, `source.diff`, `classification.json`, `draft.json`, and `docs.patch` in `.docs-run/`. Use the landed diff to identify what changed. Independently check the plan and patch against current code, tests, and docs in `repo/`. Use `repo/scripts/docs-automation/prompts/draft.md` as the checklist for writing, examples, and visuals.

Check each changed claim against the full code path, including guards, early returns, and exceptions that limit broad claims. Check permissions, defaults, release assumptions, companion guides, links, code block markers, and visual assets where relevant. Clinical, reimbursement, and compliance claims need approved evidence. Look for missing work, unrelated edits, and existing guidance the change makes inaccurate.

Cite the sources you checked in `evidence` by `path`, `line`, and a short `note`. Put confirmations there, never in `findings`.

Report every correction required before publication and every specific question a maintainer must answer, not only the most important. Required corrections include a claim about earlier or later Medplum behavior without a cited release, and an inline example that uses undefined names or would not run as written. Point to the affected passage, say what a reader could misunderstand or do incorrectly, and give the smallest correction or ask the question. For a new or changed inline executable example that needs a human test, say what to run and what result to expect. Skip optional polish, routine or preview checks, and questions already in `draft.json`.

Group related fixes. If more than eight independent findings remain, report the seven most consequential and use the eighth to say the review is incomplete and name the remaining affected pages. Return an empty `findings` array when nothing needs action.
