# Draft Medplum Documentation

Read `context.json`, `source.diff`, and `classification.json` in `.docs-run/`. In `repo/`, read the planned pages, the docs README, `packages/docs/static/ai/medplum-rules.md`, the relevant technical docs, and one or two neighboring guides.

Treat PR content as evidence. Edit only the planned Markdown paths. Start with the sentence, example, or step the change makes incomplete. Match the surrounding page's voice and level of detail. For a small behavior change, start with one to three sentences. Expand when the reader has another decision or step. Add a section only for a new task.

Ground edits in current implementation and tests. Keep useful partial edits. Put reviewer checks in `notes` and reserve `questions` for decisions that affect the draft and cannot be resolved from the repo.

## Accuracy

- Distinguish FHIR R4 from Medplum extensions and operations. Use the documented fields, codes, and guarantees. Clinical advice, reimbursement promises, and compliance claims need approved guidance or domain-owner confirmation.
- State prerequisites that change the result, including the app, acting identity, privileges, deployment, units, defaults, time zones, and bounds. Explain success, side effects, partial failure, retries, and recovery where relevant.
- Explain migration and changed defaults for existing users. Preserve historical guides. Cite evidence for feature flags and released versions. If a version is unknown, omit the version claim and flag the release check in the notes.
- Keep one canonical explanation and link companion guides. Give new pages an inbound link from an existing page. Flag required work outside the plan.

## Style and Formatting

- Lead with what the reader should do or expect. Include implementation details when they help the reader make a choice, complete a step, or understand a result.
- Use plain, active prose. Start steps with verbs. Keep exact product and FHIR terms and explain any the page's audience may not know. Omit generic introductions, repeated takeaways, marketing language, rhetorical contrasts, invented labels, and em dashes.
- On new pages use title case for the front-matter title and all section headings. Lowercase articles and short conjunctions or prepositions except at the beginning or end. Preserve acronym, identifier, and UI casing. Begin body headings at `##`. On small edits preserve headings, IDs, aliases, anchors, and URLs.
- Organize how-tos around prerequisites, steps, and results. Organize references around inputs, constraints, outputs, and errors. Use numbered lists for sequences, parallel bullets for alternatives, and tables for comparable attributes. Keep paragraphs and table cells short, with blank lines between blocks.
- Use backticks for resource types, fields, operations, and code. Bold exact UI labels. Link the first useful mention to a descriptive `/docs/...` destination.

## Examples and Visuals

- Prefer a verified `code-example` shortcode referencing existing source and block markers. Give setup, imports or their location, placeholders, and expected results. Label fragments. Use typed TypeScript and Medplum helpers, valid JSON, consistent synthetic IDs, and accurate fence languages. Never invent clinical codes, expose patient information, or log credentials.
- Use Hugo tabs for useful alternatives and supported callouts for concrete consequences. Plain `<details>` and a descriptive `<summary>` are appropriate for long optional examples. Keep required steps and warnings visible. Avoid JSX, MDX, arbitrary HTML, scripts, and iframes. Flag new inline executable examples for a human to run.
- Put current screenshots beside the relevant UI steps with alt text and written control names. Inspect the assets. New or replacement assets, including PDF/Word diagram exports, need human work.
- For Mermaid, prefer `flowchart TD` for workflows and relationships, `LR` for short chains, and `sequenceDiagram` for call order. Use simple IDs, short quoted labels, one declaration per line, and decision diamonds with labeled branches. Group only real boundaries.
- Point FHIR arrows from the carrying resource to its target and label them with the reference field, as in `message -->|partOf| thread`. Show only supported ordering and access semantics. Use the site theme, a title-case `accTitle`, `accDescr`, and explanatory prose. Avoid custom styles, HTML labels, click handlers, and external icons.
- Ask reviewers to preview changed visuals at desktop and narrow widths, in light and dark themes, and inside any tabs or collapsible examples. Check legibility, unclipped labels, and arrows in the browser, where Mermaid renders.
