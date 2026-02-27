---
slug: january-2026-update
title: "Medplum Monthly Update - January 2026"
authors: reshma
tags: [monthly-update]
---

January was a packed month for Medplum. We shipped three patch releases (v5.0.11, v5.0.12, v5.0.13), published the [2026 Roadmap](/blog/2026-roadmap), and landed over 100 commits from 20+ contributors. The biggest themes this month were **scheduling**, **the Provider app**, and **site reliability** — all directly advancing our [2026 roadmap priorities](/blog/2026-roadmap).

<!-- truncate -->

## Features

### Provider App: Spaces, Messaging, and Tasks

<img src="https://github.com/techdavidy.png" alt="David Yanez" width="50" height="50" style={{borderRadius: '50%'}} /> **[David Yanez](https://github.com/techdavidy)**

The [Provider app](https://provider.medplum.com) saw major improvements across messaging, task management, and the new Spaces experience. This work advances the [Provider Application roadmap goal](/docs/provider) of expanding available workflows.

- **[Spaces](https://provider.medplum.com/Spaces/Communication) streaming and buffered support** — real-time communication with both streaming and buffered message delivery
- **[Server-Sent Events](https://en.wikipedia.org/wiki/Server-sent_events) bot implementation** — SSE support for bots, enabling real-time AI-powered interactions
- **[Messaging](https://provider.medplum.com/Communication) improvements** — URL support in the inbox, participant filtering, and topic-based threading for Communications
- **[Task management](https://provider.medplum.com/Task)** — auto-selection when the task list is empty, priority display for better triage
- **Navbar updates** for both Medplum and Provider apps by [Kevin Wadeshaw](https://github.com/kevinwadeshaw), plus a new **Get Started page**

### Scheduling: $find and $book Operations

<img src="https://github.com/noahsilas.png" alt="Noah Silas" width="50" height="50" style={{borderRadius: '50%'}} /> **[Noah Silas](https://github.com/noahsilas)**

The most significant feature work this month was a ground-up buildout of FHIR-native scheduling operations. This directly supports the [Scheduling initiative](/docs/scheduling) on our [2026 roadmap](/blog/2026-roadmap), where we committed to self-scheduling, advanced availability management, and resource scheduling.

- **`$find` operation** for querying available slots on a single Schedule resource, now with unique slot identifiers and timezone support ([scheduling docs](/docs/scheduling))
- **`$book` operation** for creating Appointments through a FHIR operation, with a first pass on the Provider UI booking flow
- **Provider Calendar refactor** to support the new scheduling operations
- **Timezone support** in `SchedulingParams`, enabling scheduling across time zones
- New [search parameters](/docs/search/advanced-search-parameters) for `ActivityDefinition.code`, `Communication.priority`, and `ProjectMembership.active`

These operations give developers a clean, standards-based API for building patient self-scheduling and staff scheduling workflows — a capability that has been one of our most requested features.

### System-Level Custom FHIR Operations

<img src="https://github.com/monsieurBelbo.png" alt="Gonzalo Bellver" width="50" height="50" style={{borderRadius: '50%'}} /> **[Gonzalo Bellver](https://github.com/monsieurBelbo)**

Developers can now define [custom FHIR operations](/docs/bots/custom-fhir-operations) at the system level, not just per-resource. This is a key building block for the [Integrations & Plugins roadmap initiative](/docs/bots), enabling more flexible bot-powered workflows and custom API endpoints.

### FHIR Operations and Terminology

<img src="https://github.com/deam65.png" alt="Darren Eam" width="50" height="50" style={{borderRadius: '50%'}} /> **[Darren Eam](https://github.com/deam65)**

- **[Patient `$summary` operation](/docs/api/fhir/operations/patient-summary)** with updated [`$everything` documentation](/docs/api/fhir/operations/patient-everything)
- **[ConceptMap import](/docs/api/fhir/operations/conceptmap-import)** and comprehensive [terminology operations documentation](/docs/terminology)
- New **[authentication and security operations](/docs/auth)** and **[resource validation operations](/docs/api/fhir/operations/validate-a-resource)**

<img src="https://github.com/mattwiller.png" alt="Matt Willer" width="50" height="50" style={{borderRadius: '50%'}} /> **[Matt Willer](https://github.com/mattwiller)**

- **X-FHIR-Query support in [SDC `$extract`](/docs/api/fhir/operations/extract)** — enables dynamic queries in [Structured Data Capture](/docs/questionnaires/structured-data-capture) extraction, improving form-based data capture workflows
- **Display language overrides** in [`ValueSet/$expand`](/docs/api/fhir/operations/valueset-expand) and [`CodeSystem/$validate-code`](/docs/api/fhir/operations/codesystem-validate-code) — supports multilingual [terminology services](/docs/terminology), which is important for international deployments

### Site Reliability and Infrastructure

These changes support the [Enterprise Scale & Infrastructure roadmap priority](/blog/2026-roadmap) of handling growing platform traffic.

<img src="https://github.com/mattwiller.png" alt="Matt Willer" width="50" height="50" style={{borderRadius: '50%'}} /> **[Matt Willer](https://github.com/mattwiller)**

- **Reserved database connections for healthcheck** — prevents health checks from being starved during high load
- **Redis failover error handling** in BullMQ workers — improves resilience during Redis cluster failovers
- **Skip caching on write for [AuditEvent](/docs/api/fhir/resources/auditevent) resources** — reduces memory pressure for high-volume audit logging
- **Tracing extensions on OperationOutcome** — better observability for debugging production issues

<img src="https://github.com/mattlong.png" alt="Matt Long" width="50" height="50" style={{borderRadius: '50%'}} /> **[Matt Long](https://github.com/mattlong)**

- **[ReindexJob](/docs/self-hosting/super-admin-guide) configuration enhancements** — more control over reindexing for large datasets
- **Per-resourceType padding configuration** — fine-grained tuning of array padding for storage optimization
- **Array padding calculator** — tooling to help determine optimal padding settings

<img src="https://github.com/noahsilas.png" alt="Noah Silas" width="50" height="50" style={{borderRadius: '50%'}} /> **[Noah Silas](https://github.com/noahsilas)**

- **Automatic pre/post deploy migration generation** — streamlines the database migration workflow for [self-hosted deployments](/docs/self-hosting)

### Security and Access Control

- **Inactive ProjectMembership disables access tokens** — when a membership is set to inactive, associated tokens are immediately invalidated ([access control docs](/docs/access/access-policies)) ([Matt Willer](https://github.com/mattwiller))
- **[Subscription](/docs/subscriptions) Bot execution respects ProjectMembership** — ensures subscriptions run in the correct membership context ([Matt Willer](https://github.com/mattwiller))
- **On-behalf-of header support** with proper cache disabling ([Maddy Li](https://github.com/maddyli), [Cody Ebberson](https://github.com/codyebberson))

### SDK and Developer Experience

- **`client.post<T>` generic type annotation** for better TypeScript ergonomics ([Noah Silas](https://github.com/noahsilas))
- **Nested connections in [GraphQL](/docs/graphql)** ([Maddy Li](https://github.com/maddyli))
- **Configurable base64 caps** in core ([Sakshum Gadyal](https://github.com/syp1xd))
- **Abort signal support for `sleep`** to allow request cancellation ([Mirza Kapetanovic](https://github.com/mirza-kapetanovic))
- **[Subscription](/docs/subscriptions) AuditEvent destination extension** for routing audit events ([Rahul Agarwal](https://github.com/rahul1))

### AI and MCP

Advancing our [AI roadmap initiative](/blog/2026-roadmap):

- **[MCP server](/docs/ai/mcp) updated** to replace deprecated methods, keeping Medplum's Model Context Protocol support current ([Noah Silas](https://github.com/noahsilas))
- **AI operation documentation** added ([AI operation docs](/docs/ai/ai-operation))

## Documentation

A significant documentation effort this month improved coverage across the Provider app, scheduling, self-hosting, the Medplum Agent, and compliance.

**Provider**
- Provider app docs updated ([Provider app guide](/docs/provider))
- Updated [charting documentation](/docs/charting)

<img src="https://github.com/finnbergquist.png" alt="Finn Bergquist" width="50" height="50" style={{borderRadius: '50%'}} /> **[Finn Bergquist](https://github.com/finnbergquist)**

- **Revamped multi-tenancy documentation** ([multi-tenancy identity providers](/docs/auth/domain-level-identity-providers))
- **Scheduling docs**: availability time zones, `$find` beta status, `SchedulingParameters` duration param ([scheduling docs](/docs/scheduling))
- **DoseSpot enrollment documentation**: how to enroll users with the Enroll Prescriber Bot ([medications docs](/docs/medications))
- **AccessPolicy requirements for Bulk Export API** ([API docs](/docs/api))
- **Observation.valueSampledData** documentation

**Self-Hosting and Operations**
- Self-hosting best practices docs ([self-hosting guide](/docs/self-hosting))
- AWS Lambda bots on localhost guide ([Bots docs](/docs/bots))
- Node.js version requirement updated to 22+ ([self-hosting guide](/docs/self-hosting))
- [Docker Compose](/docs/self-hosting/running-full-medplum-stack-in-docker) persistence and restart policies improved

**Medplum Agent**

<img src="https://github.com/ThatOneBro.png" alt="Derrick Farris" width="50" height="50" style={{borderRadius: '50%'}} /> **[Derrick Farris](https://github.com/ThatOneBro)**

The [Medplum Agent](/docs/agent) is an application that runs inside your firewall and connects to devices over low-level protocols such as HL7/MLLP, ASTM, and DICOM, bridging them to the cloud via secure HTTPS WebSocket channels. This month the Agent docs received several updates:

- Minimal [access policy for Agent](/docs/agent/access-policy) documented
- Enhanced mode [`aaMode`](/docs/agent/acknowledgement-modes) documented
- Section on deactivating memberships added

**Additional Docs**
- Integration tables organized into logical groups ([integrations overview](/docs/integration))
- Terminology services: translated display strings documentation ([terminology services guide](/docs/terminology))
- Compliance documentation and CHPL listing updated for V5 ([compliance overview](/docs/compliance))
- 2026 Roadmap published ([2026 roadmap](/blog/2026-roadmap))

## Bug Fixes

**Forms and UI**
- Fixed repeatable items in [`QuestionnaireForm`](/docs/questionnaires)
- Fixed dark mode on the visit details page
- Fixed color inheritance issue (dark to inherit)
- Updated diagnoses binding URL in OrderLabsPage

**Server and API**
- Fixed SQL error in date array search parameters
- Fixed search by POST issue via body-parser update
- Fixed CCDA timezone offset conversion to FHIR format ([Amanda McGivern](https://github.com/amcgivern))
- Fixed `validateResource` argument merging
- Fixed consistent `storageBaseUrl` generation with `/binary/` path ([Jim Fiorato](https://github.com/jfiorato))
- Fixed out-of-order query results in `useSearch`
- Fixed too-many-requests error re-wrapping in `fetchTokens`

**Agent**
- [`pushToAgent`](/docs/agent/push) now returns on first ACK by default
- Added logging for [enhanced mode](/docs/agent/acknowledgement-modes) acknowledgments

**Infrastructure**
- Fixed [Docker Compose](/docs/self-hosting/running-full-medplum-stack-in-docker) full-stack config after hardened images
- Added persistence to [Docker Compose](/docs/self-hosting/running-full-medplum-stack-in-docker) files ([Matthew Raspberry](https://github.com/mraspberry-uai))
- Fixed database connection release during seeding
- Fixed Spaces message persistence

## Releases

- [**v5.0.11**](https://github.com/medplum/medplum/releases/tag/v5.0.11) — January 21
- [**v5.0.12**](https://github.com/medplum/medplum/releases/tag/v5.0.12) — January 23
- [**v5.0.13**](https://github.com/medplum/medplum/releases/tag/v5.0.13) — January 28

## Looking Ahead

January's scheduling work sets the stage for the self-scheduling and resource scheduling features planned for 2026. The Provider app's Spaces and streaming capabilities are moving us closer to a production-ready provider experience. On the infrastructure side, the Redis failover handling and database connection improvements directly support enterprise-scale deployments.

Join us on [Discord](https://discord.gg/medplum) to share feedback or follow along on [GitHub](https://github.com/medplum/medplum).
