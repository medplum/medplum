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
