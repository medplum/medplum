# Documentation Assistant

After merge, open **Actions → Documentation assistant (manual pilot) → Run workflow**, enter a merged PR number, and choose a mode. Use `classify` for a decision, `draft` (default) for a verified patch and docs build, or `open-pr` to publish. The [classification criteria](prompts/classify.md) and [writing guidelines](prompts/draft.md) are the main review points.

```bash
gh workflow run docs-automation.yml --repo medplum/medplum -f pr_number=11443 -f mode=draft
```

Opus 5.5 classifies and drafts. Sonnet 5.5 verifies. Each stage uses high effort and has its own spending limit. The run summary links the decision to the source PR. Public artifacts keep the landed diff, evidence, review notes, and any patch for 14 days. [Configuration](config.json)

`open-pr` assigns a buildable draft to the source author and flags outstanding findings in its title. The source PR links to the draft, or gets a comment if questions or a build failure prevent publication. Reruns link the existing PR and latest run, preserving reviewer edits. For `no-docs` and `already-covered`, see the Actions summary. Set `fallbackAssignee` for bot-authored PRs.

Use the existing `ANTHROPIC_API_KEY` secret and enable **Allow GitHub Actions to create and approve pull requests**. A maintainer approves CI on the new docs PR to get its preview. A later merge trigger can dispatch this workflow in `open-pr` mode without approvals between stages. For unattended previews, use a GitHub App token to publish and update the comment author lookup. [GitHub token behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
