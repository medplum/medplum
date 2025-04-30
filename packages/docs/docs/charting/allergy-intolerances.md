# Representing Allergies

Allergies are recorded via [`AllergyIntolerance`](/docs/api/fhir/resources/allergyintolerance). Some relevant fields are described below: 

| Element                    | Description                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `clinicalStatus`           | The status of the allergy. Allergies may become inactive or re-activate over time.                     |
| `verificationStatus`       | Whether the allergy has been confirmed by the clinician.                                               |
| `category`                 | Whether the allergy is food, medication, environmental, or biologic.                                   |
| `code`                     | The code, along with the code system. In the US, this is commonly RxNorm (medications) or SNOMED (food + environment).                              |
| `patient`                  | Patient who has this allergy.                                                                          |
| `encounter`                | The Encounter where this allergy was discussed.                                                        |
| `recorder`                 | Who documented this allergy.                                                                             |
| `asserter`                 | Who reported this allergy (i.e. patient, parent, clinician after reviewing allergy tests, etc.)        |


## Recording Allergy Statuses

There are three important scenarios to record properly: 

1. Known allergies: Document specific allergies. 

2. No known allergies: Explicitly document when a patient confirms they have no allergies. 

3. Unknown allergy status: Document and flag to providers that allergy status should be collected. 

### Considering Clinical Relevance 

When recording allergy status, it is important to understand the clinical relevance of the allergy status. No known allergy status, or unknown allergy status, should only be documented when that information is directly clinically relevant. It is also important to properly distinguish between unknown allergy status (no recorded allergies for the patient, perhaps because no one had asked), and the patient having confirmed that they have no allergies. A few example scenarios are modeled below. 

### Example Allergy Status Documentation Scenarios

1. It is unknown but clinically relevant if a patient has a specific allergy. 

It is important to record allergies that clinicians should ask about, and do not currently know the status of. For example, if a patient is being prescribed medication that contains egg protein, and it is unknown if the patient is allergic to egg protein, it should be recorded as below. The `verificationStatus` would indicate to a clinician that they should ask about their status. If the patient confirms they do not have an allergy, the `verificationStatus` can be set to `refuted`. If the patient says they do have an allergy, it can be recorded with `verificationStatus=confirmed` and `clinicalStatus=active`. 

```js
{
  resourceType: 'AllergyIntolerance',
  subject: {
    reference: 'Patient/homer-simpson',
  },
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/snomed',
        code: '213020009',
        display: "Allergy to egg protein",
      },
    ],
  },
  verificationStatus: {
    coding: [
      {
        system: 'http://hl7.org/fhir/ValueSet/condition-ver-status',
        code: 'unconfirmed',
        display: 'Unconfirmed',
      },
    ],
  },
};
```

2. Patient has confirmed that they have no drug allergies. 

If the patient confirms they have no known allergies, either any allergies in general or no allergies of a specific type, it can be recorded using one of the [SNOMED no known allergy codes](https://bioportal.bioontology.org/ontologies/SNOMEDCT?p=classes&conceptid=http%3A%2F%2Fpurl.bioontology.org%2Fontology%2FSNOMEDCT%2F716186003). Note that if the assertion is confirmed via allergy test or parent, for example, the asserter would then be a `Practitioner` or a `Related Person`, respectively. The example below is specifically for when the patient self-reports that they do not have any drug allergies. 

```js
{
  resourceType: 'AllergyIntolerance',
  subject: {
    reference: 'Patient/homer-simpson',
  },
  code: {
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/snomed',
        code: '409137002',
        display: "No known drug allergy",
      },
    ],
  },
  clinicalStatus: {
    coding: [
      {
        system: 'http://hl7.org/fhir/ValueSet/condition-clinical',
        code: 'active',
        display: 'Active',
      },
    ],
  },
  verificationStatus: {
    coding: [
      {
        system: 'http://hl7.org/fhir/ValueSet/condition-ver-status',
        code: 'confirmed',
        display: 'Confirmed',
      },
    ],
  },
  asserter : {
    reference : 'Patient/homer-simpson',
  },
};
```

3. Allergy status is not relevant to patient care. 

For scenarios in which the allergy status is not relevant, it is best practice not to create an AllergyIntolerance resource in order to avoid adding unnecessary and, if improperly documented, inaccurate information. For example, if treating a sprained wrist with a brace and no medication, it is not necessary to add an AllergyIntolerance. However, it is possible that a provider may be prompted to add an AllergyIntolerance as part of a generic care workflow. The provider might then select 'No known allergy' since it is not relevant to care, which could cause future clinicians to believe that the patient has no allergies, when that might not be the case. In summary, avoiding documentation of allergy status when not clinically relevant prevents the propagation of potentially misleading information that could impact future care decisions.
