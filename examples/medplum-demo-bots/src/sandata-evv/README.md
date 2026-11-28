# Sandata EVV and Medplum

Many U.S. states collect [Electronic Visit Verification (EVV)](https://www.medicaid.gov/medicaid/home-community-based-services/guidance/electronic-visit-verification-evv) data for Medicaid home care through an aggregator run by [Sandata](https://www.sandata.com/). Agencies that use their own EVV system send visits to the aggregator through Sandata's alternate EVV REST interface.

This example submits visits recorded with the [Medplum home care visit model](https://www.medplum.com/docs/scheduling/home-care-visits) to that interface. It is a starting point, not a certified integration: each state requires vendors to pass testing with Sandata before sending production data.

## Files

- `submit-visit-to-sandata.ts`: the Bot. The comment at the top explains the flow, SequenceID, VisitChanges, and every assumption the example makes. Start there.
- `sandata-evv.ts`: maps FHIR resources to Sandata's employee, client, and visit records.
- `sandata-api.ts`: sends records to Sandata and checks their status.
- `submit-visit-to-sandata.test.ts`: tests against a fake Sandata API.

## How FHIR Maps to Sandata

| Sandata                                               | FHIR                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ProviderID`                                          | `Encounter.serviceProvider` → `Organization.identifier`                                              |
| Employee record, `EmployeeIdentifier`                 | `Encounter.participant[0].individual` → `Practitioner` and its `identifier`                          |
| Client record, `ClientIdentifier`                     | `Encounter.subject` → `Patient`, its `identifier` and home `address`                                 |
| `VisitOtherID`                                        | `Encounter.id` (dashes removed)                                                                      |
| `PayerID`, `PayerProgram`, `ProcedureCode`, modifiers | `Encounter.type`, through the `services` configuration                                               |
| `Calls` (Time In and Time Out)                        | Clock-in and clock-out `Location`s in `Encounter.location`; times from `Encounter.location[].period` |
| `CallType`                                            | `Mobile` if the Location has a `position`, otherwise `Manual`                                        |
| `AdjInDateTime`, `AdjOutDateTime`                     | `Encounter.period`, when it differs from the captured clock times                                    |
| `VisitChanges`                                        | `Provenance` resources targeting the Encounter, with the state reason code in `reason`               |
| `Tasks`                                               | Completed `Task`s with `encounter` pointing at the Encounter, through the `taskIds` configuration    |
| `BillVisit`                                           | `false` when the Encounter is `cancelled` or `entered-in-error`                                      |

The submission outcome is kept on a `Task` with code `sandata-evv-submission` whose `focus` is the Encounter. Its `businessStatus` is `accepted`, `invalid` (the visit is missing data and wasn't sent), `{type}-rejected`, or `awaiting-{type}-status`; `statusReason` holds the errors, and `output` holds Sandata's transaction UUIDs.

## Configuring for Your State

The specification this example follows is an amalgamation of Sandata's published specifications for Indiana, Connecticut, and Rhode Island. They share the transport, record structure, and processing rules, but differ in how they identify agencies, patients, and caregivers:

| Setting                                    | Indiana / Connecticut DSS (sample)  | Rhode Island                                    | Connecticut DDS               |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------------- | ----------------------------- |
| `ProviderQualifier` / `ProviderID`         | `MedicaidID` / Medicaid provider ID | `Other` / NPI                                   | `Other` / DDS provider ID     |
| `ClientQualifier` / `ClientIdentifier`     | `ClientMedicaidID` / Medicaid ID    | `ClientOtherID` / 10-digit Medicaid ID          | `ClientCustomID` / DDS number |
| `EmployeeQualifier` / `EmployeeIdentifier` | `EmployeeCustomID`                  | `EmployeeSSN`, masked as `0000` + last 5 digits | `EmployeeSSN`, masked         |

Set these, along with the timezone, payer and program codes, procedure codes, task IDs, and reason codes, in `EXAMPLE_CONFIG` in `submit-visit-to-sandata.ts`. Your state's specification is the source of truth; some states require fields this example doesn't send.

## Deploying

1. Create the Bot and add its secrets: `SANDATA_BASE_URL` (for example `https://uat-api.sandata.com/interfaces/intake`), `SANDATA_USERNAME`, `SANDATA_PASSWORD`, and `SANDATA_ACCOUNT`. Sandata issues these when an agency registers you as its EVV vendor.
2. Subscribe the Bot to finished home care visits:

   ```json
   {
     "resourceType": "Subscription",
     "status": "active",
     "reason": "Submit visits to Sandata",
     "criteria": "Encounter?class=HH&status=finished,cancelled,entered-in-error",
     "channel": { "type": "rest-hook", "endpoint": "Bot/YOUR_BOT_ID" }
   }
   ```

3. Test against Sandata's UAT environment before switching `SANDATA_BASE_URL` to production.
