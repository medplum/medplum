# Google Calendar sync

This example mirrors Medplum Appointments and independent blocks to a practitioner's primary Google Calendar, and imports Google Busy time into Medplum Slots. The target deployment is Google Workspace Internal consent with shared Bots and a linked customer project. The current implementation requires live acceptance before production use; see [acceptance](acceptance.md).

This is a source example in the Medplum npm workspace, not a published npm package or a hosted connector with a bundled user interface. It follows the separate-example layout used by the [Healthie importer](../medplum-healthie-importer) and [Photon integration](../medplum-photon-integration).

- [Setup](setup.md): prerequisites, credentials, deploy, install, connect and test.
- [Architecture](architecture.md): Bot responsibilities, permissions and package layout.
- [State and operations](state-and-status.md): status fields and notification recipes.
- [Migration](migration-notes.md): existing installations and rollback constraints.
- [Acceptance](acceptance.md): live checks required before production use.

## Scheduling behavior

Medplum owns Appointments and native blocks. Google imports write only integration-owned `busy-unavailable` Slots on every active Schedule associated with the practitioner, including PractitionerRole associations and newly created Schedules. Imported Slots never become outbound sources.

Import includes timed Busy events and expanded recurring occurrences. It excludes all-day, transparent, cancelled, declined, and integration-mirrored events. Slots contain intervals, Schedule references and ownership identifiers, without Google titles, descriptions or guests. Failed snapshots retain existing blocks and last-known conflicts. Malformed imported identities remain in place, generate a Bot-log warning for administrator repair, and do not stop other connections from importing.

Outbound supports `busy-only`, `initials`, and `full`. Patient attendees are excluded. Lowering either the practitioner level or project ceiling queues a scrub of all owned mirrors, including past events. Raising the ceiling does not increase historical detail during repair. New discovery covers 90 days; an explicit range request accepts up to 366 days. Reconciliation also repairs existing mirrors outside the discovery horizon, including removals.

Google mirrors carry `medplumProject`, `medplumSource`, and `medplumConnection` private properties. Writes check ownership and ETag. A cancelled event whose ownership properties disappeared can be restored only when a durable receipt proves that the same project, practitioner and Google account previously owned that source/event pair. Receipts survive disconnect. A verified predecessor connection can be replaced under If-Match on reconnect; unrelated or unproven ownership is refused.

## Build and local checks

Use Node 22.22 or Node 24.2 and later within those major versions. From the Medplum repository root:

```sh
npm ci
npx turbo run build --filter=medplum-google-calendar-sync
npm run profiles --workspace=medplum-google-calendar-sync
npm test --workspace=medplum-google-calendar-sync
```

Build runs ESLint, TypeScript and Bot bundling. Default unit tests mock Google and use Medplum's FHIRPath evaluator and policy matcher. They do not deploy or call Google. The example also participates in the repository's npm workspace. Generated FHIR artifacts are committed in `profiles/definitions.json`; `src/scripts/generate-profiles.ts` is their source.

## Deployment and installation

Follow [setup.md](setup.md). Deployment uploads ten Bots and six operation definitions; `setup:project` invokes the installer in the selected customer project. The installer creates or adopts eight restricted Bot memberships, five policies, eight Subscriptions, two Crons, and the profile definitions. Applying practitioner access rules and connecting Google are separate setup steps.

All commands run from the repository root. CLI deployment requires the installed `medplum` command, an authenticated profile and an explicit `PROJECT_ID`. `--check` verifies the authenticated project and reads the local bundles without changing resources. Installation requires a project administrator. Neither a successful deploy nor installer response proves live synchronization; run the smoke tests and review the acceptance checklist.

## Live deployment smoke tests

After customer installation and Google consent, use a practitioner CLI login with sandbox administrator access. The runner reads the installed Google client and connection credential in memory. It requires at least one active practitioner Schedule. It creates a synthetic Appointment and a marked Google event, then verifies create, update and removal in both directions through the deployed workers. It does not invoke the worker implementation locally or manually queue imports. These checks observe delivery, but do not distinguish a webhook from scheduled recovery.

