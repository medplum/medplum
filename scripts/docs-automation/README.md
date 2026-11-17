# Documentation assistant: manual pilot

This workflow evaluates one merged PR against the current default branch, produces a reviewable documentation decision, and optionally drafts updates. It has only a `workflow_dispatch` trigger. Merging the workflow does not enable automatic runs.

## Review these files first

| File | What to review |
| --- | --- |
| [Classification prompt](prompts/classify.md) | User-impact rubric, positive/negative examples, coverage evidence, uncertainty handling |
| [Drafting prompt](prompts/draft.md) | Medplum rules, voice, heading case, lists/tables, code examples, visuals, Hugo formatting, and availability |
| [Verification prompt](prompts/verify.md) | Independent accuracy, completeness, links, and example checks |
| [Configuration](config.json) | Model, effort, cost/turn limits, source-to-docs hints, fallback assignee |
| [Workflow](../../.github/workflows/docs-automation.yml) | Manual inputs, read-only agent jobs, validation, and separate publication job |

## Setup and first run

1. Merge the reviewed workflow into the default branch. GitHub requires a `workflow_dispatch` workflow to exist there before dispatching it, including when selecting a different branch to run. Review the prompts before merging; no background trigger is included.
2. Reuse the repository's existing `ANTHROPIC_API_KEY` Actions secret. No new provider credential is needed. The existing mention-based Claude workflow is unchanged.
3. In **Actions → Documentation assistant (manual pilot) → Run workflow**, enter a merged PR number and choose a mode:
   - `classify`: save only the decision, evidence, and proposed page plan.
   - `draft` (default): also generate a patch, format it, independently verify it, and build the docs. No branches, PRs, comments, or assignments are created.
   - `open-pr`: perform the same checks, then create a draft docs PR only if all publication checks pass.
4. Read the run summary and download `docs-review-<number>`. It contains `classification.json`, the proposed `draft.json` and `docs.patch` when applicable, `verification.json`, and `validation.json`. Failed and uncertain runs retain available artifacts for review. Artifacts expire after 14 days; download calibration results you want to retain.
5. For publication, repository settings must permit GitHub Actions to create PRs. The publisher uses `GITHUB_TOKEN`; GitHub may require approval to start CI on that bot-created PR. A dedicated GitHub App can replace this token later if unattended CI is required. The agent job itself has only read permissions.

CLI equivalent after the workflow is registered on the default branch:

```bash
gh workflow run docs-automation.yml --repo medplum/medplum -f pr_number=11443 -f mode=classify
gh workflow run docs-automation.yml --repo medplum/medplum -f pr_number=11443 -f mode=draft
```

Use a small mix of new features, behavior fixes, internal refactors, and PRs that already updated their docs. No PR author questionnaire is required. This pilot finds gaps remaining **today**; it is not a historical benchmark of the docs at merge time. Both revisions are recorded in the context artifact.

## Classification and drafting behavior

The controller validates merged status, default-branch targeting, complete file retrieval, and source revision ancestry. It retrieves the PR diff without checking out or executing the PR branch. Large PRs become `needs-human` rather than receiving a decision from a truncated diff. Dependency, CI, and test changes are not blanket exclusions.

Claude returns `no-docs`, `already-covered`, `update-docs`, or `needs-human`. A conclusive decision needs existing local evidence with valid line numbers. `already-covered` requires documentation evidence. `update-docs` needs a specific per-file plan and no unresolved questions. A code validator checks structure, evidence locations, and file scope; it cannot prove the semantic truth of a citation. That is assessed by the verifier and human reviewer.

All three agent passes use only local read/search tools and return structured JSON. The drafting agent returns replacement file contents. A deterministic controller validates the response and applies only planned Markdown edits. The publisher runs separately with write permissions and without the Anthropic credential.

Pilot writes are limited to ordinary Markdown guides in `packages/docs/content/docs/` and hand-written FHIR notes in `packages/docs/assets/fhir/resources/`. SDK/API-generated pages, decision guides with downloadable exports, examples, application code, templates, navigation configuration, and agent/workflow instructions need human work. New pages must be linked from an existing relevant page in the proposed patch.

## Basis for the writing guidance

The drafting guidance was calibrated on a cross-section of the repository's docs on 2026-11-17, at upstream revision `c956ffb66`. These are examples of editorial patterns; technical claims still require current implementation and documentation evidence.

| Sample | Pattern used in the drafting guidance |
| --- | --- |
| [FHIR Basics](../../packages/docs/content/docs/fhir-basics.md) and [Working with FHIR Data](../../packages/docs/content/docs/fhir-datastore/working-with-fhir.md) | Explain FHIR concepts through familiar relationships and a concrete healthcare workflow; connect examples with consistent resources. |
| [Basic Search](../../packages/docs/content/docs/search/basic-search.md) | Introduce the operation, show source-backed TypeScript/cURL examples, explain the returned data, and use tables for parameter comparisons. |
| [Appointment $book](../../packages/docs/content/docs/scheduling/appointment-book.md) | Operation references cover inputs, constraints, output, and errors; lists distinguish use cases and ordered behavior. |
| [Messaging Data Model](../../packages/docs/content/docs/communications/messaging-data-model.md) and [Scheduling](../../packages/docs/content/docs/scheduling/_index.md) | Mermaid explains resource relationships; nearby prose and field labels supply the meaning. |
| [Bot Basics](../../packages/docs/content/docs/bots/bot-basics.md) and [Provider Tasks](../../packages/docs/content/docs/provider/tasks/index.md) | Screenshots accompany UI actions and identify controls; examples and instructions establish the expected result. |
| [Choosing React Components](../../packages/docs/content/docs/react/choosing-components.md) and [Project Settings](../../packages/docs/content/docs/self-hosting/project-settings.md) | Direct task-oriented prose, comparison tables, explicit defaults/limitations, and links to deeper guidance. |

