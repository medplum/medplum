# Calendar state and status contract

This contract describes the local implementation. These are Medplum-owned integration bookkeeping records, not clinical resources. Appointments remain Medplum-owned and Google busy intervals use native R4 Slots. The namespace below retains the original integration namespace; the generated definitions are in `profiles/definitions.json`. Deployment validation remains a release gate.

## Connection and settings

Let `N` mean `https://www.medplum.com/integrations/google-calendar`. A connection is a Basic with `code.coding` system `N`, code `calendar-connection`, and `subject.reference=Practitioner/<id>`. Its stable identifier is `N/connection|Practitioner/<id>`. The account subject is a separate `https://accounts.google.com|<sub>` identifier. A watch channel adds an `N/watch-channel|<channelId>` identifier for native lookup.

Top-level connection extensions are:

| URL suffix under N | Type | Meaning |
| --- | --- | --- |
| `/account-email` | valueString | Google account email, when available |
| `/status` | valueCode | `active`, `reauth-required`, or `disconnecting` |
| `/event-detail-level` | valueCode | Optional practitioner ceiling: `busy-only`, `initials`, `full` |
| `/worker-lease` | extension | `owner` valueString UUID; `expires` valueInstant |
| `/sync-state` | extension | Fields below |

The project settings Basic has code `N|calendar-settings`, identifier `N/settings|Project/<customer-project-id>`, and extension `N/project-detail-level` with valueCode `busy-only`, `initials`, or `full`. Workers and practitioners read it; installation writes it. It contains no credential. A settings read failure is an error, not permission to fall back to a broader ceiling.

Credentials use Basic code `N|calendar-credential`, identifier `N/credential|Basic/<connection-id>`, the same practitioner subject and Google account identifier, and `N/refresh-token` valueString. Only authorized workers and connect can read them. Migration removes the token from the connection's current version; history/vread must remain denied to practitioner and webhook memberships.

Mirror receipts use Basic code `N|calendar-mirror`, subject `Basic/<connection-id>` and identifier `N/mirror|<sha256>`. The hash covers project, connection, Google account subject, event ID and Medplum source reference. Only workers write receipts after verified ownership. An additional `N/mirror-account` hash covers project, Google account, practitioner, event and source without the connection ID. Receipts retain their predecessor connection subject across disconnect; reconnect requires that evidence when replacing an old connection marker. They are not a fallback based solely on an event ID.

## Public status summary

The worker connection is private. A separate `calendar-public-status` Basic has the same practitioner subject and identifier `N/public-status|Basic/<connection-id>`. Workers publish an allowlisted summary under the connection lease. It holds status, email, detail level, freshness, pending flags, diagnostic categories and conflict revision. It contains no refresh token, Google account subject, raw conflicts, watch-channel identifiers, lease or outbound cursor. Failed publication records a private statusPublishPending flag and releases the lease. Minute recovery retries publication, including paused connections. Status may show the previous summary until that retry succeeds.

## Durable sync state

All names below are relative child-extension URLs under `N/sync-state`. Optional scalar fields appear at most once. Repeated records use nested extensions. `src/common/state.ts` defines the serialization.

| Field | FHIR value type | Meaning |
| --- | --- | --- |
| inboundRequest, outboundRequest | string | UUID identifying requested work |
| inboundCompleted, outboundCompleted | string | Request generation covered by a completed Google import or outbound repair, respectively; conflict refresh is tracked separately |
| lastInbound, lastOutbound | instant | Last completed Google import or outbound repair, respectively; not a single-event acknowledgement |
| inboundRetryAt, outboundRetryAt | instant | Retry deadline for Google throttling or disconnect ownership repair; no Google work before it |
| staleReason, inboundError, outboundError | string | Stable diagnostic category, without vendor event content |
| privacyPending | boolean | All-owned-mirror scrub has not completed for the current request/configuration |
| projectDetailLevel | code | Last ceiling read by an outbound worker |
| statusPublishPending | boolean | Public summary publication needs a retry |
| conflictsRevision | string | New UUID when the conflict set opens, changes, or resolves |
| conflictsPending | boolean | Local conflict refresh remains incomplete after the Google import |
| forgetRevoked | boolean | Explicit consent to leave residual Google events when access is revoked |
| googleCleaned, slotsCleaned, credentialRevoked | boolean | Disconnect cleanup checkpoints |
| cleanupIssue | string | Unresolved cleanup category, including legacy ownership |
| requestedRangeStart, requestedRangeEnd | instant | Explicit outbound range retained until a successful repair |
| channel | nested, repeated | Watch binding, described below |
| conflict | nested, repeated | Last successful conflict set, described below |
| outboundWork | nested, optional | Range and cursor for a partially completed repair |