From the repository root, with `PROJECT_ID` and optional `MEDPLUM_PROFILE` set:

```sh
export E2E_MANIFEST="$PWD/test-results/gcal-e2e-$(date +%s).json"
npm run deploy --workspace=medplum-google-calendar-sync -- --cli --e2e
# Or test an already deployed and installed integration:
npm run test:e2e --workspace=medplum-google-calendar-sync
# Retry cleanup after failure or interruption, using the SAME manifest path:
npm run test:e2e:cleanup --workspace=medplum-google-calendar-sync
```

Choose a new manifest path for each new run; existing files are never overwritten when starting a test. The manifest records fixture identities before creation, with restricted file permissions and no tokens. Cleanup runs after success, failure, SIGINT or SIGTERM. After a killed process or machine restart, rerun cleanup with the saved manifest. Each asynchronous assertion has a three-minute deadline. Tests temporarily block ten minutes one week ahead, then move that block forward an hour.

Cleanup removes only the marked Google fixture, its exact imported Slots, and mirrors of the test Appointment. It checks ownership and versions, and uses the connection lease to avoid racing workers. It cancels the synthetic Appointment and retains it for audit; it does not delete Appointments. It does not disconnect, revoke Google access, change detail settings, or touch unrelated events. If access is lost or the worker lease is busy, cleanup fails visibly and the manifest remains available for retry. A run exits unsuccessfully if either a check or cleanup fails.

This smoke test does not establish booking-operation availability, privacy-mode changes, recurrence, Workspace/linked-project isolation, or all release criteria in [acceptance](acceptance.md). Those need additional isolated fixtures. The older `live-api-probe` command tests Google API behavior only; it is not the deployment test and has no persistent recovery manifest. It now cleans up in `finally`, uses no guest addresses and preserves existing grants.

## Public operations

All operations are type-level and use FHIR Parameters. Definitions and explicit input/output validation come from `src/common/contracts.ts`; server dispatch alone is not contract validation.

| Operation | Inputs | Result |
| --- | --- | --- |
| `Project/$google-calendar-install` | Required Google client ID/secret; optional project detail level and appointment URL, all valueString | Installation result and administrator instructions |
| `Practitioner/$google-calendar-connect` | Required `code`, `codeVerifier`, `redirectUri`; optional `eventDetailLevel`, all valueString | Connection summary; initial work queued |
| `Practitioner/$google-calendar-status` | None | Read-only status and caller-authorized conflicts |
| `Practitioner/$google-calendar-settings` | Required `eventDetailLevel` valueString | Connection summary; privacy scrub queued |
| `Practitioner/$google-calendar-disconnect` | Optional `forgetRevoked` valueBoolean | Cleanup queued; status remains disconnecting until finished |
| `Practitioner/$google-calendar-sync` | Optional `start` and `end` ISO date-time valueString | `queued=true` and the accepted range; no synchronous Google work |

The practitioner always comes from the server's authenticated requester. Supplying another practitioner in the body is rejected. Status accepts no settings mutation. A second explicit range request is rejected while one is pending. Mutation summaries omit conflict details; read status afterward for those. See [state and status](state-and-status.md) for the fields and notification recipes.

## Storage and permissions

Private connection state, public status, credentials, project settings and mirror receipts are separate integration-bookkeeping Basics. Tokens remain in Basic under access control as an interim storage choice; no application AES layer is used. Practitioners can read/search their own public status summary and read settings. Connections, credentials and mirror receipts are worker-only. Status computes conflicts in the next 90 days from imported Slots and eligible Appointments visible under the caller's policy; private worker conflicts and channel identifiers never enter the public summary. Permission checks are memoized and performed only for overlap candidates. Status has an explicit 120-second timeout; real-volume latency remains an acceptance check. Webhooks cannot read credentials or historical connection versions.

