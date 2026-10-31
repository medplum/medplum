# Acceptance before release

Local tests and builds establish the covered code paths. They do not establish live Google behavior or the permissions of a customer deployment. Record the revision, deployment, grant, outcomes and fixture cleanup for each acceptance run.

- Prove practitioner REST create/update/delete cannot bypass connection operations; credential read/search/history/vread and webhook credential access are denied. Check legacy connection history, broad grants, inherited policies and default memberships.
- Use distinct shared and customer projects. Check operation Bot identity, linked Bot lookup, conditional writes with `_project`, profile installation, and isolation from an exported foreign Basic. Reinstall without duplicate records.
- Complete Workspace Internal consent with both Calendar scopes. Test real watch callbacks, renewal, replay rejection, missed notifications and scheduled catch-up.
- Test timed Busy events, recurrence exceptions, cancellations, declined invitations, all-day/free exclusions and a newly added Schedule. Verify actual booking availability after creation, update, removal and disconnect.
- Test outbound create/update/removal, reassignment, a missed cancellation, native block deletion, and historical detail scrubs. No patient attendees should remain on migrated mirrors.
- Probe cancelled Google tombstones with and without properties. Restoration must require account/practitioner/project/source-bound ownership evidence and an ETag. Disconnect then reconnect to the same and different Google accounts; only a verified predecessor may be reclaimed. A crash after Google insertion but before receipt storage may require manual repair if the event is deleted before retry; do not infer ownership.
- Test dry-run and applied legacy migration, unreadable/deleted sources, partial disconnect, credential revocation, retained stale blocks, and explicit forgetting of revoked access. Use isolated accounts/grants for revocation and cleanup tests.
- Verify caller-filtered conflicts, denied direct reads of private connection state, public-summary refresh and customer notification deduplication, including stale conflict retention and permission failures.
- Measure large paginated calendars, quota backoff, concurrent deliveries and continuation near the eight-minute budget. Record limits rather than extrapolating from a small calendar.

A public draft may identify these as unfinished. Production release requires passing the agreed Workspace/linked-project scenarios. The example's directory and profile canonical namespace remain subject to maintainer review.

Upgrade only after removing legacy caller connection grants. Confirm malformed imported Slots remain identified by Bot-log warnings without preventing other disconnects. History-based Schedule dispatch must include prior actors and reject cross-project histories. Test failures during initial OAuth persistence and grant cleanup; never log tokens. Verify whether Google revocation invalidates other tokens for the same account/client. Automatic failed-connect cleanup must preserve any existing stored grant; application-access removal is an explicit administrator/user action. Measure status latency over realistic 90-day data, and test publication failure/retry without a held lease.
