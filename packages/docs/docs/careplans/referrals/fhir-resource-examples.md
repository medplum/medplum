# FHIR Resource Examples

## ServiceRequest Example

Here's an example of a ServiceRequest resource representing a cardiology referral:

```ts
{
  "resourceType": "ServiceRequest",
  "id": "cardiology-referral-example",
  "status": "active",
  "intent": "order",
  "category": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "308447001",
          "display": "Referral to specialist"
        }
      ]
    }
  ],
  "priority": "routine",
  "code": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "17561000",
        "display": "Cardiology service"
      }
    ],
    "text": "Cardiology consultation"
  },
  "subject": {
    "reference": "Patient/example-patient-id",
    "display": "John Smith"
  },
  "encounter": {
    "reference": "Encounter/primary-care-visit-id"
  },
  "occurrenceDateTime": "2023-06-15",
  "authoredOn": "2023-05-28",
  "requester": {
    "reference": "Practitioner/primary-care-doctor-id",
    "display": "Dr. Marcus Welby"
  },
  "performer": [
    {
      "reference": "Practitioner/cardiologist-id",
      "display": "Dr. Helen Cardio"
    }
  ],
  "reasonCode": [
    {
      "coding": [
        {
          "system": "http://snomed.info/sct",
          "code": "429626006",
          "display": "Chest pain on exertion"
        }
      ]
    }
  ],
  "reasonReference": [
    {
      "reference": "Condition/chest-pain-condition-id"
    }
  ],
  "supportingInfo": [
    {
      "reference": "Observation/ecg-observation-id"
    },
    {
      "reference": "DocumentReference/ecg-report-id"
    }
  ],
  "note": [
    {
      "text": "Patient reports chest pain with exertion for the past 2 weeks. ECG shows non-specific ST changes. Please evaluate for possible coronary artery disease."
    }
  ],
  "patientInstruction": "Please bring your medication list to the appointment."
}
```

## Task Example

Here's an example of a Task resource for tracking the referral status:

```ts
{
  "resourceType": "Task",
  "id": "referral-task-example",
  "status": "requested",
  "intent": "order",
  "priority": "routine",
  "code": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/task-code",
        "code": "fulfill",
        "display": "Fulfill the focal request"
      }
    ],
    "text": "Process referral"
  },
  "focus": {
    "reference": "ServiceRequest/cardiology-referral-example"
  },
  "for": {
    "reference": "Patient/example-patient-id",
    "display": "John Smith"
  },
  "authoredOn": "2023-05-28T14:30:00Z",
  "lastModified": "2023-05-28T14:30:00Z",
  "requester": {
    "reference": "Practitioner/primary-care-doctor-id",
    "display": "Dr. Marcus Welby"
  },
  "owner": {
    "reference": "Practitioner/cardiologist-id",
    "display": "Dr. Helen Cardio"
  },
  "businessStatus": {
    "text": "Waiting for review"
  },
  "description": "Cardiology referral for chest pain evaluation",
  "restriction": {
    "period": {
      "start": "2023-05-28T14:30:00Z",
      "end": "2023-06-28T14:30:00Z"
    }
  }
}
```

## Questionnaire Example

Here's a sample Questionnaire for capturing referral data:

