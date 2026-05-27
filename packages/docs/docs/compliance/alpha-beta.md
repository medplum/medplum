# Alpha & Beta Features

Some Medplum features are released before they reach general availability (GA). This page explains what the **Alpha** and **Beta** labels mean, what guarantees apply at each stage, and what you are opting in to when you build on a pre-GA feature.

## Stability Stages

| Stage           | API stability                                    | Breaking changes                                                           | Production use         |
|-----------------|--------------------------------------------------|----------------------------------------------------------------------------|------------------------|
| **Alpha**       | Experimental — subject to change at any time     | May occur in any release, including patch releases, without advance notice | Not recommended        |
| **Beta**        | Mostly stable — significant changes are unlikely | Announced in release notes with ≥ one minor version of lead time           | Permitted with caution |
| **GA (Stable)** | Stable — full semver guarantees apply            | Only in major releases, with ≥ 30 days written notice                      | Fully supported        |

## Alpha

A feature tagged **Alpha** is an early preview. It is functional enough to be useful for exploration or prototyping, but it is not yet complete.

**What this means in practice:**

- The API shape, request/response schema, and behavior can change between any two releases — including weekly patch releases — without a migration guide.
- The feature may be disabled, renamed, or removed entirely if the design direction changes.
- There is no SLA on availability or correctness for alpha features.
- Alpha features are not covered by Medplum's deprecation policy (which only applies to GA features).

**How alpha is marked:**

- Documentation pages carry an `Alpha` admonition at the top.
- Status columns in overview tables show **Alpha**.
- TypeScript APIs may be annotated `@experimental` in TSDoc.

**Who should use alpha features:**

Alpha features are intended for developers who want to give early feedback or who are willing to track changes closely. Do not base production workflows or compliance-sensitive integrations on alpha features.

This is the stage when feedback can be most rapidly incorporated, so we encourage Medplum users to test features at this stage and let us know when we can make their usage easier/better.

## Beta

A feature tagged **Beta** has stabilized enough that the core contract is unlikely to change, but it has not yet completed the full validation required for GA.

**What this means in practice:**

- Breaking changes are possible but will be called out in the release notes for the minor version that introduces them.
- Medplum will provide a migration path (documentation, scripts, or a compatibility shim) for any breaking change made during beta.
- The feature is not yet covered by the standard deprecation policy, but Medplum will make reasonable effort to avoid removal without notice.
- Performance, scalability, or edge-case behavior may still be rough.

**How beta is marked:**

- Documentation pages carry a `Beta` admonition or a `(Beta)` label in the sidebar.
- Status columns in overview tables show **Beta**.

**Who should use beta features:**

Beta features are appropriate for production use in non-critical workflows where you can absorb an occasional breaking change across minor versions. If your workflow is compliance-sensitive or involves patient-facing data pipelines, wait for GA unless you have capacity to track and respond to changes.

At this stage there is still an opportunity to incorporate significant community feedback. We want to hear from users to make any adjustments before the feature enters the strict GA release cycle.

## General availability (GA / Stable)

Once a feature reaches general availability it is governed by the full [Medplum Version Policy](/docs/compliance/versions). In summary:

- Breaking changes are concentrated into annual major releases and announced ≥ 30 days in advance.
- A feature marked `@deprecated` in minor _N_ will not be removed until major _N + 1_.
- ONC certification, HIPAA compliance programs, and enterprise SLAs only apply to GA features.

## Graduation path

Features generally progress **Alpha → Beta → GA**. There is no fixed timeline for graduation; it depends on API stability, test coverage, operator feedback, and production validation. Medplum publishes graduation announcements in GitHub release notes and the `#announcements` Discord channel.

A feature can also be **retired** from alpha or beta without reaching GA if the approach is abandoned. In that case, Medplum will post a notice in the release notes and, where practical, document migration options.

## Quick reference

| Signal                              | Where you see it                  | Stage                               |
|-------------------------------------|-----------------------------------|-------------------------------------|
| `:::info[Alpha]` admonition in docs | Doc page header                   | Alpha                               |
| `(Alpha)` in sidebar label          | Docs sidebar                      | Alpha                               |
| **Alpha** in a status table         | Docs overview table               | Alpha                               |
| `@experimental` TSDoc tag           | TypeScript source / API reference | Alpha                               |
| `:::info[Beta]` admonition in docs  | Doc page header                   | Beta                                |
| `(Beta)` in heading or sidebar      | Docs pages                        | Beta                                |
| No stability label                  | Docs and source                   | GA                                  |
| `@deprecated` TSDoc tag             | TypeScript source / API reference | Scheduled for removal in next major |

## Feedback

If you are using an alpha or beta feature and encounter a bug, an API design issue, or a missing capability, please [open a GitHub issue](https://github.com/medplum/medplum/issues).
