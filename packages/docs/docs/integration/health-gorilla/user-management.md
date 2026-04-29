# User Management

This guide describes how to sync practitioners and patients between Medplum and Health Gorilla.

## Practitioner Sync Flow

The `sync-practitioner` bot is responsible for syncing practitioner data between Medplum and Health Gorilla. Health Gorilla tracks enrollment based on the presence of a `PractitionerRole` against the tenant.

The basic process is:

1.  **Read NPI**: The integration reads the NPI number from the Practitioner in Medplum.
2.  **Check and Enroll**: It checks if the practitioner is already enrolled in your Health Gorilla tenant. If not, it searches the Health Gorilla NPI registry and automatically enrolls them as a clinical user.
3.  **Sync Identifiers**: The Health Gorilla ID and login details are saved back to the Medplum `Practitioner`.
4.  **Sync Telecom**: The practitioner's email address in Medplum is synced to Health Gorilla.

### Name Matching and Validation

When enrolling a new practitioner, Health Gorilla requires the name to match the NPI registry. The sync bot performs the following validation:

*   It searches Health Gorilla by NPI to find the existing record.
*   It compares the name in Medplum against the name found in Health Gorilla.
*   **Family Name**: Must match exactly (case-insensitive, ignoring leading/trailing whitespace). Suffixes or titles (like "DNP, MSN, APRN") should not be included in the family name unless they are part of the legal name in the NPI registry.
*   **Given Name**: The first given name in Health Gorilla (`name.given[0]`) must match either the entire given name string in Medplum, or any individual word within Medplum's given names (case-insensitive). This gracefully handles common variations in middle names and spacing.

If a practitioner has multiple names (e.g., a maiden name), you can add multiple names to the Medplum `Practitioner` resource and set the `use` field appropriately. The bot will check against all names provided in Medplum to find a match with Health Gorilla.

### Email Sync and Precedence

**Health Gorilla considers emails to be globally unique across all tenants.** Therefore, adding an email address that is already shared by another Health Gorilla Practitioner will fail.

The sync bot handles this by:

1.  Filtering all telecom entries on the Medplum `Practitioner` where `system` is `email`.
2.  Sorting them by the `rank` field (lower rank values are more preferred).
3.  Attempting to sync each email to Health Gorilla in order of precedence until one succeeds.

This allows you to provide an email alias as a fallback. For example:
*   `doctor.smith@example.com` (rank 0)
*   `doctor.smith+alias@example.com` (rank 1)

If the first email is already in use in Health Gorilla, the bot will automatically fall back to the second email.