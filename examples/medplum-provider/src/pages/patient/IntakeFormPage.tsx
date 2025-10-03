// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { onboardPatient } from '../../utils/intake-form';

export function IntakeFormPage(): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrCreateQuestionnaire(): void {
      try {
        // First, try to find the existing questionnaire by URL
        const searchResult = await medplum.searchOne('Questionnaire', {
          url: questionnaireDefinition.url,
        });

        if (searchResult) {
          // Questionnaire exists, use it
          setQuestionnaire(searchResult);
        } else {
          // Questionnaire doesn't exist, create it
          console.log('Creating new questionnaire in Medplum...');
          const created = await medplum.createResource(questionnaireDefinition as Questionnaire);
          setQuestionnaire(created);
          showNotification({
            color: 'green',
            message: 'Questionnaire created successfully',
            autoClose: 3000,
          });
        }
      } catch (error) {
        console.error('Error loading/creating questionnaire:', error);
        showNotification({
          color: 'red',
          message: `Failed to load questionnaire: ${normalizeErrorString(error)}`,
          autoClose: false,
        });
      } finally {
        setLoading(false);
      }
    }

    loadOrCreateQuestionnaire();
  }, [medplum]);

  const handleOnSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      if (!questionnaire || !profile) {
        return;
      }
      try {
        const patient = await onboardPatient(medplum, response);
        navigate(`/Patient/${patient.id}/timeline`)?.catch(console.error);
      } catch (error) {
        showNotification({
          color: 'red',
          message: normalizeErrorString(error),
          autoClose: false,
        });
      }
    },
    [medplum, navigate, profile, questionnaire]
  );

  if (loading || !questionnaire) {
    return <Loading />;
  }

  return (
    <Document width={800}>
      <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleOnSubmit} />
    </Document>
  );
}
// Complete questionnaire with SDC template extraction
// Using 'any' type to avoid TypeScript issues with underscore-prefixed properties
const questionnaireDefinition: any = {
  "resourceType": "Questionnaire",
  "status": "active",
  "title": "Patient Intake Questionnaire",
  "url": "https://medplum.com/Questionnaire/patient-intake-questionnaire-example",
  "name": "patient-intake",
  "version": "2.0.0",
  "date": new Date().toISOString(),
  "publisher": "Medplum Provider Example",
  "description": "Comprehensive patient intake form with SDC template extraction for automatic FHIR resource creation",
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate",
      "meta": {
        "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"]
      },
      "name": [
        {
          "_given": [
            {
              "extension": [
                {
                  "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                  "valueString": "item.where(linkId = 'first-name').answer.value"
                }
              ]
            },
            {
              "extension": [
                {
                  "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                  "valueString": "item.where(linkId = 'middle-name').answer.value.first()"
                }
              ]
            }
          ],
          "_family": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'last-name').answer.value.first()"
              }
            ]
          }
        }
      ],
      "_birthDate": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'dob').answer.value.first()"
          }
        ]
      },
