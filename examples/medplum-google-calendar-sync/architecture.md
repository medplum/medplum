# Package architecture

The package follows Medplum's [multi-Bot organization](https://www.medplum.com/docs/bots/bot-code-organization): thin entry points under `src/bots`, shared TypeScript under `src/common`, and one bundled JavaScript artifact per Bot. `@medplum/core` is supplied by the runtime. The repository's esbuild, TypeScript, ESLint and Vitest workflows build and test the example; this package is private and is not published to npm.

## Layout

```text
src/bots/                 Ten deployed entry points and their unit tests
src/common/               Sync engine, resource mapping, access and operation contracts
src/scripts/              Deployment, installation, OAuth helper and live-test tooling
profiles/definitions.json Generated FHIR definitions committed for reproducibility
.env.example              Placeholder environment configuration
setup.md                  Build, deploy, install, connect and test
state-and-status.md       Resource state, public outputs and notification recipes
migration-notes.md        Optional prototype recovery (not a setup step)
acceptance.md             Remaining live release checks
```

Build checks the committed profile artifact against `src/scripts/generate-profiles.ts`. Run `npm run profiles --workspace=medplum-google-calendar-sync` after changing the generator. Profiles describe six resource shapes plus their supporting terminology/extensions. They do not authorize access or replace explicit operation validation.

Shared modules separate installation concerns: `install.ts` manages Bot lookup, memberships, secrets and Crons; `policies.ts` defines permissions and audits existing grants; `subscriptions.ts` defines scheduling delivery, work requests and notification recipes. Runtime modules import these responsibilities directly.

## Bot responsibilities

| Bot identifier                   | Entry point                                         | Execution context                    |
| -------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `install-google-calendar`        | Customer installation                               | Authenticated administrator          |
| `google-calendar-connect-bot`    | OAuth code exchange and credential persistence      | Restricted connection membership     |
| `google-calendar-status-bot`     | Read status and caller-visible conflicts            | Authenticated practitioner           |
| `google-calendar-settings-bot`   | Detail selection and scrub request                  | Restricted operation membership      |
| `google-calendar-disconnect-bot` | Queue disconnect cleanup                            | Restricted operation membership      |
| `google-calendar-sync-range-bot` | Queue an explicit outbound range                    | Restricted operation membership      |
| `google-calendar-sync-bot`       | Appointment/native-block Subscription delivery      | Restricted outbound worker           |
| `google-calendar-reconcile-bot`  | Scheduled dispatch and outbound repair              | Restricted outbound worker           |
| `google-calendar-import-bot`     | Google import, watch renewal and disconnect cleanup | Restricted inbound worker            |
| `google-calendar-webhook-bot`    | Authenticate Google notifications and queue import  | Restricted public webhook membership |

Six type-level operations expose install, connect, status, settings, disconnect and range sync. Their declarations and Bot-side validation share `src/common/contracts.ts`. Background workers are not public custom operations. Installer policies separate caller-readable summaries from private worker state and credentials; the webhook cannot read the credential resource.

## Data ownership and privacy

Medplum owns Appointments and native blocks. Google import writes only owned `busy-unavailable` Slots on active practitioner Schedules. Those Slots are excluded from outbound sync. The importer discovers existing Schedules; it does not create scheduling configuration for the application.

The effective outbound detail is the stricter of the project ceiling and practitioner choice. There is one bound detail-level value, not three profiles:

- `busy-only`: Appointment title, time and authenticated application link, without a patient name.
- `initials`: patient initials for a single-patient Appointment, with the application link.
- `full`: patient and service names where available; may also include reason, comments and location.

Patient attendees are never added. Group appointments use a patient count rather than listing patient names. Native blocks always have a Busy title. Lowering detail queues removal of disallowed fields from all owned mirrors, including past events. Inbound Slots carry intervals and ownership identity, not Google titles, descriptions or guests.

Credentials remain in an access-controlled Basic extension as an interim storage choice. No application AES layer is present. Customers must remove broad credential/history grants and rotate previously exposed legacy grants. Retained ownership receipts enable verified same-account reconnect recovery; retention policy is still a release item.

## Delivery and recovery

Medplum Subscriptions handle outbound changes and work requests. Google watch notifications queue inbound snapshots. Hourly reconciliation repairs missed creates, updates and removals, and the minute Cron retries unfinished work. Scheduled dispatch requires the project Cron feature. The installer grants dispatchers create-only access to AsyncJob, which the server needs for asynchronous Bot calls; it does not grant job read, update or delete access.

Versioned connection leases serialize workers. Google writes verify ownership and use ETags. Conditional FHIR creates use stable identities; imported Slot keys include connection, calendar, event occurrence and Schedule. Readable but malformed imported identities remain blocked with a Bot-log warning, rather than being guessed or removed.

Status publication can lag behind private worker state. Publication-only retries do not need a new Google snapshot. Google revocation preserves future imported blocks until reconnect or explicit disconnect. Conflicts leave the Appointment and block intact and are exposed through caller-authorized status and customer-configured notification workflows.

For exact state fields, cleanup checkpoints and notification examples, see [state-and-status.md](state-and-status.md). For the difference between unit tests, deployed smoke tests and production acceptance, see [acceptance.md](acceptance.md).
