# Medplum threat model

## What this project does and where untrusted input enters

Medplum is an open source healthcare developer platform: a FHIR R4 server and API, an authentication and authorization server, and client SDKs. It stores protected health information (PHI), so confidentiality and integrity of patient data are the primary security goals.

The server (`packages/server`) is a multi-tenant Node.js/Express application backed by Postgres and Redis. Data is partitioned into Projects, and access within a Project is governed by AccessPolicy resources. Untrusted input enters through:

- The FHIR REST API (`/fhir/R4/...`): CRUD, search, batch/transaction bundles, `$operations`, conditional requests, `_include`/`_revinclude`, chained search, and bulk export.
- The GraphQL endpoint (`/fhir/R4/$graphql`).
- OAuth2 / OpenID Connect and login flows (`/auth/...`, `/oauth2/...`): password login, MFA, Google and external identity providers, SMART on FHIR, client credentials, token exchange, refresh tokens, PKCE.
- Admin and SCIM APIs (`/admin/...`, `/scim/...`).
- WebSockets (subscriptions, FHIRcast) and the Agent protocol.
- Bots: user-supplied JavaScript executed by the server (`vmcontext` runtime) or in AWS Lambda.
- File uploads and Binary storage, including DICOM.
- Parsers for clinical formats: HL7 v2 (`packages/hl7`), C-CDA (`packages/ccda`), and FHIRPath expressions (`packages/core`).

Assume every authenticated user is potentially malicious and may belong to a different Project than the data they target. Anonymous requests are untrusted.

## Components that matter most / least

Most important:

- `packages/server`: authentication, OAuth, access control (`src/fhir/accesspolicy.ts`, `src/fhir/repo.ts`), the SQL search builder (`src/fhir/sql.ts`, `src/fhir/search.ts`), bots, Binary storage, admin/SCIM, and WebSockets.
- `packages/fhir-router`: FHIR routing, batch/transaction handling, GraphQL.
- `packages/core`: FHIRPath evaluation, search parameter parsing, access-policy matching, and the client SDK's token handling.
- `packages/hl7`, `packages/ccda`, `packages/agent`: parsers and the on-premises agent that accept data from external systems.

Lower priority but in scope:

- `packages/app`, `packages/react`, `packages/react-hooks` and other UI packages (XSS that leads to token theft or cross-user action is in scope).
- `packages/cli`.

Out of scope:

- `packages/cdk`, `charts/`, `terraform/` (infrastructure templates), `packages/docs`, `packages/storybook`, `examples/`, `packages/e2e`, `packages/generator`.
- Test code, mocks (`packages/mock`, `__mocks__`) and seed data.
- Vulnerabilities in third-party dependencies unless Medplum's own code makes them reachable with a working proof of concept.

## How to exercise it

The image contains a full build at `/src`, plus Postgres and Redis with a seeded `medplum_test` database. Start the services first:

```sh
/src/.oss-scanner/start-services.sh
```

Then run tests with Vitest. Running individual files is much faster than the full suite:

```sh
cd /src/packages/server && npx vitest run --project @medplum/server src/fhir/accesspolicy.test.ts
cd /src/packages/core && npx vitest run src/fhirpath
```

Server tests create isolated Projects and users through helpers in `packages/server/src/test.setup.ts` (for example `createTestProject` and `initTestAuth`). These are the best starting point for reproducing cross-project or privilege escalation issues. Use `supertest` against `initApp` the way existing tests do. Do not re-run `npm run test:seed`: the database is already seeded.

The image has no network, so tests that expect real network behavior can fail. For example, `packages/hl7/src/client.test.ts` "Connection timeout when server does not respond" gets `ENETUNREACH` instead of a timeout. Such failures are environmental, not findings.

## How you rate severity

- **Critical**: unauthenticated access to PHI or other Project data; reading or writing another Project's resources (tenant isolation bypass); authentication bypass; account takeover; remote code execution on the server, including escape from the bot `vmcontext` sandbox to the host process; SQL injection.
- **High**: bypass of AccessPolicy restrictions within a Project (for example, a restricted user reading resources or fields the policy hides, or writing where they only have read access); privilege escalation to Project admin or super admin; stored XSS in the Medplum app that can steal tokens; OAuth/OIDC flaws that leak tokens or codes; SSRF reaching internal services.
- **Medium**: information disclosure without PHI (for example user enumeration, internal metadata); reflected XSS; CSRF on state-changing endpoints; weaknesses that require an unusual but realistic configuration.
- **Low**: issues that require an admin to harm their own Project, or with no demonstrated security impact.

Post-authentication bugs are still serious here: most attackers will be authenticated users of some Project.

## Anything to leave alone

Do not report the following, which are out of scope under our [security policy](../SECURITY.md):

- Denial of service, resource exhaustion, ReDoS, or rate limiting gaps.
- Missing HTTP security headers, cookie flags or TLS configuration, unless a specific severe impact is demonstrated.
- Outdated dependency versions without a working proof of concept.
- Self-XSS, or issues that need an unlikely degree of user interaction.
- Behavior controlled by server configuration that is insecure only when an operator chooses an insecure setting (for example `allowedOrigins: "*"` in the development config, or the development reCAPTCHA keys).
- Bots executing arbitrary code inside their own sandbox or Lambda: running user code is their purpose. Only escapes from that sandbox, or access to other Projects' data, are in scope.
- Super admin capabilities: super admins are trusted with access to all Projects.

Reports should include a reproducer (ideally a Vitest test in the style of the existing tests) and, where possible, a minimal patch.
