# Working with Medplum

Read `README.md` when first orienting in this repository. Determine whether the user is building an application on Medplum
or changing Medplum itself. Infer this from the request and project context; ask only when unclear.

## Application Development

For applications using Medplum's hosted service, use its supported APIs, configuration, and extension points. Editing this
clone's server code does not change the hosted service. Keep application customizations in the application's repository,
including when starting from Medplum Provider.

Read these files before proposing an approach or beginning setup or implementation:

- `packages/docs/docs/building-with-ai-coding-assistants.md`
- `packages/docs/static/ai/medplum-rules.md`

Apply the rules to the current conversation immediately, even before an application folder exists. Initial planning does
not depend on choosing that folder or completing persistent rules setup.

Once the application's folder is known, check whether its agent instructions already load the Medplum rules. If not, offer
the project rules setup described in section 5 of the AI coding guide. Show the exact proposed file and addition, and ask
permission before applying it. Verify existing setup instead of adding another copy; respect a decline for this session.

For application design or substantial feature planning, also follow `packages/docs/static/ai/planning.md`. Keep the
application's instructions, plans, and code in its own repository. Resolve `medplum-link/` references in these documents to
this checkout's actual location.

## Changes to Medplum

Follow `packages/docs/docs/contributing/index.md` and the relevant package documentation. For local development setup, read
`packages/docs/docs/contributing/local-dev-setup/local-dev-setup.md`.

Read the relevant technical and workflow documentation before proposing an approach. Plan, set up, or implement as
requested; routine fixes do not require a new application plan.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