The samples mix heading conventions. Basic Search has both "Searching Multiple Criteria" and "Reversing the sort order". Choosing React Components uses a title-case page title with sentence-case sections such as "Field and resource controls". Project Settings uses "Project feature flags" and "Open patient registration".

The agreed pilot convention is **title case for page titles and all section headings on new pages**. Small updates preserve the target page's existing headings, anchors, and local style. This convention, restrained emphasis, ordinary Markdown spacing, and concise openings are explicit editorial choices for the pilot; the samples do not establish a uniform repository-wide style policy. The [docs README](../../packages/docs/README.md) supplies the supported Hugo markup and preference for source-backed examples.

The verifier reads the same editorial guidance. Draft notes identify the neighboring style examples and any code-execution or rendered-preview checks still needed. Images must already exist and fit the current UI; required new screenshots are routed to human work. This pilot adds no image-generation or screenshot-capture capability.

The [Mermaid guidance](prompts/draft.md#mermaid-diagrams) also reflects the site's [browser renderer](../../packages/docs/assets/js/components/mermaid.mjs) and [Hugo render hook](../../packages/docs/layouts/_markup/render-codeblock-mermaid.html), checked against upstream `6b6c72696` on 2026-11-17. The renderer selects a light/dark theme; the hook emits source for browser rendering, so a Hugo build does not validate Mermaid syntax or layout. New diagrams use the site theme, concise quoted labels, meaningful arrows, and accessible descriptions. These are explicit pilot conventions; older diagrams include custom palettes and HTML labels. Human review must check the actual page at desktop/narrow widths in both themes. Syntax references: [Mermaid flowcharts](https://mermaid.js.org/syntax/flowchart.html) and [accessible titles/descriptions](https://mermaid.js.org/config/accessibility.html).

## Quality and publication gates

- Valid structured output, supported paths, evidence locations, and complete planned file coverage.
- No unresolved classification/drafting questions, executable HTML, path traversal, or symlink escapes.
- Repository Prettier formatting, `git diff --check`, and `npm run build:docs` (Hugo plus dependency builds).
- A separate verification session checks technical claims, coverage, links/anchors, examples, formatting, and availability. It does not share the drafting session's conversation.
- New or changed inline executable examples require human execution review and prevent automatic PR creation in this pilot. Existing source-backed examples are preferred. The run does not claim to execute those examples or exhaustively check every site link.
- Human review before merge, including a visual preview and release availability. AI verification is supporting evidence, not proof of correctness.

Publication uses a stable `docs/automated-pr-<number>` branch and links the original PR. Existing open, merged, or closed docs PRs are returned without overwriting reviewer changes. An orphaned branch is reused only if its tree is identical. The original human author is assigned; set `fallbackAssignee` for bot-authored source PRs. Assignment failures retain the created PR URL and fail visibly so a maintainer can take ownership. Draft PRs must be marked ready before formal review requests are sent.

## Model and effort

The existing `.github/workflows/claude.yml` passes neither a model nor an effort override. Its effective settings depend on the installed Claude Code version, provider/account defaults, and configuration; that YAML alone does not establish the actual model used in a previous run.

This pilot explicitly uses **`claude-sonnet-4-6` at `high` effort**, a versioned baseline for comparing runs. Change `model` and `effort` in `config.json` to evaluate another supported combination. The selected values are recorded in every run. Action version v1.0.262 is pinned to the same commit as the existing integration; its bundled/runtime Claude Code version is managed by that action, not pinned separately here.

Each pass is limited to 40 turns, with estimated API spend limits of $3 for classification, $5 for drafting, and $3 for verification. These CLI limits use estimates and are not exact billing guarantees. A limit or malformed response fails visibly and cannot authorize publication.

## Validation and rollout

From the repository root after dependency installation:

```bash
node --test scripts/docs-automation/run.test.ts
npx tsc -p scripts/docs-automation/tsconfig.json
```

The tests cover decision validation, allowed paths, evidence, uncertain results, unexecuted examples, dry-run behavior, large drafts, and applying a patch with a new page. A publication test uses a real local Git remote and a mocked GitHub API to check draft creation, assignment, and retries without overwriting reviewer edits. Live Claude decisions, GitHub permissions, assignment, and Hugo rendering must also be checked using manual runs.

Before adding automatic triggers, audit a sample of skipped PRs, review noisy drafts, verify assignments, and confirm CI runs on created PRs. Automatic activation is a separate reviewed change: add a merged-PR trigger with the same controller and explicit permissions, plus retry/reconciliation handling. Do not simply substitute untrusted PR text into the workflow's shell commands or prompts.

References: [Claude GitHub Actions](https://code.claude.com/docs/en/github-actions), [model and effort configuration](https://code.claude.com/docs/en/model-config), [GitHub workflow dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [workflow token behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