```ts
{
  "resourceType": "Questionnaire",
  "id": "cardiology-referral-questionnaire",
  "title": "Cardiology Referral Form",
  "status": "active",
  "date": "2023-01-15",
  "item": [
    {
      "linkId": "referral-category",
      "text": "Referral Type",
      "type": "choice",
      "required": true,
      "answerOption": [
        {
          "valueCoding": {
            "system": "http://snomed.info/sct",
            "code": "308447001",
            "display": "Referral to specialist"
          }
        },
        {
          "valueCoding": {
            "system": "http://snomed.info/sct",
            "code": "306237005",
            "display": "Referral to outpatient department"
          }
        }
      ]
    },
    {
      "linkId": "specialty",
      "text": "Specialty",
      "type": "choice",
      "required": true,
      "answerOption": [
        {
          "valueCoding": {
            "system": "http://snomed.info/sct",
            "code": "17561000",
            "display": "Cardiology service"
          }
        }
      ]
    },
    {
      "linkId": "urgency",
      "text": "Urgency",
      "type": "choice",
      "required": true,
      "answerOption": [
        {
          "valueString": "routine"
        },
        {
          "valueString": "urgent"
        },
        {
          "valueString": "asap"
        }
      ]
    },
    {
      "linkId": "reason",
      "text": "Reason for Referral",
      "type": "text",
      "required": true
    },
    {
      "linkId": "clinical-info",
      "text": "Clinical Information",
      "type": "group",
      "item": [
        {
          "linkId": "symptoms",
          "text": "Current Symptoms",
          "type": "text",
          "required": true
        },
        {
          "linkId": "duration",
          "text": "Duration of Symptoms",
          "type": "string"
        },
        {
          "linkId": "relevant-history",
          "text": "Relevant Medical History",
          "type": "text"
        }
      ]
    },
    {
      "linkId": "medications",
      "text": "Current Medications",
      "type": "text"
    },
    {
      "linkId": "allergies",
      "text": "Allergies",
      "type": "text"
    },
    {
      "linkId": "attachments",
      "text": "Supporting Documents",
      "type": "attachment",
      "repeats": true
    }
  ]
}
```

## Communication Example

Here's an example of a Communication resource for the referral transmission:

```ts
{
  "resourceType": "Communication",
  "id": "referral-communication-example",
  "status": "completed",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/communication-category",
          "code": "notification",
          "display": "Notification"
        }
      ],
      "text": "Referral"
    }
  ],
  "priority": "routine",
  "subject": {
    "reference": "Patient/example-patient-id",
    "display": "John Smith"
  },
  "about": [
    {
      "reference": "ServiceRequest/cardiology-referral-example"
    }
  ],
  "sent": "2023-05-28T15:00:00Z",
  "received": "2023-05-28T15:05:23Z",
  "recipient": [
    {
      "reference": "Practitioner/cardiologist-id",
      "display": "Dr. Helen Cardio"
    }
  ],
  "sender": {
    "reference": "Practitioner/primary-care-doctor-id",
    "display": "Dr. Marcus Welby"
  },
  "payload": [
    {
      "contentString": "Please see the attached referral for John Smith for evaluation of chest pain."
    },
    {
      "contentReference": {
        "reference": "DocumentReference/referral-summary-doc-id"
      }
    }
  ]
}
```

## DocumentReference Example

Here's an example of a DocumentReference containing a referral summary PDF:

```ts
{
  "resourceType": "DocumentReference",
  "id": "referral-summary-doc-id",
  "status": "current",
  "docStatus": "final",
  "type": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "57133-1",
        "display": "Referral note"
      }
    ]
  },
  "category": [
    {
      "coding": [
        {
          "system": "http://loinc.org",
          "code": "57170-3",
          "display": "Specialty specific referral"
        }
      ]
    }
  ],
  "subject": {
    "reference": "Patient/example-patient-id",
    "display": "John Smith"
  },
  "date": "2023-05-28T14:45:00Z",
  "author": [
    {
      "reference": "Practitioner/primary-care-doctor-id",
      "display": "Dr. Marcus Welby"
    }
  ],
  "authenticator": {
    "reference": "Practitioner/primary-care-doctor-id",
    "display": "Dr. Marcus Welby"
  },
  "content": [
    {
      "attachment": {
        "contentType": "application/pdf",
        "language": "en-US",
        "data": "JVBERi0xLjMKJcTl8uXrp...", // Base64 encoded PDF content (truncated)
        "title": "Cardiology Referral - John Smith",
        "creation": "2023-05-28T14:45:00Z"
      }
    }
  ],
  "context": {
    "related": [
      {
        "reference": "ServiceRequest/cardiology-referral-example"
      }
    ]
  }
}
```