A channel has `id`, `tokenHash`, optional `resourceId`, and optional `lastMessage` as valueString, plus `expires` as valueInstant. `tokenHash` is SHA-256; the raw channel token is never persisted. `lastMessage` is a decimal string compared with BigInt.

A conflict has `key` valueString, `appointment` valueReference, repeated `schedule` valueReference, and `start`/`end` valueInstant. The internal key is base64url of `[connectionId, calendarId, occurrenceId, appointmentReference]`. This internal key is not returned directly by status. Conflicts use half-open intervals, ignore wholly past overlaps, and combine duplicate Schedules. Failed reads retain the prior conflict set.

An outboundWork record has `start`/`end` valueInstant, `phase` valueCode (`discover` or `repair`), optional `cursor` valueString, `errors` valueUnsignedInt, and `request` valueString. Discovery cursors are source references; repair cursors are Google event IDs. A new request invalidates earlier work; a worker's own continuation advances the request and preserves its cursor. Errors prevent completed-generation and success-time advancement.

## Status Parameters

`Practitioner/$google-calendar-status` resolves the caller from the authenticated requester. It accepts no input parameters and performs no writes. Change `eventDetailLevel` through `Practitioner/$google-calendar-settings`. Status derives conflicts within the next 90 days from caller-visible imported Slots and eligible Appointments, then checks referenced-resource read permissions. Retained Slots still show stale busy-time overlaps after revocation. Status returns a Parameters resource; `connected` is always present. Other fields appear when a connection exists.

| Parameter | Type | Meaning |
| --- | --- | --- |
| connected | valueBoolean | A connection record exists, including paused or disconnecting records |
| status | valueCode | Connection lifecycle state |
| email | valueString, optional | Google account email |
| eventDetailLevel | valueCode, optional | Practitioner's selected ceiling |
| effectiveDetailLevel | valueCode | Stricter of project and practitioner ceilings |
| privacyCleanupPending | valueBoolean | Scrub remains outstanding |
| inboundPending, outboundPending | valueBoolean | Requested generation remains incomplete, or outbound work has a checkpoint |
| stale | valueBoolean | Import is unverified, overdue, errored, paused, or disconnecting; outbound errors also set it |
| staleReason | valueCode, optional | Current diagnostic category |
| lastSuccessfulInbound, lastSuccessfulOutbound | valueInstant, optional | Last successful full-direction runs |
| activeConflictCount | valueInteger | Count of conflicts whose Appointment the caller can currently read |
| conflict | repeated part | Authorized conflict fields below |
| disconnectWarning | valueString | Explains that removing imported blocks makes time bookable |

Each conflict part contains `key` valueString (SHA-256 of the internal key), `appointment` valueReference, `start`/`end` valueInstant, and zero or more authorized `schedule` valueReferences. A denied or deleted reference is omitted; a transient authorization/read failure fails the operation instead of claiming resolution.

Current stale reasons include `awaiting-initial-import`, `import-overdue` (more than two hours since success), `inbound-pending`, `inbound-error`, `outbound-error`, `outbound-incomplete`, `outbound-quota`, `reauth-required`, `disconnecting`, `legacy-mirror-repair-required`, `mirror-identity-repair-required`, `checkpoint-repair-required`. The two-hour threshold is a UI freshness threshold, not a sync SLA. Retained conflicts are last-known information while stale.

## Customer workflows

`notificationSubscription('Bot/<customer-workflow-id>', 'reauth' | 'conflicts')` in `src/common/subscriptions.ts` returns an installable Subscription. The integration does not install a customer notification workflow automatically. Both recipes select `Basic?code=N|calendar-public-status`, with `N` expanded, and use create/update interaction extensions plus `https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression`.

The reauthentication expression is:

```text
%current.extension.where(url='https://www.medplum.com/integrations/google-calendar/status').valueCode = 'reauth-required' and (%previous.extension.where(url='https://www.medplum.com/integrations/google-calendar/status').valueCode.empty() or %previous.extension.where(url='https://www.medplum.com/integrations/google-calendar/status').valueCode != 'reauth-required')
```

The conflict expression is:

