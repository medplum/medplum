# Medications

Representing medications in FHIR supports many common scenarios and can be used in concert with [Bots](/docs/bots/) to enable complex medication-related workflows. A common first step is constructing a [MedicationRequest](/docs/api/fhir/resources/medicationrequest.mdx) FHIR resource. Adherence to the spec, referring to other relevant FHIR resources, and tagging the resource with RxNorm or CPT codes can be useful here to aid in integration, analytics and billing.

Appropriate use of FHIR resources can be used to represent prescriptions, prescription requests, medication dispense events, prior authorizations and allergies. To get started, we recommend reading the [MedicationRequest](/docs/api/fhir/resources/medicationrequest.mdx) and [Medication](/docs/api/fhir/resources/medication.mdx) resource pages.

`MedicationRequest` resources tagged with the appropriate medication code (e.g. RxNorm) can be linked to [subscriptions](/docs/subscriptions/index.md) and [bots](/docs/bots/) to automatically send a prescription to an eRx provider.
