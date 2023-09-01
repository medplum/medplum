# Linking Patient Records in FHIR

**The FHIR [Patient](/docs/api/fhir/resources) has features to represent the link between source and master records.**

The `Patient.active` element is used to indicate the master record for the patient. When there are multiple `Patient` resources per-patient in the target system, all but the master record should be marked as "inactive."

The `Patient.link` element is used to connect duplicate patient records via reference.

- For each source record

  - `Patient.link.other` references the master record
  - `Patient.link.type` takes the value `"replaced-by"`

- For the master record
  - `Patient.link.other` references each source record
  - `Patient.link.type` takes the value `"replaces"`