"_gender": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'administrative-gender').answer.value.first().code"
          }
        ]
      },
      "address": [
        {
          "_line": [
            {
              "extension": [
                {
                  "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                  "valueString": "item.where(linkId = 'street').answer.value.first()"
                }
              ]
            }
          ],
          "_city": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'city').answer.value.first()"
              }
            ]
          },
          "_state": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'state').answer.value.first().code"
              }
            ]
          },
          "_postalCode": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'zip').answer.value.first()"
              }
            ]
          }
        }
      ],
      "telecom": [
        {
          "system": "phone",
          "_value": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'phone').answer.value.first()"
              }
            ]
          }
        }
      ],
      "identifier": [
        {
          "type": {
            "coding": [
              {
                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                "code": "SS",
                "display": "Social Security number"
              }
            ]
          },
          "system": "http://hl7.org/fhir/sid/us-ssn",
          "_value": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'ssn').answer.value.first()"
              }
            ]
          }
        }
      ],
      "extension": [
        {
          "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
          "extension": [
            {
              "url": "ombCategory",
              "valueCoding": {
                "extension": [
                  {
                    "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                    "valueString": "item.where(linkId = 'race').answer.value.first()"
                  }
                ]
              }
            }
          ]
        },
        {
          "url": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
          "extension": [
            {
              "url": "ombCategory",
              "valueCoding": {
                "extension": [
                  {
                    "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                    "valueString": "item.where(linkId = 'ethnicity').answer.value.first()"
                  }
                ]
              }
            }
          ]
        },
        {
          "url": "http://hl7.org/fhir/us/military-service/StructureDefinition/military-service-veteran-status",
          "_valueBoolean": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'veteran-status').answer.value.first()"
              }
            ]
          }
        }
      ],
      "communication": [
    {
      "language": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'preferred-language').answer.value.first()"
              }
            ]
          }
        ],
        "text": "English" // Add default text
      },
      "preferred": true
    }
  ]
    },
    {
      "resourceType": "RelatedPerson",
      "id": "emergencyContactTemplate",
      "patient": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "%NewPatientId"
            }
          ]
        }
      },
      "relationship": [
        {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/v2-0131",
              "code": "C",
              "display": "Emergency Contact"
            }
          ]
        }
      ],
      "name": [
        {
          "_given": [
            {
              "extension": [
                {
                  "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                  "valueString": "item.where(linkId = 'emergency-contact-first-name').answer.value"
                }
              ]
            },
            {
              "extension": [
                {
                  "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                  "valueString": "item.where(linkId = 'emergency-contact-middle-name').answer.value.first()"
                }
              ]
            }
          ],
          "_family": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'emergency-contact-last-name').answer.value.first()"
              }
            ]
          }
        }
      ],
      "telecom": [
        {
          "system": "phone",
          "_value": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'emergency-contact-phone').answer.value.first()"
              }
            ]
          }
        }
      ]
    },
    {
      "resourceType": "AllergyIntolerance",
      "id": "allergyTemplate",
      "meta": {
        "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-allergyintolerance"]
      },
      "clinicalStatus": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            "code": "active"
          }
        ]
      },
      "verificationStatus": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            "code": "unconfirmed"
          }
        ]
      },
      "patient": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "%NewPatientId"
            }
          ]
        }
      },
      "code": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'allergy-substance').answer.value.first()"
              }
            ]
          }
        ]
      },
      "reaction": [
        {
          "manifestation": [
            {
              "_text": {
                "extension": [
                  {
                    "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                    "valueString": "item.where(linkId = 'allergy-reaction').answer.value.first()"
                  }
                ]
              }
            }
          ]
        }
      ],
      "_onsetDateTime": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'allergy-onset').answer.value.first()"
          }
        ]
      }
    },
    {
  "resourceType": "MedicationRequest",
  "id": "medicationTemplate",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest"]
  },
  "status": "active",
  "intent": "order",
  "subject": {
    "_reference": {
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
          "valueString": "%NewPatientId"
        }
      ]
    }
  },
  "medicationCodeableConcept": {
    "coding": [
      {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'medication-code').answer.value.first()"
          }
        ]
      }
    ],
    "text": "Unknown medication" // Add fallback text
  },
  "requester": {
    "_reference": {
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
          "valueString": "%NewPatientId"
        }
      ]
    }
  }
},
    {
      "resourceType": "Condition",
      "id": "conditionTemplate",
      "meta": {
        "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition"]
      },
      "clinicalStatus": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'medical-history-clinical-status').answer.value.first()"
              }
            ]
          }
        ]
      },
      "subject": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "%NewPatientId"
            }
          ]
        }
      },
      "code": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'medical-history-problem').answer.value.first()"
              }
            ]
          }
        ]
      },
      "_onsetDateTime": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'medical-history-onset').answer.value.first()"
          }
        ]
      }
    },
    {
      "resourceType": "FamilyMemberHistory",
      "id": "familyHistoryTemplate",
      "status": "completed",
      "patient": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "%NewPatientId"
            }
          ]
        }
      },
      "relationship": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'family-member-history-relationship').answer.value.first()"
              }
            ]
          }
        ]
      },
      "condition": [
        {
          "code": {
            "coding": [
              {
                "extension": [
                  {
                    "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                    "valueString": "item.where(linkId = 'family-member-history-problem').answer.value.first()"
                  }
                ]
              }
            ]
          }
        }
      ],
      "_deceasedBoolean": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'family-member-history-deceased').answer.value.first()"
          }
        ]
      }
    },
     {
  "resourceType": "Immunization",
  "id": "immunizationTemplate",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-immunization"]
  },
  "status": "completed",
  "patient": {
    "_reference": {
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
          "valueString": "%NewPatientId"
        }
      ]
    }
  },
  "vaccineCode": {
    "coding": [
      {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'immunization-vaccine').answer.value.first()"
          }
        ]
      }
    ]
  },
  "_occurrenceDateTime": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
        "valueString": "item.where(linkId = 'immunization-date').answer.value.first()"
      }
    ]
  },
  "primarySource": false  // Add required field - false indicates patient-reported
},   {
      "resourceType": "Coverage",
      "id": "coverageTemplate",
      "meta": {
        "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-coverage"]
      },
      "status": "active",
      "beneficiary": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "%NewPatientId"
            }
          ]
        }
      },
      "payor": [
        {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              "valueString": "item.where(linkId = 'insurance-provider').answer.value.first()"
            }
          ]
        }
      ],
      "_subscriberId": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'subscriber-id').answer.value.first()"
          }
        ]
      },
      "relationship": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'relationship-to-subscriber').answer.value.first()"
              }
            ]
          }
        ]
      }
    },
     {
  "resourceType": "Observation",
  "id": "smokingStatusTemplate",
  "meta": {
    "profile": ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-smokingstatus"]
  },
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "social-history"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "72166-2",
        "display": "Tobacco smoking status"
      }
    ]
  },
  "subject": {
    "_reference": {
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
          "valueString": "%NewPatientId"
        }
      ]
    }
  },
  "valueCodeableConcept": {
    "coding": [
      {
        "extension": [
          {
            "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
            "valueString": "item.where(linkId = 'smoking-status').answer.value.first()"
          }
        ]
      }
    ],
    "text": "Unknown" // Add fallback text
  },
  "_effectiveDateTime": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
        "valueString": "%resource.authored"
      }
    ]
  }
},
{
  "resourceType": "Consent",
  "id": "treatmentConsentTemplate",
  "status": "active",
  "scope": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/consentscope",
        "code": "treatment"
      }
    ]
  },
  "category": [
    {
      "coding": [
        {
          "system": "http://loinc.org",
          "code": "59284-0",
          "display": "Consent Document"
        }
      ]
    }
  ],
  "patient": {
    "_reference": {
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
          "valueString": "%NewPatientId"
        }
      ]
    }
  },
  "_dateTime": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
        "valueString": "item.where(linkId = 'consent-for-treatment-date').answer.value.first()"
      }
    ]
  },
  "policy": [
    {
      "uri": "https://example.org/consent/treatment-v1"  // Add required policy
    }
  ],
  "provision": {
    "type": "permit"
  }
}
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId",
      "valueString": "NewPatientId"
    }
  ],
  "item": [
    {
      "linkId": "patient-demographics",
      "text": "Demographics",
      "type": "group",
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#patientTemplate"
              }
            },
            {
              "url": "fullUrl",
              "valueString": "%NewPatientId"
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "first-name",
          "text": "First Name",
          "type": "string",
          "required": true
        },
        {
          "linkId": "middle-name",
          "text": "Middle Name",
          "type": "string"
        },
        {
          "linkId": "last-name",
          "text": "Last Name",
          "type": "string",
          "required": true
        },
        {
          "linkId": "dob",
          "text": "Date of Birth",
          "type": "date"
        },
        {
          "linkId": "street",
          "text": "Street",
          "type": "string"
        },
        {
          "linkId": "city",
          "text": "City",
          "type": "string"
        },
        {
          "linkId": "state",
          "text": "State",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/us-core-usps-state"
        },
        {
          "linkId": "zip",
          "text": "Zip",
          "type": "string"
        },
        {
          "linkId": "phone",
          "text": "Phone",
          "type": "string"
        },
        {
          "linkId": "ssn",
          "text": "Social Security Number",
          "type": "string",
          "required": true
        },
        {
          "linkId": "race",
          "text": "Race",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/omb-race-category"
        },
        {
          "linkId": "ethnicity",
          "text": "Ethnicity",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/omb-ethnicity-category"
        },
        {
          "linkId": "administrative-gender",
          "text": "Gender",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/ValueSet/administrative-gender",
          "required": true
        },
        {
          "linkId": "sexual-orientation",
          "text": "Sexual Orientation",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/us-core-sexual-orientation"
        }
      ]
    },
    {
      "linkId": "emergency-contact",
      "text": "Emergency Contact",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#emergencyContactTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "emergency-contact-first-name",
          "text": "First Name",
          "type": "string"
        },
        {
          "linkId": "emergency-contact-middle-name",
          "text": "Middle Name",
          "type": "string"
        },
        {
          "linkId": "emergency-contact-last-name",
          "text": "Last Name",
          "type": "string"
        },
        {
          "linkId": "emergency-contact-phone",
          "text": "Phone",
          "type": "string"
        }
      ]
    },
    {
      "linkId": "allergies",
      "text": "Allergies",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#allergyTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "allergy-substance",
          "text": "Substance",
          "type": "choice",
          "answerValueSet": "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1186.8"
        },
        {
          "linkId": "allergy-reaction",
          "text": "Reaction",
          "type": "string"
        },
        {
          "linkId": "allergy-onset",
          "text": "Onset",
          "type": "dateTime"
        }
      ]
    },
    {
      "linkId": "medications",
      "text": "Current medications",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#medicationTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "medication-code",
          "text": "Medication Name",
          "type": "choice",
          "answerValueSet": "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.4"
        },
        {
          "linkId": "medication-note",
          "text": "Note",
          "type": "string"
        }
      ]
    },
    {
      "linkId": "medical-history",
      "text": "Medical History",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#conditionTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "medical-history-problem",
          "text": "Problem",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/us-core-condition-code"
        },
        {
          "linkId": "medical-history-clinical-status",
          "text": "Status",
          "type": "choice",
          "answerValueSet": "http://terminology.hl7.org/ValueSet/condition-clinical"
        },
        {
          "linkId": "medical-history-onset",
          "text": "Onset",
          "type": "dateTime"
        }
      ]
    },
    {
      "linkId": "family-member-history",
      "text": "Family Member History",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#familyHistoryTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "family-member-history-problem",
          "text": "Problem",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/us/core/ValueSet/us-core-condition-code"
        },
        {
          "linkId": "family-member-history-relationship",
          "text": "Relationship",
          "type": "choice",
          "answerValueSet": "http://terminology.hl7.org/ValueSet/v3-FamilyMember"
        },
        {
          "linkId": "family-member-history-deceased",
          "text": "Deceased",
          "type": "boolean"
        }
      ]
    },
    {
      "linkId": "vaccination-history",
      "text": "Vaccination History",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#immunizationTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "immunization-vaccine",
          "text": "Vaccine",
          "type": "choice",
          "answerValueSet": "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.6"
        },
        {
          "linkId": "immunization-date",
          "text": "Administration Date",
          "type": "dateTime"
        }
      ]
    },
    {
      "linkId": "preferred-pharmacy",
      "text": "Preferred Pharmacy",
      "type": "group",
      "item": [
        {
          "linkId": "preferred-pharmacy-reference",
          "text": "Pharmacy",
          "type": "reference",
          "extension": [
            {
              "id": "reference-pharmacy",
              "url": "http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource",
              "valueCodeableConcept": {
                "coding": [
                  {
                    "system": "http://hl7.org/fhir/fhir-types",
                    "display": "Organizations",
                    "code": "Organization"
                  }
                ]
              }
            }
          ]
        }
      ]
    },
    {
      "linkId": "coverage-information",
      "text": "Coverage Information",
      "type": "group",
      "repeats": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#coverageTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "insurance-provider",
          "text": "Insurance Provider",
          "type": "reference",
          "required": true,
          "extension": [
            {
              "id": "reference-insurance",
              "url": "http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource",
              "valueCodeableConcept": {
                "coding": [
                  {
                    "system": "http://hl7.org/fhir/fhir-types",
                    "display": "Organizations",
                    "code": "Organization"
                  }
                ]
              }
            }
          ]
        },
        {
          "linkId": "subscriber-id",
          "text": "Subscriber ID",
          "type": "string",
          "required": true
        },
        {
          "linkId": "relationship-to-subscriber",
          "text": "Relationship to Subscriber",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/ValueSet/subscriber-relationship",
          "required": true
        },
        {
          "linkId": "related-person",
          "text": "Subscriber Information",
          "type": "group",
          "enableBehavior": "all",
          "enableWhen": [
            {
              "question": "relationship-to-subscriber",
              "operator": "!=",
              "answerCoding": {
                "system": "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                "code": "other",
                "display": "Other"
              }
            },
            {
              "question": "relationship-to-subscriber",
              "operator": "!=",
              "answerCoding": {
                "system": "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                "code": "self",
                "display": "Self"
              }
            },
            {
              "question": "relationship-to-subscriber",
              "operator": "!=",
              "answerCoding": {
                "system": "http://terminology.hl7.org/CodeSystem/subscriber-relationship",
                "code": "injured",
                "display": "Injured Party"
              }
            }
          ],
          "item": [
            {
              "linkId": "related-person-first-name",
              "text": "First Name",
              "type": "string"
            },
            {
              "linkId": "related-person-middle-name",
              "text": "Middle Name",
              "type": "string"
            },
            {
              "linkId": "related-person-last-name",
              "text": "Last Name",
              "type": "string"
            },
            {
              "linkId": "related-person-dob",
              "text": "Date of Birth",
              "type": "date"
            },
            {
              "linkId": "related-person-gender-identity",
              "text": "Gender Identity",
              "type": "choice",
              "answerValueSet": "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.32"
            }
          ]
        }
      ]
    },
    {
      "linkId": "social-determinants-of-health",
      "text": "Social Determinants of Health",
      "type": "group",
      "item": [
        {
          "linkId": "housing-status",
          "text": "Housing Status",
          "type": "choice",
          "answerValueSet": "http://terminology.hl7.org/ValueSet/v3-LivingArrangement"
        },
        {
          "linkId": "education-level",
          "text": "Education Level",
          "type": "choice",
          "answerValueSet": "http://terminology.hl7.org/ValueSet/v3-EducationLevel"
        },
        {
          "linkId": "smoking-status",
          "text": "Smoking Status",
          "type": "choice",
          "answerValueSet": "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.11.20.9.38",
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
              "extension": [
                {
                  "url": "template",
                  "valueReference": {
                    "reference": "#smokingStatusTemplate"
                  }
                }
              ]
            }
          ]
        },
        {
          "linkId": "veteran-status",
          "text": "Veteran Status",
          "type": "boolean"
        },
        {
          "linkId": "pregnancy-status",
          "text": "Pregnancy Status",
          "type": "choice",
          "code": [
            {
              "code": "82810-3",
              "display": "Pregnancy status",
              "system": "http://loinc.org"
            }
          ],
          "answerValueSet": "http://example.com/pregnancy-status"
        },
        {
          "linkId": "estimated-delivery-date",
          "text": "Estimated Delivery Date",
          "type": "date",
          "code": [
            {
              "code": "11778-8",
              "display": "Estimated date of delivery",
              "system": "http://loinc.org"
            }
          ],
          "enableWhen": [
            {
              "question": "pregnancy-status",
              "operator": "=",
              "answerCoding": {
                "system": "http://snomed.info/sct",
                "code": "77386006",
                "display": "Pregnancy"
              }
            }
          ]
        }
      ]
    },
    {
      "linkId": "languages-spoken",
      "text": "Languages Spoken",
      "type": "choice",
      "answerValueSet": "http://hl7.org/fhir/ValueSet/languages",
      "repeats": true
    },
    {
      "linkId": "preferred-language",
      "text": "Preferred Language",
      "type": "choice",
      "answerValueSet": "http://hl7.org/fhir/ValueSet/languages"
    },
    {
      "linkId": "consent-for-treatment",
      "text": "Consent for Treatment",
      "type": "group",
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            {
              "url": "template",
              "valueReference": {
                "reference": "#treatmentConsentTemplate"
              }
            }
          ]
        }
      ],
      "item": [
        {
          "linkId": "consent-for-treatment-signature",
          "text": "I the undersigned patient (or authorized representative, or parent/guardian), consent to and authorize the performance of any treatments, examinations, medical services, surgical or diagnostic procedures, including lab and radiographic studies, as ordered by this office and it's healthcare providers.",
          "type": "boolean"
        },
        {
          "linkId": "consent-for-treatment-date",
          "text": "Date",
          "type": "date"
        }
      ]
    },
    {
      "linkId": "agreement-to-pay-for-treatment",
      "text": "Agreement to Pay for Treatment",
      "type": "group",
      "item": [
        {
          "linkId": "agreement-to-pay-for-treatment-help",
          "text": "I, the responsible party, hereby agree to pay all the charges submitted by this office during the course of treatment for the patient. If the patient has insurance coverage with a managed care organization, with which this office has a contractual agreement, I agree to pay all applicable co‐payments, co‐insurance and deductibles, which arise during the course of treatment for the patient. The responsible party also agrees to pay for treatment rendered to the patient, which is not considered to be a covered service by my insurer and/or a third party insurer or other payor. I understand that Sample Hospital provides charges on a sliding fee; based on family size and household annual income, and that services will not be refused due to inability to pay at the time of the visit.",
          "type": "boolean"
        },
        {
          "linkId": "agreement-to-pay-for-treatment-date",
          "text": "Date",
          "type": "date"
        }
      ]
    },
    {
      "linkId": "notice-of-privacy-practices",
      "text": "Notice of Privacy Practices",
      "type": "group",
      "item": [
        {
          "linkId": "notice-of-privacy-practices-help",
          "text": "Sample Hospital Notice of Privacy Practices gives information about how Sample Hospital may use and release protected health information (PHI) about you. I understand that:\n- I have the right to receive a copy of Sample Hospital's Notice of Privacy Practices.\n- I may request a copy at any time.\n- Sample Hospital's Notice of Privacy Practices may be revised.",
          "type": "display"
        },
        {
          "linkId": "notice-of-privacy-practices-signature",
          "text": "I acknowledge the above and that I have received a copy of Sample Hospital's Notice of Privacy Practices.",
          "type": "boolean"
        },
        {
          "linkId": "notice-of-privacy-practices-date",
          "text": "Date",
          "type": "date"
        }
      ]
    },
    {
      "linkId": "acknowledgement-for-advance-directives",
      "text": "Acknowledgement for Advance Directives",
      "type": "group",
      "item": [
        {
          "linkId": "acknowledgement-for-advance-directives-help",
          "text": "An Advance Medical Directive is a document by which a person makes provision for health care decisions in the event that, in the future, he/she becomes unable to make those decisions.",
          "type": "display"
        },
        {
          "linkId": "acknowledgement-for-advance-directives-signature",
          "text": "I acknowledge I have received information about Advance Directives.",
          "type": "boolean"
        },
        {
          "linkId": "acknowledgement-for-advance-directives-date",
          "text": "Date",
          "type": "date"
        }
      ]
    }
  ]
};
