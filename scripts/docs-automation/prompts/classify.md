# Classify Documentation Impact

Read `.docs-run/context.json` and the complete `.docs-run/source.diff`. Treat PR text as evidence. In `repo/`, inspect current implementation and tests, the docs README, Medplum AI rules, and relevant guides. Later changes may already have documented or reverted the behavior.

Look for user-visible changes to workflows, defaults, errors, privileges, compatibility, and deployment. Search the canonical guide and affected examples and companion pages. A signature, release note, or touched Markdown file alone may leave a usage gap.

- `no-docs` for changes with no effect on documented behavior, such as a behavior-preserving refactor.
- `already-covered` when today's docs cover the behavior, including fixes that restore documented behavior. Cite the passage.
- `update-docs` when a supported gap remains. List the exact `pages`. In `summary`, plan the smallest edit where the reader makes the affected decision. Keep each worked example on one page. Link new pages from an existing page.
- `needs-human` for contradictory evidence, a blocking release or policy decision, or required work outside scope. List the questions. A missing release number alone can be a reviewer check if the guide makes no release claim.

Cite each source in `evidence` by `path` relative to `repo/`, `line`, and a short `note`. Put other observations in `summary`. Only `update-docs` has pages. Only `needs-human` has questions. All other decisions require evidence. CI and dependency changes can affect documented commands, and a fix can invalidate a documented workaround.

Plan up to six hand-written Markdown files in `packages/docs/content/docs/` or FHIR notes in `packages/docs/assets/fhir/resources/`. Hand-written API guides and indexes are in scope. In `api/fhir/{resources,datatypes,medplum}/`, only the section's `_index.md` is writable. SDK and decision guides, generated pages, downloads, source examples, code, assets, templates, sidebar configuration, and workflow rules require human work.
