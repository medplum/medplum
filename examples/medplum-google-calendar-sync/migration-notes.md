# Changes from the previous integration

- Refresh tokens move from the connection Basic to a restricted credential Basic. Connection IDs and imported-Slot identifiers remain stable. Reinstall migrates credentials under a version-guarded lease. Remove broader connection writes and legacy history/vread permissions before giving practitioners access.
- Status is read-only. Use the new settings operation for detail changes. Range sync now returns a queue acknowledgement; read status for completion. Update callers with deployment of the new OperationDefinitions.
- Install creates restricted memberships for connect, settings, disconnect and range requests. These Bots run as themselves and reject caller fallback. Status and install still run as their authenticated callers.
- Settings become project-qualified without changing resource IDs. Customer-state lookups explicitly select the authenticated project.
- Profiles are installed for the five integration resource shapes. No project-wide default Slot profile is set.
- Verified Google ownership is recorded in one receipt Basic per event/source/account identity. Existing stripped tombstones without a receipt still require repair. Legacy mirrors have a dry-run-first migration that strips attendees and excess details.
- The public example includes setup, local tests and build configuration. Deployment remains a separate explicit command.

These changes do not alter scheduling authority: Google maintains only imported Slots, and Medplum owns Appointments and native blocks. Both directions remain in release scope.
