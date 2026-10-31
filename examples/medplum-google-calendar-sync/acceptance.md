# Acceptance before release

Local tests and builds establish the covered code paths. They do not establish live Google behavior or the permissions of a customer deployment. Record the revision, deployment, grant, outcomes and fixture cleanup for each acceptance run.

- Prove practitioner REST create/update/delete cannot bypass connection operations; credential read/search/history/vread and webhook credential access are denied. Check legacy connection history, broad grants, inherited policies and default memberships.
- Use distinct shared and customer projects. Check operation Bot identity, linked Bot lookup, conditional writes with `_project`, profile installation, and isolation from an exported foreign Basic. Reinstall without duplicate records.
- Complete Workspace Internal consent with both Calendar scopes. Test real watch callbacks, renewal, replay rejection, missed notifications and scheduled catch-up.
- Test timed Busy events, recurrence exceptions, cancellations, declined invitations, all-day/free exclusions and a newly added Schedule. Verify actual booking availability after creation, update, removal and disconnect.
- Test outbound create/update/removal, reassignment, a missed cancellation, native block deletion, and historical detail scrubs. No patient attendees should remain on migrated mirrors.
- Probe cancelled Google tombstones with and without properties. Restoration must require an ownership receipt and ETag. A crash after Google insertion but before receipt storage may require manual repair if the event is deleted before retry; do not infer ownership.
- Test dry-run and applied legacy migration, unreadable/deleted sources, partial disconnect, credential revocation, retained stale blocks, and explicit forgetting of revoked access. Use isolated accounts/grants for revocation and cleanup tests.
- Verify caller-filtered conflicts and customer notification deduplication, including stale conflict retention and permission failures.
- Measure large paginated calendars, quota backoff, concurrent deliveries and continuation near the eight-minute budget. Record limits rather than extrapolating from a small calendar.

A public draft may identify these as unfinished. Production release requires passing the agreed Workspace/linked-project scenarios. The example's directory and profile canonical namespace remain subject to maintainer review.
