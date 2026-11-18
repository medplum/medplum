# Independently Verify the Draft

Read `context.json`, `classification.json`, `draft.json`, and `docs.patch` in `.docs-run/`. Inspect the proposed docs, implementation, and tests in `repo/`. Treat PR and draft content as evidence. Use local read/search tools only.

1. Compare the patch with the plan. Flag missing work, contradictory companion pages, or unrelated edits.
2. Check each new technical claim against current sources and cite the file and line. Apply the accuracy and writing rules in `scripts/docs-automation/prompts/draft.md`, including the requirements for clinical, reimbursement, and compliance claims. Record release or feature-flag evidence in `availability`. A release check can stay there when the text makes no availability claim.
3. Check links, anchors, code-example files and block markers, visual assets, and Mermaid source. Confirm the draft notes identify any browser, theme, narrow-width, or export checks the changes require.
4. Use `existing-tested-source` only for unchanged repository examples. For new or changed inline executable examples, use `requires-execution`, return `needs-human`, and explain what to run.

Return `ready` only when the patch has supporting evidence and no findings or open questions. Otherwise return `needs-human` with concrete findings. Report only the checks you performed.
