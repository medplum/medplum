# Documentation Assistant: Manual Pilot

Evaluate a merged PR against current code and docs, then optionally draft its missing documentation. Only `workflow_dispatch` is enabled; comments and merges do not trigger runs.

## Run the Pilot

1. Merge this workflow into the default branch so GitHub can register its manual trigger. Reuse the existing `ANTHROPIC_API_KEY` Actions secret.
2. Open **Actions → Documentation assistant (manual pilot) → Run workflow**, enter a merged PR number, and choose:
   - `classify`: documentation decision, evidence, and page plan.
   - `draft` (default): also generate, format, verify, and build a patch. Publishes no branch or PR.
   - `open-pr`: also open a draft docs PR and assign the original human author, after all checks pass.
3. Review the run summary and download `docs-review-<number>` for the decisions, patch, and validation results. Artifacts expire after 14 days. Treat summaries and artifacts as public; raw agent transcripts are excluded.

```bash
gh workflow run docs-automation.yml --repo medplum/medplum -f pr_number=11443 -f mode=draft
```

For `open-pr`, enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings. PRs opened with `GITHUB_TOKEN` create CI runs requiring a maintainer to select **Approve workflows to run**. The existing build workflow then deploys previews. A GitHub App token can enable unattended CI later. See [GitHub token behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Review the Rules

| File | Responsibility |
| --- | --- |
| [Classify](prompts/classify.md) | User impact, existing coverage, evidence, and exact page plan |
| [Draft](prompts/draft.md) | Accuracy, writing, examples, Hugo markup, and visuals |
| [Verify](prompts/verify.md) | Independent review against the shared drafting rules |
| [Config](config.json) | Model, effort, budgets, scope limits, and fallback assignee |
| [Agent settings](agent-settings.json) | Read boundaries and disabled hooks |
| [Workflow](../../.github/workflows/docs-automation.yml) | Manual inputs, checks, and separate publication job |

Classification returns `no-docs`, `already-covered`, `update-docs`, or `needs-human`. Conclusive decisions require source evidence; drafting requires a concrete plan. The controller uses the landed diff, including merge resolutions. Single-parent commits must match the complete PR patch; ambiguous multi-commit rebases and oversized changes need human review. Code is read at the recorded current default-branch revision, so the pilot finds gaps remaining today.

All three agent passes use read/search tools and structured output. Project settings and hooks are disabled; file reads outside working directories and sensitive file reads are blocked. The controller validates and applies planned file contents. Publication runs separately with write permissions and no Anthropic credential.

Writes cover hand-written Markdown guides, API guides/indexes, and FHIR resource notes. Generated FHIR type pages, SDK pages, decision guides/downloads, examples, code, templates, navigation, and assets require human work. Necessary changes outside scope become questions rather than a partial fix.

Writing rules apply only when relevant: make the smallest complete change. New titles and headings use title case; small updates preserve existing headings and anchors. Optional long examples may use `<details>/<summary>`. The drafting prompt holds the full guidance, informed by existing Medplum docs and the [docs README](../../packages/docs/README.md).

## Checks and Limits

- Validate evidence locations, planned paths, file sizes, front matter, and symlinks. Reject script/iframe tags; this is not a general HTML sanitizer.
- Run Prettier, whitespace checks, independent AI verification, and the Hugo build. The build uses the existing 16-core runner, pinned npm, 8 GB Node heap, optional Turbo cache, and its own 30-minute timeout.
- Uncertainty at any agent stage produces `needs-human` and blocks publication. Invalid output and execution failures fail the run. New inline executable examples require human execution review and block publication.
- Humans review accuracy, release availability, examples, and rendered layout before merge. Hugo does not render Mermaid or execute snippets.

The baseline is **`claude-sonnet-5-5`, `high` effort**, recorded with source revisions. Each pass allows 40 turns and 20 minutes; estimated spending limits are $3/$5/$3 for classify/draft/verify. Configuration accepts `low`, `medium`, `high`, `xhigh`, and `max`; supported levels depend on the model. The existing mention-based Claude integration is unchanged.

Stable `docs/automated-pr-<number>` branches prevent duplicates. Existing PRs retain reviewer edits; orphan branches are reused only with identical contents. Set `fallbackAssignee` for bot-authored source PRs. Assignment failures retain the PR URL for recovery.

## Validate and Roll Out

```bash
node --test scripts/docs-automation/run.test.ts
npx tsc -p scripts/docs-automation/tsconfig.json
```

Start with a mix of features, fixes, internal refactors, and PRs that already include docs. Review skipped decisions as well as drafts. Live runs must confirm model quality, repository permissions, assignment, CI approval, and previews. Automatic triggering belongs in a separate reviewed change after calibration.
