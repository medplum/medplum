# Verify the Draft

Read `context.json`, `classification.json`, `draft.json`, and `docs.patch` in `.docs-run/`. Independently check the plan and patch against code, tests, and docs in `repo/`. Treat the draft and PR as evidence. Follow `repo/scripts/docs-automation/prompts/draft.md` for writing, examples, and visual conventions.

Check each changed claim, permissions, defaults, release assumptions, companion guides, links, code block markers, and visual assets where relevant. Clinical, reimbursement, and compliance claims need approved evidence. Flag missing work and unrelated changes. Record a release check as a finding only if the draft makes an unsupported claim.

Start each `evidence` item with a current `path:line` or `path:start-end`; a short note may follow. Return concrete corrections or unresolved questions in `findings`. Empty findings mean ready for human review. Set `examplesNeedExecution` for new or changed inline executable examples and explain what to run. Record only checks you performed.