```text
%current.extension.where(url='https://www.medplum.com/integrations/google-calendar/sync-state').extension.where(url='conflictsRevision').valueString.exists() and (%previous.extension.where(url='https://www.medplum.com/integrations/google-calendar/sync-state').extension.where(url='conflictsRevision').valueString.empty() or %previous.extension.where(url='https://www.medplum.com/integrations/google-calendar/sync-state').extension.where(url='conflictsRevision').valueString != %current.extension.where(url='https://www.medplum.com/integrations/google-calendar/sync-state').extension.where(url='conflictsRevision').valueString)
```

Runtime tests evaluate opening, resolution, and unrelated writes with Medplum's FHIRPath evaluator. A customer workflow must deduplicate by connection/version or conflict revision, reread current state, authorize each recipient's references, and persist its own delivery checkpoint. Neither recipe guarantees exactly-once or automatic Bot retry. The customer owns notification delivery and retry behavior.

Use a restricted customer Bot as the endpoint. New public-status payloads omit private state and tokens, but legacy queued connection deliveries may contain them. Never forward raw connection payloads to email, Slack, or general external webhooks. Build a minimal authorized notification from the state. The caller-facing status operation cannot be used to impersonate a practitioner from a Bot; it always uses the authenticated requester.

## Permission requirements

The installer returns these own-summary entries; the private connection is not caller-readable. Apply them within existing policies; replace broader Basic grants that permit direct connection writes or credential/history reads.

```json
[
  { "resourceType": "Basic", "criteria": "Basic?code=https://www.medplum.com/integrations/google-calendar|calendar-public-status&subject=%profile", "interaction": ["read", "search"] },
  { "resourceType": "Basic", "criteria": "Basic?code=https://www.medplum.com/integrations/google-calendar|calendar-settings", "readonly": true }
]
```

Restrict ordinary Slot writers with these rules, preserving any existing Schedule, tenant, or other scope. Replace unrestricted grants rather than appending these entries alongside them.

```json
[
  { "resourceType": "Slot", "criteria": "Slot?identifier:not=https://www.medplum.com/integrations/google-calendar/imported-slot|" },
  { "resourceType": "Slot", "criteria": "Slot?identifier=https://www.medplum.com/integrations/google-calendar/imported-slot|", "readonly": true }
]
```

The importer uses the positive identifier criterion with write access. It has no Appointment or Schedule write grant. Core matcher tests cover allowed imported Slot CRUD, denied ordinary Slot writes, denied Appointment/Schedule writes, and ordinary-writer denial of a forged reserved identifier. Server tests must also prove that removing or changing an existing identifier cannot bypass the old-resource check. Check all effective policy entries and administrative memberships; an identifier alone is not authorization.

Malformed imported identifiers produce Bot-log warnings only. The uncertain Slots remain blocked until an administrator repairs them; no connection is blamed for an unassignable row. A durable project-wide repair queue is not implemented. Ownership receipts are retained across disconnect for recovery; receipt-retention policy remains a release item.

## Corrupt checkpoint recovery

Workers preserve the latest invalid outbound checkpoint or requested range in the private connection's `invalid-outbound-checkpoint` extension, remove it from active state, and request fresh outbound discovery. Invalid requested ranges are cleared rather than copied into new work. Requested ranges must contain both endpoints in UTC millisecond format, with the start before the end. The saved cursor is never trusted. Lease acquisition and release use the repaired state so corruption cannot retain the worker lock. This diagnostic extension is never copied into public status. An administrator can inspect it after recovery. A later corrupt value replaces this diagnostic instead of growing the resource indefinitely.

Appointment changes recompute conflicts from current imported Slots in Medplum. Each conflict names only Schedules that contain the overlapping block. A busy lease or failed local refresh queues inbound work for that practitioner and does not prevent later recipients from refreshing. Google webhooks and scheduled reconciliation still refresh the source events.

If disconnect finds a mirror whose ownership needs repair, it retains the remote event, removes verified imported Slots, and records a cleanup issue. Automatic retries wait an hour between Google sweeps while the issue remains.

A completed Google import records its generation and freshness before conflict calculation. If local conflict calculation fails or reaches its time budget, the private `conflictsPending` flag keeps the inbound status pending. The minute recovery job retries conflicts from Medplum Slots without downloading Google again, unless a new inbound request has arrived. Successful imports calculate conflicts from the intervals and Schedules just imported; Appointment-triggered refreshes search only the practitioner's active Schedules within the 90-day window. This narrows the scan but does not replace the large-calendar acceptance test.
