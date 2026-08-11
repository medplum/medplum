---
title: HealthGorilla Integration Changelog
sidebar_label: Changelog
sidebar_position: 99
---

# HealthGorilla Integration Changelog

This page tracks updates, improvements, and changes to the HealthGorilla integration in Medplum.

## [August 2026]

- Order Update Reliability: Fixed `If-Match` version conflicts in `send-to-health-gorilla` when stamping requisition and identifiers after submit. AOE `QuestionnaireResponse` entries are now included in the optimistic locking version list, and conflicted PATCH entries are retried without re-sending already applied updates.

## [July 2026]

- Installation Hardening: Improved Health Gorilla install and tenant-creation scripts, including clearer organization upsert flows and install documentation.

## [June 2026]

- Practice-Level Lab Account Numbers: `send-to-health-gorilla` now resolves organization/practice-level lab account numbers (AN) from the Practitioner lab-org-account extension when building orders.

## [May 2026]

- Order Splitting Extension: When Health Gorilla requires order splitting, `send-to-health-gorilla` copies the `operationoutcome-order-splitting` extension onto the lab-order `ServiceRequest` while setting status to `on-hold`. The `split-order` bot behavior is unchanged and still accepts groups via `Parameters`.
- Installation Tooling: Added organization upsert support and clarified shared-project vs legacy per-customer bot deploy flows.

## [April 2026]

- Security Enhancement: Removed email sync to Health Gorilla in the `sync-practitioner` bot to prevent self-service password reset attacks.
- Shared Project Deployment: Health Gorilla bots and OperationDefinitions can now be deployed from a shared Medplum project, streamlining customer installations.
- Subscription Management: The integration now automatically recreates Health Gorilla subscriptions when the webhook URL becomes stale.
- Physician-Level Lab Account Numbers: `sync-practitioner` now syncs physician-level lab account numbers (AN identifiers) to Health Gorilla `PractitionerRole` resources.
- Practice Location Assignment: Practitioners can be enrolled into specific Health Gorilla practice locations at creation time.

## [March 2026]

- OAuth Token Caching: Improved the Health Gorilla OAuth integration by caching the access token across bot invocations, reducing frequent token requests.
- Order Sync Reliability: Refactored the `send-to-health-gorilla` bot to always read the latest `ServiceRequest` to prevent syncing outdated orders.
- Async Batch Upload: Switched to asynchronous batch uploads for Health Gorilla organization resources during sync to mitigate rate-limiting issues.
- Identifier Merging: Enhanced organization syncing to preserve existing payor identifiers when syncing the Health Gorilla ID back to the Medplum organization.
- Address Syncing: The `send-to-health-gorilla` bot now includes default address fields if none exist, ensuring full address structure is sent.

## [February 2026]

- Resource Sync Logic: Enhanced the `receive-from-health-gorilla` bot to use safe update operations for modifying the status and supporting info of lab orders, ensuring data integrity.

## [October 2025]

- Atomic ServiceRequest Updates: Switched to batched PATCH operations to sync HealthGorilla order identifiers, preventing race conditions.
- Syncing Order Identifiers: `send-to-health-gorilla` syncs all identifiers from Health Gorilla `RequestGroups`, including the lab accession id

## [September 2025]

- Enhanced Practitioner Name Matching: Improved logic to ignore middle names and handle name variations more flexibly.
- Delayed DetectedIssue Creation: Separated `DetectedIssue` creation from main bundle processing to prevent race conditions in downstream workflows.

## [Aug 2025]

- Preserve ServiceRequest Identifiers: Switched from `PUT` to `PATCH` for `ServiceRequest` sync to prevent asynchronously-set identifiers from being overwritten.
- Smarter Patient Matching for Lab Reports: `DiagnosticReport` resolution now handles multiplie `Patients` with the same Health Gorilla ID. Prioritizes `active` patients and follows `Patient.link` for inactive patients to reduce duplicates.
- Enhanced Order Matching: On receiving lab reports, the integration now finds existing orders by Health Gorilla ID, Accession ID, Placer ID, or Filler ID to link to the correct patient.

## [June 2025]

1. Added securityContext to Binary resources. Resources containing content are written before Binary resources are attached.
2. Improved search for existing Organizations.
3. Refactor of HG Bot deployment script.

## [March 2025]

1. Generate unique Health Gorilla usernames for shared practitioners across projects.
2. Performance improvement to fetching resources from Health Gorilla.
3. Added option to create Patient resource if they cannot be found when syncing resources.

## [January 2025]

1. Initial version of order splitting bot to separate tests in the same ServiceRequest into multiple orders (perhaps to be sent to different labs).
2. Allow sending orders in `on-hold` status.
3. Additional logging and error handling.

## [November 2024]

1. Improved handling of dependent insurance and payor org names.
2. Improved logging and UX through date and display fields.
3. Improved referential integrity in RequestGroup resources synced.

## [September 2024]

1. Created Detected Issues for unsolicited reports with unknown patients.
2. Improved resource sync and subscription logic.
3. Practitioner sync supports multiple names and new order of operations.

