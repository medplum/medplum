---
id: 2026-12-01-november-2026-update
slug: november-2026-update
title: "Medplum Monthly Update - November 2026"
authors: reshma
blog_tags: [monthly-update]
---

Another busy month at Medplum, here's what we have been up to.

November brought 211 commits from 23 contributors, with five patch releases, v5.2.14 through v5.2.18.

All of this continues to drive forward our [2026 roadmap priorities](/blog/2026-roadmap).

<!--more-->

## Features

### Scheduling

<img src="https://github.com/noahsilas.png" alt="Noah Silas" width="50" height="50" style="border-radius: 50%" /> **[Noah Silas](https://github.com/noahsilas)** and <img src="https://github.com/Filupnot.png" alt="Philip Knott" width="50" height="50" style="border-radius: 50%" /> **[Philip Knott](https://github.com/Filupnot)**

- **A weekday view**: The view picker became a dropdown and every view type is now available in every calendar, including in the Provider App. A new **Weekdays** view shows Monday through Friday only, and the workspace defaults to it on a weekday and to the full week on a weekend. Creating an appointment or a block on a weekend while in Weekdays switches the view so the new entry is visible rather than silently off screen
- **Appointments in their own time zone**: When an `Appointment` carries the time zone extension, its hovercard and details pane tell its times on that clock, naming the zone when it is not the viewer's, as in "4:00 PM – 5:00 PM ET". The calendar grid still places the event at the instant it represents, and the date on the **When** line is read in the same zone, so an evening visit is not dated to the viewer's next day

<img src="/img/blog/2026-11-scheduling-timezone.png" alt="Scheduling workspace showing an appointment's times labeled in Central Time alongside the viewer's own calendar grid" style="max-height: 400px; max-width: 100%" />

- **Patients by exact MRN**: The booking form's patient field already displayed each patient's medical record number but could only search by name. It now runs a name search and an identifier search side by side and merges them, exact MRN matches first. The identifier search keeps only patients whose matching identifier is actually a medical record number, so a number that happens to be someone's insurance member ID does not offer them
- **Deceased patients**: Deceased patients are no longer offered in the booking form's patient picker. An exact MRN match is still listed, marked **Deceased**, so someone looking for a specific patient can see the record exists; picking one blocks booking. Existing appointments with a deceased patient are marked on the calendar event, the hover card, and the details pane

<img src="/img/blog/2026-11-scheduling-deceased-patient.png" alt="Calendar and appointment details showing a patient's name marked as deceased" style="max-height: 400px; max-width: 100%" />

- **Time that starts before the view**: The calendar searched for `Slot`s and `Appointment`s whose start fell inside the range on screen, so a two-week block of time off that began earlier was missing from every day it covered. It now searches for everything that overlaps the range, and applies the same overlap check to resources created while the calendar is open
- **Confirming a held series**: [`$confirm`](/docs/scheduling/appointment-confirm) takes an `occurrences` parameter of `this`, `this-and-following`, or `all`, so a series held by [`$hold`](/docs/scheduling/appointment-hold) can be confirmed in one transaction, all or none. Occurrences already confirmed on their own or cancelled are skipped, and `this-and-following` or `all` is refused for an appointment outside a series rather than quietly confirming it alone
- **Typing a time**: For users who may bypass scheduling rules, manual time entry moved out of the time finder and into the booking form's own **Date & time** field, which is editable once the search could run. The visit's length shows as a link under the time, and a time picked from the finder fills both fields
- **One surface, in the host's color**: The workspace takes a `backgroundColor` prop, a theme color or any CSS color, which the workspace, the pane, and the widened drawer all paint. An application that renders the workspace on a page with its own background can now pass that color instead of having the pane stand out against it
- **Smaller changes**: A `Schedule.comment` editor in the configuration workspace, service facilities matched anywhere in the name rather than only at the start, a configurable maximum length for appointment notes, the full visit-type list revealed in its dropdown, blocked time listed under the calendar filters, `system` recorded as the author on patient self-serve slots, the calendar no longer paging to a day already on screen, the **Patient** field moved up in the find-and-book form, a confirmation before clearing the sidebar form, and a booking time pre-filled from the calendar click

### Provider App

<img src="https://github.com/techdavidy.png" alt="David Yanez" width="50" height="50" style="border-radius: 50%" /> **[David Yanez](https://github.com/techdavidy)**, <img src="https://github.com/maddyli.png" alt="Maddy Li" width="50" height="50" style="border-radius: 50%" /> **[Maddy Li](https://github.com/maddyli)**, and <img src="https://github.com/finnbergquist.png" alt="Finn Bergquist" width="50" height="50" style="border-radius: 50%" /> **[Finn Bergquist](https://github.com/finnbergquist)**

- **Filtering the task board by owner**: The [`TaskBoard`](/docs/provider/tasks) takes an owner filter, so a provider can narrow a shared board to their own work

<img src="/img/blog/2026-11-provider-taskboard-owner.png" alt="Provider App task board with an owner filter applied" style="max-height: 400px; max-width: 100%" />

- **Task assignment from a plan**: [`PlanDefinition/$apply`](/docs/api/fhir/operations/plandefinition-apply) reads the `task-elements` extension from `PlanDefinition.action`, taking precedence over the `ActivityDefinition`, and `owner` accepts a fixed reference to any R4 `Task.owner` type as well as a FHIRPath expression
- **A membership tab**: Profile resources show the `ProjectMembership` behind them, which makes an access question answerable from the profile rather than by hunting for the membership

<img src="/img/blog/2026-11-membership-tab.png" alt="Membership tab on a profile resource showing the project membership and its access policy" style="max-height: 400px; max-width: 100%" />

- **A settings area in the app shell**: `AppShell` takes three opt-in props: `menuItems` to replace the default account settings entry in the user menu, `navbarHeader` to pin content such as a "Back to app" link above the navbar menus, and `navbarSearchHidden` to hide the search button while leaving Spotlight on Cmd/Ctrl+K. Nothing changes unless they are passed

<img src="/img/blog/2026-11-appshell-custom-header.png" alt="AppShell rendering a settings view with a custom navbar header in place of the logo" style="max-height: 400px; max-width: 100%" />

- **Smaller changes**: A refresh button in the patient summary, a `DateTimeInput` empty state with a calendar icon, Mantine description spacing matched in `FormSection` and a refined modal header, non-interactive section icons and intro spacing on **Get Started** ([Kevin Shaw](https://github.com/kevinwadeshaw)), an `aria-label` on `AsyncAutocomplete` and its wrappers, and tables and forms that distinguish a `false` boolean from a missing one ([Maddy Li](https://github.com/maddyli))

### Platform and API

<img src="https://github.com/codyebberson.png" alt="Cody Ebberson" width="50" height="50" style="border-radius: 50%" /> **[Cody Ebberson](https://github.com/codyebberson)**, <img src="https://github.com/mattwiller.png" alt="Matt Willer" width="50" height="50" style="border-radius: 50%" /> **[Matt Willer](https://github.com/mattwiller)**, and <img src="https://github.com/mattlong.png" alt="Matt Long" width="50" height="50" style="border-radius: 50%" /> **[Matt Long](https://github.com/mattlong)**

- **Replaying a subscription for a specific version**: [`$resend`](/docs/api/fhir/operations/resend) gained a versioned route, so an admin can replay the original event for a historical version of a resource. The existing instance-level route only resends the current version, which cannot faithfully replay events for a resource that has since changed, and cannot replay a delete at all. The new route evaluates `%previous` against the entry before the named version, so an update replays with the transition the subscription originally saw, and a delete sends the last version before it. This is the path back after an outbound delivery outage, where rest-hook deliveries that exhausted their retries were simply lost
- **Deleted resources in bulk export**: System-level and patient-level [`$export`](/docs/api/fhir/operations/bulk-fhir) produce the Bulk Data `deleted` output, listing resources deleted since `_since` as transaction Bundles of `DELETE` entries. Deleted rows keep only an id, a project, and a timestamp, so their compartments and search columns are empty; rather than run filters that would silently return an incomplete list, the export produces `deleted` only when `_since` is set, the caller is a project admin, and their access policy uses no criteria or compartments on a non-admin type, and omits the key entirely otherwise
- **[`Questionnaire/$assemble`](/docs/api/fhir/operations/assemble)**: The SDC assemble operation is now available on the server
- **Rendering without a server**: `createStaticClient` returns a `MedplumClient` that serves reads by type and id from a list of resources already in memory, with no network access, so an application can render components such as `DiagnosticReportDisplay` from resources it gathered up front
- **[`medplum logout`](/docs/cli)**: The CLI gained a logout command that revokes every session in the profile against the server, refreshing an expired access token first so the refresh token is revoked too, then removes the tokens while keeping the profile's base URL and client ID. A revocation that fails for a reason other than an already-invalid session leaves the stored tokens in place so it can be retried
- **[MCP](/docs/ai/mcp)**: The `fhir-request` tool carries descriptions for itself and its inputs, is marked destructive, and the server advertises a title, website, and icon in its metadata
- **Performance**: Saving a `ValueSet` with a large enumerated code list could pin a CPU for minutes while holding an open database transaction, until Postgres killed the connection for sitting idle and the save failed. Two duplicate-removal passes were comparing every code against every code kept so far; both are now linear, using a `Set` for strings and booleans in FHIRPath union and a map of systems to values when building search tokens. Separately, `_include` targets are read once rather than once per referring resource, where 1,000 `Slot`s sharing 40 `Schedule`s charged quota, logged an audit event, and hit the database a thousand times. Cache writes after a transaction commit were streamlined, and `User.email` gained a text match index
- **Correctness**: FHIRPath `extension(url)` returns matches from every input item rather than the first, HL7 DTM offsets and fractional seconds parse correctly, resource type and id are kept to single URL path segments, `resourceType` and `id` are validated after a PATCH is applied, request headers match case-insensitively in plain-object form, sorting on `_project` is supported, and display strings were added for `Coverage`, `Immunization`, and referenced medications
- **Bots and the Agent**: Cron strings are validated with the scheduler's own rules and a cron is rescheduled when its target or `onBehalfOf` changes, message content is kept in the [Agent](/docs/agent) channel log, and agent operation searches accept only `Device` and `Agent` resources

### Enterprise: Scale, Database, and Self-Hosting

<img src="https://github.com/mattlong.png" alt="Matt Long" width="50" height="50" style="border-radius: 50%" /> **[Matt Long](https://github.com/mattlong)**, <img src="https://github.com/ThatOneBro.png" alt="Derrick Farris" width="50" height="50" style="border-radius: 50%" /> **[Derrick Farris](https://github.com/ThatOneBro)**, and <img src="https://github.com/codyebberson.png" alt="Cody Ebberson" width="50" height="50" style="border-radius: 50%" /> **[Cody Ebberson](https://github.com/codyebberson)**

- **A default deployment that phones nobody**: The sample environments (Docker Compose, CI, and the local Kubernetes example) run Valkey in place of Redis, with service names, settings, and ports unchanged, and Redis still supported. They also no longer ship Medplum's own reCAPTCHA keys, so a default deployment makes no calls to Google reCAPTCHA. The [self-hosting docs](/docs/self-hosting) recommend Valkey, describe reCAPTCHA as optional, and state the requirement as Redis 7 or later, or any Valkey version ([Karl Pietrzak](https://github.com/The-Alchemist))
- **Choosing a TLS policy**: The [CDK](/docs/self-hosting/install-on-aws) takes a `loadBalancerSslPolicy` setting for the API and mTLS HTTPS listeners, so a deployment can select a post-quantum or FIPS policy. It defaults to the recommended TLS 1.3 policy, leaving existing stacks unchanged
- **Static hosting**: foomedical.com moved to staging, with its own Google client ID and reCAPTCHA key in CI rather than shared ones, and its content security policy origins committed rather than configured by hand
- **Resilience**: Background workers start only after their dependencies are initialized, post-deploy and reindex workers validate their input, and an undici paused-parser assertion no longer takes the process down

### Integrations

<img src="https://github.com/oleg-mp.png" alt="Oleg Rocklin" width="50" height="50" style="border-radius: 50%" /> **[Oleg Rocklin](https://github.com/oleg-mp)**, <img src="https://github.com/alexanderxlin.png" alt="Alex Lin" width="50" height="50" style="border-radius: 50%" /> **[Alex Lin](https://github.com/alexanderxlin)**, and <img src="https://github.com/sanjana-medplum.png" alt="Sanjana Badhya" width="50" height="50" style="border-radius: 50%" /> **[Sanjana Badhya](https://github.com/sanjana-medplum)**

- **Cancelling a sent prescription**: [E-prescribe](/docs/decision-guides/e-prescribe) gained a cancel operation, so a prescription already transmitted to the pharmacy can be cancelled from Medplum rather than by phone
- **Multi-state prescribing**: A practice sync and multi-state DEA enrollment path, plus audit log and report widgets, draft prescription notes preserved across webhook write-back, and days supply and order number mapped on downloaded drug history
- **Labs**: Units are preserved on text-valued `Observation` results, a sibling `Observation` identifier collision was fixed in the results pipeline, and results display requirements were added ([Alex Lin](https://github.com/alexanderxlin))
- **Document intake**: Only LINE blocks from Textract are sent on to Comprehend Medical, rather than the full block set

## Compliance

<img src="https://github.com/codyebberson.png" alt="Cody Ebberson" width="50" height="50" style="border-radius: 50%" /> **[Cody Ebberson](https://github.com/codyebberson)**, <img src="https://github.com/ThatOneBro.png" alt="Derrick Farris" width="50" height="50" style="border-radius: 50%" /> **[Derrick Farris](https://github.com/ThatOneBro)**, and <img src="https://github.com/mattlong.png" alt="Matt Long" width="50" height="50" style="border-radius: 50%" /> **[Matt Long](https://github.com/mattlong)**

- **A callback per client**: A `ClientApplication` with its own identity provider gets its own external auth callback at `/auth/external/<clientId>`, so the redirect URI registered at the identity provider identifies the client the authorization code was issued for, rather than the client being read out of `state` on a shared callback. The shared callback keeps working for those clients only while their project carries a system setting that a super admin controls. Domain-level and server-config identity providers are unchanged
- **Rate limits and network rules**: The default auth rate limit dropped to 600 per five minutes ([Ian Plunkett](https://github.com/ianplunkett)), login and MFA limits apply regardless of path case or a trailing slash, a server config can exempt specific IP addresses from the lower login limit, [IP access rule](/docs/access/ip-access-rules) prefixes match at octet boundaries, and [mTLS](/docs/auth/mtls) client certificates must exactly match the trust store
- **C-CDA conformance**: `Encounter.class` is mapped from `ActCode` and CPT per the C-CDA on FHIR IG, `negationInd` is read on allergy observations, and procedure status is mapped from `statusCode`, with `in-progress` for active. All three contributed from outside the team, see [Bug Fixes](#bug-fixes)
- **Observability for the above**: Bots running as a caller with SMART scopes, memberships granted to existing users with an unverified email, subscription notifications that included `Binary.data`, invalid and client-less PKCE-optional code redemptions, `AsyncJob` access by other users, and `meta.accounts` edge cases are all logged, so the next review has evidence rather than inference

## Documentation

<img src="https://github.com/everett-williams.png" alt="Everett Williams" width="50" height="50" style="border-radius: 50%" /> **[Everett Williams](https://github.com/everett-williams)**, <img src="https://github.com/aanishs.png" alt="Aanish Sachdev" width="50" height="50" style="border-radius: 50%" /> **[Aanish Sachdev](https://github.com/aanishs)**, and <img src="https://github.com/timray721.png" alt="Tim Ray" width="50" height="50" style="border-radius: 50%" /> **[Tim Ray](https://github.com/timray721)**

**Provider and application workflows**

- **[Provider workflow guides](/docs/provider)**: Messaging, labs, and medications were listed as coming soon although they shipped. Each now has a task-oriented guide covering prerequisites, everyday actions, what each status means, and troubleshooting: [Orders (Labs & Imaging)](/docs/provider/labs), [Medications](/docs/provider/medications), and [Messages](/docs/provider/messages), with a shared order workflow diagram and a note that **Completed** includes preliminary and partial reports
- **[Building a React Application](/docs/react/building-an-application)** and **[Choosing Components](/docs/react/choosing-components)**: The React docs covered installation and individual components but left the connection between authentication, data loading, forms, and refresh behavior to the reader. These add a guided path with a request-flow diagram, type-checked examples for authentication state, patient search, and resource creation, and a checklist for loading, failure, access, and concurrency behavior
- **[Deploying Resource Definitions from Source Control](/docs/deploying-resources-from-source-control)**: A repeatable workflow for moving application configuration between environments: resource identity, dependency ordering, verification, activation, and recovery, with a runnable intake example that previews before it applies

**Modeling and design decisions**

- **[Tenancy Design](/docs/decision-guides/tenancy-design)**: A dedicated decision guide, where tenancy choices previously sat inside access-control implementation guidance. It covers whether tenancy is needed at all, shared versus tenant-specific `Patient` records and what that means for matching and login, clinical sharing, and the account experience for providers and patients. It also draws the line between UI filtering and API-enforced permissions, which are not the same thing
- **[Organizations and Locations](/docs/administration/locations-and-facilities)**: `Organization`, physical `Location`, scheduling service facility, and billing facility were described across several workflow pages in ways that sometimes implied they were the same record. This guide connects them across scheduling, referrals, clinical care, billing, and telehealth, and presents one `PractitionerRole` per organization as the starting model
- **[Transaction bundles](/docs/fhir-datastore/fhir-batch-requests)**: Guidance across 36 pages was clarified: batches of conditional writes with per-entry recovery are the recommendation where partial progress is acceptable, and the hosted availability of atomic transaction bundles is stated accurately. An async job completing is no longer presented as proof that every entry succeeded

**Questionnaires**

- **[Advanced Questionnaire Authoring](/docs/questionnaires/advanced-authoring)**: Calculated answers, expression-based conditions, page groups, and repeating items, with a runnable preview and an SDC compatibility table that states the renderer's limits explicitly
- **[Modular and Composite Questionnaires](/docs/questionnaires/modular-questionnaires)**: Maintaining shared sections across forms, with a typed example that combines two modules and publishes one complete `Questionnaire` for a single response lifecycle
- **[Saving and Resuming Responses](/docs/questionnaires/saving-and-resuming)**: A durable save and resume workflow: creating or reusing an assigned response, retaining context, validating completion across pages, saving with version checking, and revising a definition while keeping existing responses usable

**Everything else**

- **[Authentication](/docs/auth)**: The authentication pages were reorganized by implementation task, with client-held and server-held token exchange procedures, per-user session isolation, renewal, logout, and the membership selection and error behavior for project and server-level providers
- **[Migration](/docs/migration)**: A two-pass backfill that preserves missing targets as logical references and resolves them with version-checked patches, plus presigned upload and download flows, `Binary` security contexts, URL renewal, resumable transfers, and byte verification
- **[Fax number porting](/docs/integration/efax/number-porting)**: How to port an existing fax number ([Tim Ray](https://github.com/timray721))
- **Reference updates**: ONC certification guidance marked Enterprise-only, the admin flag no longer described as swapping the default access policy ([Aanish Sachdev](https://github.com/aanishs)), `$ai` bots documented as not using `runAsUser` ([Shubham Aggarwal](https://github.com/ShubhamAggarwal0812)), the `bots` feature name corrected in the Running Bots Locally guide ([MAGI ABISHEKAR](https://github.com/theabhishekarmagi)), and Vitest in place of Jest in the contributing testing guide ([Karl Pietrzak](https://github.com/The-Alchemist))

## Bug Fixes

- `Encounter.class` is mapped from `ActCode` and CPT per the C-CDA on FHIR IG, and `negationInd` is read on allergy observations, so a documented "no known allergy" is no longer imported as an allergy (contributed by [Teja Reddy](https://github.com/narasim-teja))
- C-CDA procedure status is mapped from `statusCode`, using `in-progress` for an active procedure (contributed by [Aditya Gupta](https://github.com/MaiAditya))
- Dental, institutional, and pharmacy claims are rejected by `Claim/$export` rather than exported in a format that does not fit them (contributed by [V Govindarajan](https://github.com/vijaygovindaraja))

## From the Blog

Longer-form writing published this month:

- <img src="https://github.com/everett-williams.png" alt="Everett Williams" width="24" height="24" style="border-radius: 50%; vertical-align: middle" /> **[Give Your Coding Agent a Head Start on Medplum](/blog/ai-coding-agents-on-medplum)** by Everett Williams: Pointing a coding agent at Medplum's decision guides so it asks the right questions about a healthcare workflow, and at the persistent rules file so it carries Medplum's conventions into the next task, walked through on a vital-signs example

## Releases

- [**v5.2.14**](https://github.com/medplum/medplum/releases/tag/v5.2.14): November 3
- [**v5.2.15**](https://github.com/medplum/medplum/releases/tag/v5.2.15): November 6
- [**v5.2.16**](https://github.com/medplum/medplum/releases/tag/v5.2.16): November 10
- [**v5.2.17**](https://github.com/medplum/medplum/releases/tag/v5.2.17): November 11
- [**v5.2.18**](https://github.com/medplum/medplum/releases/tag/v5.2.18): November 19

## Looking Ahead

November was a hardening month. If you run Medplum yourself, the items worth reading twice are the [default access policy](/docs/access/access-policies) changes, which apply to new projects only, and the per-client external auth callback, which changes the redirect URI you register with your identity provider. Both are the kind of change that is easier to adopt deliberately than to discover later.

We are also hiring a [Head of Security, a Security Engineer, and a General Counsel](https://www.medplum.com/careers). If the Compliance section above reads like the kind of work you want to own, we would like to talk.

Join us on [Discord](https://discord.gg/medplum) to share feedback or follow along on [GitHub](https://github.com/medplum/medplum). To learn more about anything in this update, or to talk through how it applies to what you are building, contact us at [hello@medplum.com](mailto:hello@medplum.com).
