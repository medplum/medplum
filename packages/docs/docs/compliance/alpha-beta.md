# Alpha & Beta Features

Some Medplum features are released before they reach general availability (GA). This page explains what the **Alpha** and **Beta** labels mean and what to expect when building on pre-GA features.

## Stability Stages

| Stage           | API stability                                    | Breaking changes                                      | Recommended usage                        |
|-----------------|--------------------------------------------------|-------------------------------------------------------|------------------------------------------|
| **Alpha**       | Experimental — subject to change at any time     | May occur in any release without advance notice       | Prototyping and early validation         |
| **Beta**        | Mostly stable — core contract unlikely to change | Possible, with advance notice where practical         | Production use with caution              |
| **GA (Stable)** | Stable — full semver guarantees apply            | Concentrated in major releases, announced in advance  | Production use, fully supported          |

## Alpha

Medplum develops in the open. Alpha features are available publicly so that developers can experiment early and provide feedback before APIs are finalized.

**What this means in practice:**

- The API shape, request/response schema, and behavior can change between any two releases without a migration guide.
- The feature may be disabled, renamed, or removed if the design direction changes.
- Alpha features are not covered by Medplum's deprecation policy.

Alpha features are intended for developers who want to give early feedback or who are willing to track changes closely. This is the stage when feedback can be most rapidly incorporated — we encourage users to test and share their experience.

**How alpha is marked:** Documentation pages carry an `Alpha` admonition; TypeScript APIs may be annotated `@experimental`.

## Beta

A feature tagged **Beta** has a stable core contract but has not yet completed full validation for GA.

**What this means in practice:**

- Breaking changes are possible but will be noted in release notes, and Medplum will make reasonable effort to provide a migration path.
- Performance or edge-case behavior may still be rough.

Beta features are appropriate for production use in non-critical workflows where you can absorb an occasional breaking change. We want to hear from users before a feature enters the strict GA release cycle.

**How beta is marked:** Documentation pages carry a `Beta` admonition or a `(Beta)` label.

## General Availability (GA / Stable)

Once a feature reaches GA it is governed by the full [Medplum Version Policy](/docs/compliance/versions): breaking changes are concentrated into major releases and announced in advance.

## Graduation path

Features generally progress **Alpha → Beta → GA**. There is no fixed timeline; graduation depends on API stability, test coverage, operator feedback, and production validation. Graduation announcements are published in GitHub release notes and the `#announcements` Discord channel.

A feature can also be **retired** from alpha or beta without reaching GA. Medplum will post a notice in the release notes and, where practical, document migration options.

## Quick reference

| Signal                              | Where you see it                  | Stage                               |
|-------------------------------------|-----------------------------------|-------------------------------------|
| `:::info[Alpha]` admonition in docs | Doc page header                   | Alpha                               |
| **Alpha** in a status table         | Docs overview table               | Alpha                               |
| `@experimental` TSDoc tag           | TypeScript source / API reference | Alpha                               |
| `:::info[Beta]` admonition in docs  | Doc page header                   | Beta                                |
| No stability label                  | Docs and source                   | GA                                  |
| `@deprecated` TSDoc tag             | TypeScript source / API reference | Scheduled for removal in next major |

## Feedback

If you are using an alpha or beta feature and encounter a bug, an API design issue, or a missing capability, please [open a GitHub issue](https://github.com/medplum/medplum/issues).
