# Documentation Assistant: Manual Pilot

Evaluate a merged PR against current code and docs, then optionally draft its missing documentation. Only `workflow_dispatch` is enabled; comments and merges do not trigger runs.

## Run the Pilot

1. Merge this workflow into the default branch so GitHub can register its manual trigger. Reuse the existing `ANTHROPIC_API_KEY` Actions secret.
2. Open **Actions → Documentation assistant (manual pilot) → Run workflow**, enter a merged PR number, and choose:
   - `classify`: documentation decision, evidence, and page plan.
   - `draft` (default): also generate, verify, and build a patch. Posts nothing to GitHub.
   - `open-pr`: also publish the result, as described below.
3. Review the run summary and download `docs-review-<number>` for the decisions, patch, and validation results. Artifacts expire after 14 days. Treat summaries and artifacts as public; raw agent transcripts are excluded.

In `open-pr` mode, results reach the original PR author:

| Result | What is posted |
| --- | --- |
| Patch that builds, verified ready | Draft docs PR assigned to the author, plus a comment on the source PR linking it |
| Patch that builds, with open questions or findings | Same draft PR, titled "(needs input)", with the questions listed at the top |
| `needs-human` without a buildable patch | A comment on the source PR listing the questions and linking the run |
| `no-docs` or `already-covered` | Nothing; the decision stays in the run summary |

The source-PR comment is updated on reruns instead of duplicated. Model text in PR bodies and comments has `@` mentions and HTML neutralized.

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

Classification returns `no-docs`, `already-covered`, `update-docs`, or `needs-human`. Conclusive decisions require source evidence; drafting requires a concrete plan. The controller uses the landed diff, including merge resolutions. For single-parent commits, changed paths must match the PR file list, including renamed paths, and the parent must not belong to the same PR. Ambiguous merge histories and oversized changes need human review. Code is read at the recorded current default-branch revision, so the pilot finds gaps remaining today.

Classification and verification use read/search tools only. The drafter can also edit, but only the exact files in the classification plan: its Claude Code permission rules allow `Edit(repo/<planned path>)` and deny every other write, including other docs pages. All passes return structured output. Project settings and hooks are disabled; file reads outside working directories and sensitive file reads are blocked. Claude Code still allows reads of its own `~/.claude` folder, which on the runner holds the action's settings and session files; credential files there are denied. After drafting, the controller checks every changed file on disk against the plan, path rules, symlinks, size, front matter, and tag checks, then captures the patch. The publish job applies that patch to a clean checkout and repeats the checks. The controller also normalizes `repo/`-prefixed paths and ignores run artifacts cited as evidence. Publication runs separately with write permissions and no Anthropic credential.

Writes cover hand-written Markdown guides, API guides/indexes, and FHIR resource notes. Generated FHIR type pages, SDK pages, decision guides/downloads, examples, code, templates, navigation, and assets require human work. Necessary changes outside scope become questions rather than a partial fix.

Writing rules apply only when relevant: make the smallest complete change. New titles and headings use title case; small updates preserve existing headings and anchors. Optional long examples may use `<details>/<summary>`. The drafting prompt holds the full guidance, informed by existing Medplum docs and the [docs README](../../packages/docs/README.md).

## Checks and Limits

- Validate evidence locations, planned paths, file sizes, front matter, and symlinks. Reject script/iframe tags; this is not a general HTML sanitizer.
- Run whitespace checks, independent AI verification, and the Hugo build. Prettier is not applied: docs Markdown is not Prettier-formatted, so formatting whole files would rewrite unrelated tables and shortcodes. The build uses the existing 16-core runner, pinned npm, 8 GB Node heap, optional Turbo cache, and its own 30-minute timeout.
- Uncertainty at any agent stage produces `needs-human`. A draft with questions keeps its supported edits, which are verified, built, and published as a "(needs input)" draft PR in `open-pr` mode. New inline executable examples also require human execution review. Release availability and preview checks go in the draft notes, which appear in the PR body. Invalid output and execution failures fail the run.
- Humans review accuracy, release availability, examples, and rendered layout before merge. Hugo does not render Mermaid or execute snippets.

The baseline is **`claude-sonnet-5-5`, `high` effort**, recorded with source revisions. Each pass allows 40 turns and 20 minutes; estimated spending limits are $3/$5/$3 for classify/draft/verify. Configuration accepts `low`, `medium`, `high`, `xhigh`, and `max`; supported levels depend on the model. The existing mention-based Claude integration is unchanged.

Stable `docs/automated-pr-<number>` branches prevent duplicates. Existing PRs retain reviewer edits; orphan branches are reused only with identical contents. Set `fallbackAssignee` for bot-authored source PRs. Assignment failures retain the PR URL for recovery.

## Validate and Roll Out

```bash
node --test scripts/docs-automation/run.test.ts
npx tsc -p scripts/docs-automation/tsconfig.json
```

Start with a mix of features, fixes, internal refactors, and PRs that already include docs. Review skipped decisions as well as drafts. Live runs must confirm model quality, repository permissions, assignment, CI approval, and previews. Automatic triggering belongs in a separate reviewed change after calibration.
