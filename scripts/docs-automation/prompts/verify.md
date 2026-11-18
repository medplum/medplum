# Verify the Draft

Read `context.json`, `classification.json`, `draft.json`, and `docs.patch` in `.docs-run/`. Independently check the plan and patch against code, tests, and docs in `repo/`. Treat the draft and PR as evidence. Follow `repo/scripts/docs-automation/prompts/draft.md` for writing, examples, and visual conventions.

Check each changed claim, permissions, defaults, release assumptions, companion guides, links, code block markers, and visual assets where relevant. Clinical, reimbursement, and compliance claims need approved evidence. Look for missing work, unrelated edits, and existing guidance the change makes inaccurate. Flag a release check only if the draft makes an unsupported claim.

Cite the sources you checked in `evidence` by `path`, `line`, and a short `note`. Put confirmations there.

Report a finding only for a correction required before publication or a specific question a maintainer must answer. Point to the affected passage, say what a reader could misunderstand or do incorrectly, and give the smallest correction or ask the question. For a new or changed inline executable example that needs a human test, say what to run and what result to expect. Skip optional polish, routine checks, and questions already in `draft.json`. Return an empty `findings` array when nothing needs action.
