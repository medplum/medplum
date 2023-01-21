# SMART Scopes for Access Control

SMART on FHIR’s authorization scheme uses OAuth scopes to communicate (and negotiate) access requirements. There is relevant [background information on HL7.org](http://hl7.org/fhir/smart-app-launch/STU2/scopes-and-launch-context.html).

Medplum supports the `SMART App Launch 2.0.0` [standard](https://hl7.org/fhir/smart-app-launch/).

Historically, apps developed with SMART Scopes were designed to be links, embedded in a traditional EHR. Once those links were clicked on an app would launch and authenticate the user, and request a certain FHIR resources, or grant rights like `offline_access`. Commonly, EHRs support "launching" from either a patient history screen or an encounter documentation screen. So when you see "launch" language in the documentation, hopefully that gives some context on what that means.

## Supported Scopes

Medplum supports the following scopes.

- `patient/\*.rs`
- `user/\*.cruds`
- `openid`
- `fhirUser`
- `launch`
- `launch/patient`
- `offline_access`
- `online_access`

## Understanding Scopes

Scopes grant read, write, search and update access to specific resources, here are some examples of scopes and what they grant access to.

- `scope=patient/Observation.r`: the user is allowed to read Observation resources for a specific patient
- `scope=user/Encounter.cu`: the user is allowed to write (create and update) Encounter resources
- `scope=user/\*.rs`: the user is allowed to read and search type of resource
- `scope=user/\*.cu`: the user is allowed to write (create and update) any type of resource
- `scope=[array of individual scopes]`
- `patient=123`: the user is allowed access to resources in the Patient/123 compartment.
