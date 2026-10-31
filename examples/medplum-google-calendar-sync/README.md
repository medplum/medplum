# Google Calendar sync

This example mirrors Medplum Appointments and independent blocks to a practitioner's primary Google Calendar, and imports Google Busy time into Medplum Slots. The target deployment is Google Workspace Internal consent with shared Bots and a linked customer project. The current implementation requires live acceptance before production use; see [acceptance](acceptance.md).

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

Build runs ESLint, TypeScript and Bot bundling. Tests mock Google and use Medplum's FHIRPath evaluator and policy matcher. They do not deploy or call Google. The example also participates in the repository's npm workspace. Generated FHIR artifacts are committed in `profiles/definitions.json`; `src/scripts/generate-profiles.ts` is their source.

## Deployment and installation

1. Create a customer-owned Google Workspace OAuth client with an Internal consent screen. Register the consuming application's callback URL. Request `openid`, `email`, `https://www.googleapis.com/auth/calendar.events.owned`, and `https://www.googleapis.com/auth/calendar.calendars.readonly`.
2. Enable the Medplum `bots` and `cron` project features. Scheduled repair is unavailable without `cron`; installation reports that condition.
3. Set `BASE_URL`, `PROJECT_ID`, `CLIENT_ID`, and `CLIENT_SECRET` for the **shared deployment project** in your environment, then run `npm run deploy`. The client needs permission to create/deploy Bots and OperationDefinitions. Run one deployment at a time; the administrative Bot-create endpoint has no conditional-create parameter. Deployment reads environment variables; no local credential file is bundled.
4. Link each customer project to the shared project and export the Bots and OperationDefinitions needed for invocation. Do not export customer Basic resources or Slots. A single-project development setup can use the same project for both roles. Multiple visible Bots with the same integration identifier cause installation to fail.
5. As a customer-project administrator, call type-level `Project/$google-calendar-install` with the Google client parameters below. The installer uploads profiles into that customer project, so validation does not depend on profile resolution through a link.
6. Apply the returned practitioner and ordinary Slot policy entries within the customer's existing access scopes. Replace broader Basic/Slot grants; appending these entries to an unrestricted grant does not restrict it. Remove history/vread access to old token-bearing connection versions. Review the installer report for broad reads, writes, arbitrary criteria, unresolved policy references and administrative memberships. Expected restricted integration memberships appear separately. The audit is conservative: custom criteria can produce warnings even when safe. It is not proof of effective server permissions. Stop old workers and remove the former caller connection grant before upgrading; apply the new public-status grant after installation.
7. Give practitioners read access to the public operation Bots and OperationDefinitions. Keep clinical read access consistent with the application's existing policy. Only install runs as the administrator; status runs as the practitioner; connect, settings, disconnect and range requests use restricted Bot memberships. Worker and mutation Bots reject a missing or incorrect membership instead of accepting caller fallback.
8. Implement OAuth state verification and PKCE in the consuming application. Send the authorization code, verifier and registered redirect URI to the connect operation as the practitioner. The application must explain that disconnect removes imported blocks and makes that time bookable, subject to other scheduling constraints.

Install input:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "GOOGLE_CALENDAR_CLIENT_ID", "valueString": "YOUR_GOOGLE_CLIENT_ID" },
    { "name": "GOOGLE_CALENDAR_CLIENT_SECRET", "valueString": "YOUR_GOOGLE_CLIENT_SECRET" },
    { "name": "GOOGLE_CALENDAR_DETAIL_LEVEL", "valueString": "busy-only" }
  ]
}
```

`GOOGLE_CALENDAR_APPOINTMENT_URL` is optional. The project detail level defaults to `busy-only`. Reinstall to change that ceiling or rotate the Google client secret. If Bot input storage is enabled, install input can persist the client secret in Bot-input storage; restrict that storage and use a dedicated client. Installation derives the webhook URL from the customer webhook membership and API base URL. It returns policy instructions and warnings inside an `outcome` Parameters resource; inspect those even when `installed=true`.

Deployment creates ten Bots. Installation creates or adopts eight Bot memberships, five policies, eight Subscriptions and two Crons. It preserves the IDs of existing memberships and settings, and migrates legacy connection credentials under a lease. It does not change practitioner policies automatically. Installation is resumable; retry after resolving a reported prerequisite or active lease.

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
npm run migrate-mirrors
npm run migrate-mirrors -- --apply
```

The first command reports candidates without changing Google events; it takes a connection lease. Apply verifies project, source participation, connection/account and ETag, adds the connection marker, and replaces legacy details with Busy-only content and no attendees. Ambiguous or deleted sources require administrator repair; the command will not adopt them based on event ID alone. Retry interrupted migrations. Receipts written after verified Google writes support later tombstone recovery.

For rollback, stop delivery to the new workers before changing bundles. Do not restore the old caller-write policy or token-bearing connection shape. Older workers cannot read split credentials. Correct forward or use a reviewed storage migration; merely redeploying the old bundle is not a safe rollback.

`connect-local` provides a loopback OAuth helper for development. `live-test` creates and deletes Google test events and revokes its grant; use an isolated account and dedicated OAuth client. Neither script is part of build or unit tests.