Imported Slot identities are unchanged: system `https://www.medplum.com/integrations/google-calendar/imported-slot`, value `v1.` plus base64url of `[connectionId, actualCalendarId, occurrenceId, scheduleReference]`. Conditional writes use that identity. The settings identifier is project-qualified; reinstallation adopts the current project's legacy settings record in place. State searches explicitly select the authenticated customer project and reject ambiguous settings.

Profiles describe resource shape and data quality. They do not grant or deny access, and no default profile is applied to ordinary Slots. Six resource profiles cover private connections, public status, credentials, settings, mirror receipts and imported Slots. Mirror receipts are separate records to avoid an unbounded history array on a connection. They store a hash of the ownership identity, not event content.

## Delivery, cleanup and migration

Appointment/Slot Subscriptions drive outbound changes. Schedule/PractitionerRole actor and active-state changes queue both directions for practitioners found in that resource's authoritative history. Metadata-only edits do not trigger the create/update Subscriptions; separate delete-only Subscriptions ensure deletion delivery. Connection Subscriptions observe work-marker transitions. Google's authenticated webhook queues inbound work. Hourly reconciliation and a minute recovery Cron repair missed deliveries. The intervals are scheduling targets, not delivery SLAs.

A version-guarded lease serializes connection changes and workers. Workers have an eight-minute work budget within a 600-second Bot timeout; leases expire after 15 minutes. Outbound work saves cursors; inbound retries refetch a complete snapshot. Google access revocation retains future blocks and exposes stale status until reconnect or explicit disconnect. Conflicts are status plus customer-owned notification workflows, without automatic Tasks.

Disconnect removes verified Google mirrors, revokes the credential after remote cleanup, removes verified imported Slots, and deletes connection/credential/public-status records. Account-bound ownership receipts remain for safe reconnect recovery. Malformed Slot identities remain in place with Bot-log warnings for administrator repair; they do not block unrelated disconnects or cause uncertain Slots to be deleted. Remote outages retain blocks. If Google is reachable but a legacy mirror lacks ownership evidence, cleanup removes verified data, retains the connection in `disconnecting`, and reports `legacy-mirror-repair-required`. Reconnect during disconnect continues cleanup. For revoked grants, `forgetRevoked=true` explicitly accepts residual Google events while removing local blocks. Switching accounts requires completing disconnect first.

Before upgrading an installation with old mirrors, use the migration command with a dedicated test account first. Set the Medplum service credentials, `CONNECTION_ID`, `GOOGLE_CALENDAR_CLIENT_ID`, and `GOOGLE_CALENDAR_CLIENT_SECRET` in the environment:

```sh
npm run migrate-mirrors --workspace=medplum-google-calendar-sync
npm run migrate-mirrors --workspace=medplum-google-calendar-sync -- --apply
```

The first command reports candidates without changing Google events; it takes a connection lease. Apply verifies project, source participation, connection/account and ETag, adds the connection marker, and replaces legacy details with Busy-only content and no attendees. Ambiguous or deleted sources require administrator repair; the command will not adopt them based on event ID alone. Retry interrupted migrations. Receipts written after verified Google writes support later tombstone recovery.

For rollback, stop delivery to the new workers before changing bundles. Do not restore the old caller-write policy or token-bearing connection shape. Older workers cannot read split credentials. Correct forward or use a reviewed storage migration; merely redeploying the old bundle is not a safe rollback.

`connect-local` provides a loopback OAuth helper for development. `live-api-probe` creates and deletes Google test events without revoking existing grants; use an isolated account and dedicated OAuth client. Neither script is part of build or unit tests.

## License and contributions

[Apache-2.0](LICENSE.txt), like the Medplum repository. Follow the repository's [contribution guide](../../packages/docs/docs/contributing/index.md). Keep credentials, project-specific configuration, live test manifests and deployment reports out of commits. Local `.env` files and test outputs are ignored; `.env.example` contains placeholders only. Build and unit tests run through the existing workspace pipeline; deployment and live tests are explicit commands.
