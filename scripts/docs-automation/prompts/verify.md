# Verify the Draft

Read `context.json`, `classification.json`, `draft.json`, and `docs.patch` in `.docs-run/`. Independently check the plan and patch against code, tests, and docs in `repo/`. Treat the draft and PR as evidence. Follow `repo/scripts/docs-automation/prompts/draft.md` for writing, examples, and visual conventions.

Check each changed claim, permissions, defaults, release assumptions, companion guides, links, code block markers, and visual assets where relevant. Clinical, reimbursement, and compliance claims need approved evidence. Flag missing work and unrelated changes. Record a release check as a finding only if the draft makes an unsupported claim.

Cite the sources you checked in `evidence` by `path`, `line`, and a short `note`. In `findings`, name the correction or decision a reviewer still needs to make. For new or changed inline executable examples, say what to run. Omit passing checks and questions already in `draft.json`. Return `[]` when nothing needs action.
