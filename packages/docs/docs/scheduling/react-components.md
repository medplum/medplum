---
title: React Scheduling Components
---

# React Scheduling Components

Use `@medplum/react-scheduling` to embed scheduling and configuration interfaces in an application built with `@medplum/react`. The package is [Alpha](/docs/compliance/alpha-beta) and subject to breaking changes. Its scheduling operations are Beta. You can use complete workspaces, individual React components, or your own UI using only the scheduling backend. Start with the [Scheduling Decision Guide](/docs/decision-guides/scheduling) for workflow planning. This page describes component behavior and integration details; [Storybook](https://storybook.medplum.com/) lets you explore the interfaces.

## Available Components

Adopt booking and configuration independently. For example, use `SchedulingConfigWorkspace` for staff administration while composing a patient booking screen from individual components or building it directly on the scheduling APIs.

| Component | What it handles | What the host supplies |
| :--- | :--- | :--- |
| `SchedulingWorkspace` | Fetches calendars and appointments; books visits, including weekly series; blocks time; shows details; confirms, cancels, and reschedules appointments. | Authentication, access policies, business rules, and integrations. Optional callbacks report completed writes. |
| `SchedulingConfigWorkspace` | Fetches and edits visit types, providers, rooms, devices, their Schedules, service offerings, parameters, and weekly hours. | Access to the administration route and permissions to read and write the relevant resources. It has no required props. |
| `AppointmentBookingForm` | Searches and captures details, then calls `$book` in its standard flow. | An `onBooked` callback to receive the completed booking. |
| `AppointmentProposalForm` | Searches and captures an appointment proposal without writing the booking itself. | An `onSubmit` handler to perform the intended write, such as a controlled booking workflow or `$hold`. |
| `AppointmentRescheduleForm` | Loads an existing appointment's booking configuration and moves it through `$reschedule` in its standard flow. | The appointment and an `onRescheduled` callback. See the separate facility write below. |
| `Calendar` / `MultiCalendar` | Render calendar views. | The data and interactions required by the host's interface. |
| `ScheduleAvailabilityEditor` | Edits a service's default weekly hours or a Schedule's override for that service. | The service, optionally the Schedule, and an `onSave` handler that persists the changed resource. |

These are public exports from the [package entry point](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/index.ts). Access the appointment details pane, blocked-time forms, and visit-type/actor configuration pages through the workspaces. These features and the parameter editor are internal components.

## Embed the Workspaces

Mount components inside the application's existing `MedplumProvider` and `MantineProvider`, with an authenticated Medplum client. Import the scheduling stylesheet alongside the application's existing styles. See [React](/docs/react) for application setup.

```tsx
import { SchedulingConfigWorkspace, SchedulingWorkspace } from '@medplum/react-scheduling';
import '@medplum/react-scheduling/styles.css';

// Render these on the appropriate routes inside the application's providers.
export function SchedulingPage() {
  return <SchedulingWorkspace />;
}

export function SchedulingConfigurationPage() {
  return <SchedulingConfigWorkspace />;
}
```

The workspaces use the signed-in user's Medplum client. Enforce access to their underlying FHIR resources through [AccessPolicy and ProjectMembership](/docs/access/access-policies), including resources used by hidden routes.

### Submission and Callbacks

`AppointmentBookingForm` performs the booking before calling `onBooked`. `SchedulingWorkspace` also exposes callbacks such as `onConfirmed`, `onCancelled`, `onRescheduled`, `onUpdated`, and `onBlocked` after the corresponding writes. Use these for refreshing host views and reporting outcomes. The writes are already committed when these callbacks run, including when a callback throws an error.

When booking requires checks before it commits, use `AppointmentProposalForm.onSubmit` to call the application's controlled booking path. That path must revalidate eligibility and use the appropriate scheduling operation. The built-in booking flow calls `$book`; a hold-based approval flow requires your handler to call `$hold` explicitly. Complete required approval or prior-authorization checks before allowing confirmation. The details pane's Confirm button calls `$confirm` directly for a pending appointment.

### Manual Booking and Rescheduling

`canBypassSchedulingRules` exposes manual booking and rescheduling through FHIR writes that skip the scheduling operations' availability checks. FHIR access policies still apply. Authorize these rule exceptions through the application's controlled workflow.

- **Manual booking:** Submits the Appointment and its Slots in a transaction Bundle. Without the project's `transaction-bundles` feature, the server applies it as a batch: successful Slot writes can remain as blocked time if the Appointment fails to save. Enable the feature for an all-or-none booking. See [Batches vs. Transactions](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions).

- **Manual rescheduling:** Uses separate FHIR writes, including on projects with the transaction feature: create new Slots, conditionally update the Appointment, then delete the old Slots. If creation or the update fails, it attempts to delete the new Slots. Cleanup is best effort; failed deletions are logged and can leave new or old Slots blocking time without a visit. Inspect the Appointment and Slot records before retrying or removing unused Slots.

Both manual paths add an Appointment extension with `valueBoolean: true`: `SchedulingUnvalidatedBookingURI` from `@medplum/core` for booking, and [`SchedulingUnvalidatedReschedule`](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/AppointmentFinder/writeElevatedReschedule.ts) for rescheduling. These markers identify writes that skipped scheduling checks; the chosen time may still satisfy the rules. A successful `$reschedule` replaces the reschedule marker but preserves the original booking marker.

## Configuration Ownership

The configuration workspace edits `HealthcareService` defaults and each actor's `Schedule` offerings and per-service overrides. An actor can offer or stop offering visit types, and a visit-type page links to the actors offering it. Stopping an offering removes that service's Schedule overrides; existing Appointments retain their stored details. Hours use the inheritance rules in [Defining Availability](/docs/scheduling/defining-availability).

| Record | Configuration behavior |
| :--- | :--- |
| Visit type | Edits name, active status, service facilities, booking requirements, scheduling parameters, and default weekly hours. |
| Provider created by the workspace | Creates a Practitioner without an NPI and marks ownership with the `https://medplum.com/fhir/scheduling-config-provider` identifier system. Its name and active status remain editable here. |
| Other provider | Displays name, NPIs, and Practitioner status read-only. Its Schedule can still be paused without deactivating the Practitioner. |
| Room | Creates a Location with room physical type. Edits its name, status, parent service facility, timezone, and scheduling configuration. |
| Device | Creates a Device. Once created, its name is read-only here; status, service facility, timezone, and scheduling configuration remain editable. |
| Provider facility assignment | Creates its own PractitionerRole when facility assignments are not already supplied by other active roles. It is identified by `https://medplum.com/fhir/scheduling-service-facility-role` with the provider ID as its value. New roles store facility Locations without setting `organization` or `healthcareService`. Other active roles contribute locked facility references and are left unchanged. |

Organization-filtered directory searches return roles carrying that organization reference. Include workspace-owned roles with `organization` unset when collecting all of a provider's facility assignments. Removing the last facility from the workspace-owned role deactivates that role.

Turning off an actor in the workspace also turns off its Schedule. Turning off only the Schedule pauses booking while preserving the actor's status for other uses. The server checks Schedule and HealthcareService activity in scheduling operations; the React selectors additionally filter inactive actors.

Configuration saves submit changed resources in one transaction Bundle, with version conditions on updates. Without the project's `transaction-bundles` feature, entries execute independently and a save can partially succeed. The actor configuration page shows the first failure. Inspect all affected resources and reload the latest state before retrying to account for any successful writes. Enable the feature for all-or-none saves. See [Batches vs. Transactions](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions).

## Booking Requirements

The configuration workspace records these codes in `HealthcareService.eligibility.code.coding`, using `SCHEDULING_ELIGIBILITY_SYSTEM` from `@medplum/core`. `getSchedulingRequirements(service)` reads them.

| Requirement code | What the React booking form requires | Where it records the answer |
| :--- | :--- | :--- |
| `requires-procedure` | At least one procedure code. | Additional `Appointment.serviceType` concepts, alongside the HealthcareService reference. |
| `requires-diagnosis` | At least one diagnosis code. | `Appointment.reasonCode`. |
| `requires-medical-necessity` | A checked medical-necessity attestation. | An Appointment extension with `SchedulingMedicalNecessityURI` and `valueBoolean: true`. |

Use the corresponding `REQUIRES_PROCEDURE_CODE`, `REQUIRES_DIAGNOSIS_CODE`, and `REQUIRES_MEDICAL_NECESSITY_CODE` constants from `@medplum/core` when configuring these requirements in code. The procedure and diagnosis fields default to the CPT and ICD-10-CM value sets; hosts can supply `procedureBinding` and `diagnosisBinding` to use different value sets.

The React forms check that the required codes and attestations have been captured. The scheduling operations leave eligibility, prior authorization, and medical-necessity checks to the application. Enforce requirements that must apply to every booking or confirmation in the application's controlled write path, including bookings made through other interfaces or API clients.

The details editor uses ordinary Appointment updates to save notes and requirement fields that the visit type currently asks for. It preserves the referenced visit type while changing procedure concepts, and leaves the Patient participant, appointment time, and Slots unchanged. Use the reschedule workflow to move an appointment.

Source: [core constants and reader](https://github.com/medplum/medplum/blob/main/packages/core/src/scheduling.ts), [React validation](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/AppointmentFinder/AppointmentFinder.requirements.ts), and [booking validation and writes](https://github.com/medplum/medplum/blob/main/packages/server/src/fhir/operations/utils/scheduling.ts).

## Service Facility References

See [Organizations and Locations](/docs/administration/locations-and-facilities) for the shared model across scheduling, encounters, and billing. This section describes the React components' current selection and matching behavior.

The React scheduling interface calls the place a visit is booked at a **service facility**, represented by a Location. To reserve a room, give its Location a Schedule. The current facility selectors exclude room and bed physical types with `physical-type:not=ro,bd`; booking selectors also exclude `status=inactive`. Missing physical type and status values pass their respective filters. Ensure the candidates you offer represent appropriate service facilities for your workflow.

| Association | Field | React matching behavior |
| :--- | :--- | :--- |
| Visit type offered at a facility | `HealthcareService.location` | Exact facility reference. An empty list leaves the service available at every facility. |
| Provider assigned to a facility | `PractitionerRole.location` on active roles | Exact facility reference across the provider's roles. No location references leaves the provider available at every facility. |
| Room within a facility | `Location.partOf` | Walks a bounded Location ancestry chain from the room. |
| Device located at a facility | `Device.location` | Walks the referenced Location's bounded ancestry chain. |
| Facility recorded on a visit | `Appointment.supportingInformation` | A Location reference marked with `SchedulingSiteURI`. Use `toAppointmentSiteReference` and `getAppointmentSite` from `@medplum/core`. |

The configuration workspace confirms changes between an empty facility list and an explicit list on existing visit types and providers, because these changes broaden or narrow selection. Configuration pickers include inactive facilities so records can be prepared before a facility goes live.

The appointment's marked facility reference identifies its service setting. Reserve room capacity by including the room's Schedule in search and booking. Manage closures through the affected Schedules and patient access through AccessPolicy. When a submission requires a facility, set `Claim.facility` to the Location appropriate for its submission model, which may be the booked facility or another level of the hierarchy. See the [RCM & Billing Decision Guide](/docs/decision-guides/rcm-billing), [Candid service facility mapping](/docs/integration/candid/claim-submission#location-service-facility), and [Stedi service facility mapping](/docs/integration/stedi/claim-submission/professional-claims#service-facility).

### Facility Filtering and Licensure

The provider facility filter compares exact Location references across all active roles, regardless of their `healthcareService` or whether they describe clinic assignments or licensed jurisdictions. Matching a clinic requires that clinic's reference; a state Location is a different reference even when the clinic is within it. Account for this comparison when combining the workspace with the [service-and-jurisdiction model](/docs/scheduling/state-by-state-licensure).

The selectors are permissive when associations are unknown: unreadable provider roles leave those providers on offer, and a device without `Device.location` remains selectable. Unreadable Location records or ancestry beyond the traversal limit can also leave candidates on offer. A readable room whose ancestry ends without the selected facility is excluded. Users can change or clear `defaultServiceFacility`. Apply required facility and licensure checks in the controlled booking path and data access rules in AccessPolicy.

Source: [facility search criteria](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/constants.ts), [service matching](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/AppointmentFinder/AppointmentServiceSelect.utils.ts), [actor matching](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/AppointmentFinder/AppointmentFinder.schedules.ts), and [provider-role writes](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/SchedulingConfigWorkspace/ActorPage/roleDraft.ts).

## Blocked Time

The workspace's Block Time action writes only Slot records: one `busy-unavailable` Slot per selected Schedule. These blocks omit `serviceType` and apply to all services on those Schedules. Existing appointments remain unchanged.

The multi-calendar action submits one Slot per selected Schedule in a transaction Bundle. Without the project's `transaction-bundles` feature, some calendars can be blocked while others fail. Enable the feature to write all the blocks or none. See [Batches vs. Transactions](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions).

After a partial save, the form reports how many calendars were blocked and disables immediate resubmission. To recover:

1. Inspect the calendars to identify which ones were missed.
2. Select only the missed calendars. Changing the selection re-enables the form.
3. Submit again to block those calendars without duplicating the successful writes.

A saved block can be edited or deleted individually. The details pane disables those actions until it verifies that no Appointment holds the Slot. Appointment-owned Slots, including buffers, must be moved or released through the appointment workflow.

When a service facility or visit-type calendar filter is active, the workspace hides standalone blocked-time Slots. They still affect availability. Clear those filters to inspect the blocks.

## Appointment Changes

The workspace details pane offers confirmation for pending appointments and cancellation or rescheduling for eligible booked or pending appointments. It shows appointments read-only once 12 hours have elapsed after `end`, falling back to `start` if `end` is missing. This edit window applies within the workspace, and an already-open edit or reschedule view can still finish. Applications requiring a correction deadline must enforce it in their controlled write path.

The standard reschedule form calls `$reschedule` for the time and Schedules. The server preserves `supportingInformation`, so the form saves a changed service facility separately, before the operation. If that save succeeds but `$reschedule` fails, the facility change can remain while the original time and Slots are retained. Handle this partial success in your recovery workflow when moving appointments between facilities.

Set an Appointment extension with `SchedulingExternalUrlURI` and `valueUrl` to link to the same appointment in an external system. The details pane displays the link only when it is a valid HTTPS URL. Synchronizing appointment data requires an integration workflow.

Source: [details pane](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/SchedulingWorkspace/AppointmentDetails/AppointmentDetails.tsx), [edit window](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/SchedulingWorkspace/SchedulingWorkspace.utils.ts), [reschedule form](https://github.com/medplum/medplum/blob/main/packages/react-scheduling/src/AppointmentFinder/AppointmentRescheduleForm.tsx), and [server reschedule operation](https://github.com/medplum/medplum/blob/main/packages/server/src/fhir/operations/reschedule.ts).
