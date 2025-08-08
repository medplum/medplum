---
title: HealthGorilla Integration Changelog
sidebar_label: Changelog
sidebar_position: 99
---

# HealthGorilla Integration Changelog

This page tracks updates, improvements, and changes to the HealthGorilla integration in Medplum.

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

<!-- Add new entries below as changes are made -->
