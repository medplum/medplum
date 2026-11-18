Refer to the following profiles for information on representing specific details:

- [US Core Patient profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-patient.html).
- [US Core Gender Identity Extension](http://hl7.org/fhir/us/core/StructureDefinition-us-core-genderIdentity.html).
- [US Core Birth Sex Extension](http://hl7.org/fhir/us/core/StructureDefinition-us-core-birthsex.html).

## Usage

This Resource covers data about patients and animals involved in a wide range of health-related activities, including:

- Curative activities
- Psychiatric care
- Social services
- Pregnancy care
- Nursing and assisted living
- Dietary services
- Tracking of personal health and exercise data

The data in the Resource covers the "who" information about the patient: its attributes are focused on the demographic information necessary to support the administrative, financial and logistic procedures. A [Patient](/docs/api/fhir/resources/patient) record is generally created and maintained by each organization providing care for a patient. A patient or animal receiving care at multiple organizations may therefore have its information present in multiple [Patient](/docs/api/fhir/resources/patient) Resources.

Not all concepts are included within the base resource (such as race, ethnicity, organ donor status, nationality, etc.), but may be found in [profiles](https://www.hl7.org/fhir/patient-profiles.html) defined for specific jurisdictions (e.g., US Meaningful Use Program) or [standard extensions](https://www.hl7.org/fhir/patient-extensions.html). Such fields vary widely between jurisdictions and often have different names and valuesets for the similar concepts, but they are not similar enough to be able to map and exchange.
