# Fresh-install acceptance before release

Legacy prototype migration is not a release prerequisite. Validate a new installation using only the public example, its documented configuration and Google consent. Old sandbox data is a separate maintenance concern.

The optional deployment smoke test (`npm run deploy -- --cli --e2e` from this example) covers deployed create/update/removal in both directions and fixture cleanup. It does not replace the acceptance scenarios below; see the README for manifest-based recovery.

Local tests and builds establish the covered code paths. They do not establish live Google behavior or the permissions of a customer deployment. Record the revision, deployment, grant, outcomes and fixture cleanup for each acceptance run.

- Prove practitioner REST create/update/delete cannot bypass connection operations; credential read/search/history/vread and webhook credential access are denied. Check legacy connection history, broad grants, inherited policies and default memberships.
- Use distinct shared and customer projects. Check operation Bot identity, linked Bot lookup, conditional writes with `_project`, profile installation, and isolation from an exported foreign Basic. Reinstall without duplicate records.
- Complete Workspace Internal consent with both Calendar scopes. Test real watch callbacks, renewal, replay rejection, missed notifications and scheduled catch-up.
- Test timed Busy events, recurrence exceptions, cancellations, declined invitations, all-day/free exclusions and a newly added Schedule. Verify actual booking availability after creation, update, removal and disconnect.
- Test outbound create/update/removal, reassignment, a missed cancellation, native block deletion, and historical detail scrubs. No patient attendees should be added to any mirror.
- Probe cancelled Google tombstones with and without properties. Restoration must require account/practitioner/project/source-bound ownership evidence and an ETag. Disconnect then reconnect to the same and different Google accounts; only a verified predecessor may be reclaimed. A crash after Google insertion but before receipt storage may require manual repair if the event is deleted before retry; do not infer ownership.
- Test unreadable/deleted sources, partial disconnect, credential revocation, retained stale blocks, and explicit forgetting of revoked access. Use isolated accounts/grants for revocation and cleanup tests.
- Verify caller-filtered conflicts, denied direct reads of private connection state, public-summary refresh and customer notification deduplication, including stale conflict retention and permission failures.
- Measure large paginated calendars, quota backoff, concurrent deliveries and continuation near the eight-minute budget. Record limits rather than extrapolating from a small calendar.

A public draft may identify these as unfinished. Production release requires passing the agreed Workspace/linked-project scenarios. The example's directory and profile canonical namespace remain subject to maintainer review.

For an earlier development sandbox only, remove legacy caller connection grants before reuse. Confirm malformed imported Slots remain identified by Bot-log warnings without preventing other disconnects. History-based Schedule dispatch must include prior actors and reject cross-project histories. Test failures during initial OAuth persistence and grant cleanup; never log tokens. Verify whether Google revocation invalidates other tokens for the same account/client. Automatic failed-connect cleanup must preserve any existing stored grant; application-access removal is an explicit administrator/user action. Measure status latency over realistic 90-day data, and test publication failure/retry without a held lease.

The extended smoke command covers filtering transitions, a newly added Schedule, conflict opening/resolution and recurring-series expansion/removal. It preserves the connected account and detail settings. Destructive grant/disconnect tests and historical privacy scrubs require a dedicated disposable connection. A successful smoke run must finish with cleanupComplete=true in its manifest; otherwise retry cleanup before running new fixtures.

Hourly outbound repair still lists all owned mirrors and verifies their sources, including history. Matching mapped fields skip the Google PUT; ownership receipts are still ensured. Within one delivery, repair skips a source already synced by discovery only when its version and the listed mirror still match. Continuations can revisit sources from an earlier delivery. Measure this remaining history scan and its read traffic on large calendars; the no-op optimization is not evidence of acceptable quota or runtime at scale.
