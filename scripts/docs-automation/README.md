# Documentation Assistant

Run this workflow on a merged PR to check whether Medplum's current docs cover the change. The pilot runs manually.

## Run It

Once the workflow is on the default branch, open **Actions → Documentation assistant (manual pilot) → Run workflow**. Enter the number of a merged PR that targeted the default branch and choose a mode.

| Mode | Result |
| --- | --- |
| `classify` | A decision, source evidence, and a page plan if the docs need edits |
| `draft` (default) | Also drafts the planned edits, checks them in a separate Claude pass, and builds the site. The patch stays in the run artifacts. |
| `open-pr` | Also opens a draft docs PR for a patch that builds, assigns it to the original author, and links it from the source PR. Open questions appear at the top of the draft and add `(needs input)` to its title. If human input is needed and there is no buildable patch, the source PR gets a comment with the details. |

You can also start a run with the GitHub CLI.

```bash
gh workflow run docs-automation.yml --repo medplum/medplum -f pr_number=11443 -f mode=draft
```

The run summary and `docs-review-<number>` artifact contain the decision, evidence, patch (if any), and check results. Treat these as public. Artifacts expire after 14 days. Raw agent transcripts stay out of the upload.

The workflow uses the existing `ANTHROPIC_API_KEY` secret. For `open-pr`, enable **Allow GitHub Actions to create and approve pull requests**. A maintainer selects **Approve workflows to run** on the docs PR to start CI and build its preview. Set `fallbackAssignee` for bot-authored source PRs. [GitHub token behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Review the Rules

- [Classification](prompts/classify.md) defines the four outcomes and which pages the assistant may edit, including hand-written API guides and FHIR resource notes.
- [Drafting](prompts/draft.md) covers Medplum writing style, examples, Hugo markup, and visuals. The [verifier](prompts/verify.md) checks the patch against the same guidance and current source. Reviewers run new inline examples and inspect the rendered page.
- [Configuration](config.json) sets the model (Sonnet 5.5 at high effort), file and diff limits, and per-pass budgets. Each pass gets 40 turns and 20 minutes. The spending limits are $3 for classification, $5 for drafting, and $3 for verification.

The controller reads the landed diff and checks coverage against the current default branch. Ambiguous merge history or oversized changes go to human review. For single-parent commits, the changed paths must match the PR file list and the parent must belong outside the PR.

Classification and verification have read/search tools. The drafter can edit only planned Markdown paths. [Agent settings](agent-settings.json) restrict reads and disable hooks. The controller checks the changed files, symlinks, size, front matter, and script/iframe tags before building. A separate job with GitHub write access reapplies the patch to a clean checkout and repeats the file checks. Reruns preserve existing PRs and reviewer edits.

## Test the Pilot

```bash
node --test scripts/docs-automation/run.test.ts
npx tsc -p scripts/docs-automation/tsconfig.json
```

Try a feature, a bug fix, an internal refactor, and a PR that already updated its docs. Review the decisions to skip as well as the drafts. Use `open-pr` to check assignment, comments, CI approval, and previews.

For automatic runs, dispatch this workflow after a merge to the default branch with the merged PR number and `mode: open-pr`. The stages run through PR creation without intermediate approvals. For unattended CI and previews on the new PR, use a GitHub App installation token in the publish job and update the source-comment lookup to recognize the app's bot login.
