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

In healthcare, there is a distinction between unknown allergy status (no recorded allergies for the patient, perhaps because no one had asked), and the patient having confirmed that they have no allergies. 

In the case where the patient has confirmed that they have no allergies, the below example can be used. Please note that there are several [SNOMED no known allergy codes](https://bioportal.bioontology.org/ontologies/SNOMEDCT?p=classes&conceptid=http%3A%2F%2Fpurl.bioontology.org%2Fontology%2FSNOMEDCT%2F716186003) to distinguish between drug, food, animal, and other allergy categories. 

Example `AllergyIntolerance`: 

```json
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
};
```

In the case where the allergy status is unknown, there are two cases; one where allergies status should be asked because it may be relevant to clinical decisions, and one where allergies might not be relevant to clinical decision-making. If the latter is the case, such as when treating a broken wrist without prescribing medications, then do not create an `AllergyIntolerance`.  

If allergies are relevant to the clinical context, creating an `AllergyIntolerance`, without any codes and the `verificationStatus=unconfirmed` can help indicate that someone reading the chart (i.e. nurse) should ask about the patient's allergies. 

```json
{
  resourceType: 'AllergyIntolerance',
  subject: {
    reference: 'Patient/homer-simpson',
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
