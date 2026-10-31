# Changes from the previous integration

- Refresh tokens move from the connection Basic to a restricted credential Basic. Connection IDs and imported-Slot identifiers remain stable. Reinstall migrates credentials under a version-guarded lease. Stop workers and remove all caller access to private connection/credential/receipt resources before upgrading, including legacy history/vread permissions. Install then grant callers the new public-status code. A separate summary replaces direct connection reads. Historical token versions still exist: rotate previously exposed grants before production use; deleting the latest field does not revoke them.
- Status is read-only. Use the new settings operation for detail changes. Range sync now returns a queue acknowledgement; read status for completion. Update callers with deployment of the new OperationDefinitions.
- Install creates restricted memberships for connect, settings, disconnect and range requests. These Bots run as themselves and reject caller fallback. Status and install still run as their authenticated callers.
- Settings become project-qualified without changing resource IDs. Customer-state lookups explicitly select the authenticated project.
- Profiles are installed for the six integration resource shapes, including the allowlisted public status summary. No project-wide default Slot profile is set.
- Verified Google ownership is recorded in one receipt Basic per event/source/account identity. Receipts survive disconnect and support account-bound reconnects. Existing stripped tombstones without proof still require repair; pre-upgrade mirrors should be migrated while access remains available. Legacy mirrors have a dry-run-first migration that strips attendees and excess details.
- The public example includes setup, local tests and build configuration. Deployment remains a separate explicit command.

These changes do not alter scheduling authority: Google maintains only imported Slots, and Medplum owns Appointments and native blocks. Both directions remain in release scope.

The example uses the repository root lockfile and examples pipeline. There is no separate example lockfile or installation workflow. The credential profile and token extension remain draft until the encrypted-storage migration has a verified contract.
