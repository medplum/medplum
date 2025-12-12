# Visits

Visit management is at the heart of clinical documentation and patient care delivery. The Medplum Provider app provides comprehensive tools for documenting patient Visits, streamlining clinical workflows through Care Templates, and customizing documentation to meet specific practice needs. This section covers the essential Visit management functions.

---

## **Understanding Visits**

While "Visit" isn't a defined FHIR resource, we've combined the Appointment and Encounter resources into this single, simplified concept to improve the provider experience. Each Visit also automatically generates related FHIR resources:

1. **Clinical Documentation**
   - A [ClinicalImpression](../api/fhir/resources/clinicalimpression) resource represents the Visit's (i.e. Encounter's) chart note
2. **Care Management**
   - Care Templates ([PlanDefinition](../api/fhir/resources/plandefinition) resources) generate Tasks containing Questionnaires or ActivityDefinitions (which in turn can generate ServiceRequests, etc.)
3. **Billing Integration**
   - To simplify and automate billing, [ChargeItems](../api/fhir/resources/chargeitem) and [Claims](../api/fhir/resources/claim) are created automatically based on the Encounter, ActivityDefinitions, and ChargeItemDefinitions

---

## **Documenting Visits**

Proper Visit documentation ensures continuity of care, supports clinical decision-making, meets regulatory requirements, and facilitates billing and coding accuracy. The visit documentation system captures all aspects of patient encounters in a structured, searchable format.

## **How to Start a New Visit**

1. **Navigate to a Patient’s Visits Page**
   - Navigate to a Patient Profile page by using the global search field or through the “Patients” section in the left navigation menu
   - On a Patient Profile page, select the "Visits" tab at the top
2. **Select or Create a New Visit**
   - Create a new Visit by clicking the “New…” button at the top of a patient’s Visit page
   - Select and verify the Start and End Times selected for the Visit as well as the Class, and Care Template for the Visit
   - Click “Create” to create this new Visit
   - Alternatively, you can select an existing Visit or create a new one in the Schedule section which will redirect you to your the unique Visit page
3. **Start Documenting Your Visit**
   - On the unique Visit page you’ve created, you can start documenting your visit using the note input and tasks on the “Notes & Tasks” tab
   - Be sure to change the status of your Visit as it progresses, using the status manager in the upper right corner. Here are the statuses available to choose:
     - **Planned**: the visit is scheduled or arranged but has not yet begun (e.g. a visit that has been scheduled but the patient hasn't arrived yet)
     - **In Progress**: the visit is currently active and ongoing (e.g. the patient is present and receiving care or services from healthcare providers)
     - **Finished**: the visit has been completed successfully (e.g. all planned activities have been carried out and the visit has been concluded)
     - **Cancelled**: the visit was Planned but has been called off before it began (e.g. due to patient cancellation, provider unavailability, or other circumstances that prevented the visit from taking place)
   - Before, during, and/or after the Visit, you will also need to add other details about the visit on the “Details & Billing” tab
     - **Check in**: the time the Visit started (auto-filled when the status is changed to In Progress)
     - **Check out**: the time the Visit ended (auto-filled when the status is changed to Finished)
     - **Service type**: the type of service provided at the Visit
     - **Diagnoses**: if applicable, the ability to add key diagnoses for this Visit
4. **Billing for Your Visit**
   - On the “Details & Billing” tab, you will also see the individual Charge Items related to the Visit which will need to be configured as part of your Care Template ahead of time (see [“Setting Up Care Templates”](#setting-up-care-templates-via-medplum-app) )
   - Once billing details are finalized, you can export a claim as a CMS 1500 form to submit for billing.
   - Alternatively, Medplum offers integrations for both Stedi and Candid Health which allow claims to be sent directly to these services which forward to payors
     - To learn more about these integrations, please [contact our sales team](mailto:hello@medplum.com)

---

## **Setting Up Care Templates (via Medplum App)**

Before setting up your Care Templates, it’s important to understand the separate but connected resources they incorporate. In the Medplum App, Care Templates are represented by the PlanDefinition FHIR resource which can include other, linked resources:

- **Task**, with linked **Questionnaire**
  - For adding defined, structured data fields for providers to complete during a Visit
- **Task**, with linked **ActivityDefinition**
  - For providers to perform during a Visit
  - **ActivityDefinition** is often used for creating a **ServiceRequest,** like procedures and diagnostics, but it can also be used for creating many other types of resources
- **ChargeItemDefinition**
  - For defining the cost of the Visit and related Task/ActivityDefinition/etc., which will be passed through to the billing process

### **How to Set up a Care Template**

There are two main approaches for setting up Care Templates. The first is by creating an initial Care Template (as a **PlanDefinition**) to create an outline of the Visit requirements, which can then be linked to other resources as they are created subsequently. The second approach is to create the linked resources first and then create the PlanDefinition, linking the other resources where appropriate (**Questionnaire**s, **ActivityDefinition**s, **ServiceRequest**s, etc.).

For this guide, we will take the first approach: creating a Care Template, then creating our Resources, and finally linking the related resources within our Care Template.

Medplum provides a sample Care Template for testing and prototyping. Copy the example below and upload it to the [batch](https://app.medplum.com/batch) tool to create a PlanDefinition you can use for testing.

<details>
<summary>Example Care Template Bundle</summary>

```ts
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:a1b2c3d4-e5f6-7890-abcd-123456789abc",
      "resource": {
        "resourceType": "ActivityDefinition",
        "url": "https://www.medplum.com/activitydefinition/comprehensive-laboratory-screening",
        "name": "Comprehensive Laboratory Screening",
        "status": "active",
        "extension": [
          {
            "url": "http://medplum.com/fhir/StructureDefinition/applicable-charge-definition",
            "valueCanonical": "https://www.medplum.com/chargeItemDefinition/simpleinitialvisit"
          }
        ],
        "code": {
          "coding": [
            {
              "system": "http://snomed.info/sct",
              "code": "26604007",
              "display": "Complete blood count"
            },
            {
              "system": "http://snomed.info/sct",
              "code": "108252007",
              "display": "Laboratory procedure (procedure)"
            },
            {
              "system": "http://snomed.info/sct",
              "code": "371361000119107",
              "display": "Comprehensive metabolic panel (procedure)"
            },
            {
              "system": "http://snomed.info/sct",
              "code": "16254007",
              "display": "Lipid panel (procedure)"
            },
            {
              "system": "http://snomed.info/sct",
              "code": "27171005",
              "display": "Urinalysis (procedure)"
            },
            {
              "system": "http://snomed.info/sct",
              "code": "35650009",
              "display": "Thyroid panel (procedure)"
            }
          ]
        },
        "kind": "ServiceRequest",
        "intent": "order"
      },
      "request": {
        "method": "POST",
        "url": "ActivityDefinition"
      }
    },
    {
      "fullUrl": "urn:uuid:b2c3d4e5-f6a7-8901-bcde-23456789abcd",
      "resource": {
        "resourceType": "ChargeItemDefinition",
        "url": "https://www.medplum.com/chargeItemDefinition/simpleinitialvisit",
        "title": "Simple Initial Visit",
        "status": "active",
        "propertyGroup": [
          {
            "priceComponent": [
              {
                "type": "base",
                "code": {
                  "coding": [
                    {
                      "system": "http://www.ama-assn.org/go/cpt",
                      "code": "99203",
                      "display": "New patient office visit"
                    }
                  ]
                },
                "factor": 1,
                "amount": {
                  "value": 180,
                  "currency": "USD"
                }
              }
            ]
          }
        ]
      },
      "request": {
        "method": "POST",
        "url": "ChargeItemDefinition"
      }
    },
    {
      "fullUrl": "urn:uuid:c3d4e5f6-a7b8-9012-cdef-3456789abcde",
      "resource": {
        "resourceType": "PlanDefinition",
        "url": "https://www.medplum.com/plandefinition/simple-initial-visit",
        "name": "Simple Initial Visit",
        "type": {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/plan-definition-type",
              "code": "order-set",
              "display": "Order Set"
            }
          ]
        },
        "status": "active",
        "title": "Comprehensive Physical Exam for New Patient",
        "action": [
          {
            "id": "id-1",
            "title": "Vital Signs Assessment",
            "definitionCanonical": "https://www.medplum.com/questionnaire/vital-signs-assessment",
            "description": "Record vital signs via Patient Summary and copy here."
          },
          {
            "id": "id-2",
            "title": "Comprehensive Physical Examination",
            "definitionCanonical": "https://www.medplum.com/questionnaire/comprehensive-physical-examination"
          },
          {
            "id": "id-3",
            "title": "Health Maintenance Screening",
            "definitionCanonical": "https://www.medplum.com/questionnaire/health-maintenance-screening"
          },
          {
            "id": "id-7",
            "definitionCanonical": "https://www.medplum.com/activitydefinition/comprehensive-laboratory-screening",
            "title": "Comprehensive Laboratory Screening"
          },
          {
            "id": "charge-consultation",
            "title": "Initial Patient E&M (99203)",
            "code": [
              {
                "coding": [
                  {
                    "system": "http://www.ama-assn.org/go/cpt",
                    "code": "99203",
                    "display": "Office or other outpatient visit for the evaluation and management of a new patient"
                  }
                ]
              }
            ]
          }
        ]
      },
      "request": {
        "method": "POST",
        "url": "PlanDefinition"
      }
    },
    {
      "fullUrl": "urn:uuid:d4e5f6a7-b8c9-0123-4567-456789abcdef",
      "resource": {
        "resourceType": "Questionnaire",
        "url": "https://www.medplum.com/questionnaire/comprehensive-physical-examination",
        "status": "active",
        "item": [
          {
            "id": "id-5",
            "linkId": "q5",
            "type": "text",
            "required": true,
            "text": "General Appearance"
          },
          {
            "id": "id-6",
            "linkId": "q6",
            "type": "text",
            "text": "Head, Eyes, Ears, Nose & Throat ",
            "repeats": false,
            "extension": [
              {
                "url": "http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource",
                "valueCodeableConcept": {
                  "coding": [
                    {
                      "system": "http://hl7.org/fhir/fhir-types",
                      "display": "Patient",
                      "code": "Patient"
                    }
                  ]
                }
              },
              {
                "url": "http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource",
                "valueCodeableConcept": {
                  "coding": [
                    {
                      "system": "http://hl7.org/fhir/fhir-types",
                      "display": "Practitioner",
                      "code": "Practitioner"
                    }
                  ]
                }
              }
            ]
          },
          {
            "id": "id-56",
            "linkId": "q43",
            "type": "text",
            "text": "Cardiovascular"
          },
          {
            "id": "id-84",
            "linkId": "q44",
            "type": "text",
            "text": "Respiratory"
          },
          {
            "id": "id-85",
            "linkId": "q45",
            "type": "text",
            "text": "Abdomen"
          },
          {
            "id": "id-86",
            "linkId": "q46",
            "type": "text",
            "text": "Extremities"
          },
          {
            "id": "id-87",
            "linkId": "q47",
            "type": "text",
            "text": "Neurological"
          },
          {
            "id": "id-88",
            "linkId": "q48",
            "type": "text",
            "text": "Skin"
          }
        ],
        "name": "Comprehensive Physical Examination",
        "title": "Comprehensive Physical Examination",
        "code": [
          {
            "code": "SNOMED 162673000",
            "display": "SNOMED 162673000"
          }
        ]
      },
      "request": {
        "method": "POST",
        "url": "Questionnaire"
      }
    },
    {
      "fullUrl": "urn:uuid:e5f6a7b8-c9d0-1234-5678-56789abcdef0",
      "resource": {
        "resourceType": "Questionnaire",
        "url": "https://www.medplum.com/questionnaire/health-maintenance-screening",
        "name": "Health Maintenance Screening",
        "status": "active",
        "item": [
          {
            "id": "id-1",
            "linkId": "q1",
            "type": "text",
            "text": "Immunization Status Review"
          },
          {
            "id": "id-2",
            "linkId": "q2",
            "type": "text",
            "text": "Cancer Screening Recommendations"
          },
          {
            "id": "id-3",
            "linkId": "q3",
            "type": "string",
            "text": "Cardiovascular Risk Assessment"
          },
          {
            "id": "id-4",
            "linkId": "q4",
            "type": "text",
            "text": "Age-Appropriate Counseling"
          }
        ],
        "title": "Health Maintenance Screening"
      },
      "request": {
        "method": "POST",
        "url": "Questionnaire"
      }
    },
    {
      "fullUrl": "urn:uuid:f6a7b8c9-d0e1-2345-4567-6789abcdef01",
      "resource": {
        "resourceType": "Questionnaire",
        "url": "https://www.medplum.com/questionnaire/vital-signs-assessment",
        "name": "Vital Signs Assessment",
        "status": "active",
        "item": [
          {
            "id": "id-8",
            "linkId": "q8",
            "type": "display",
            "text": "Record vital signs in the \"Vitals\" section of the Patient Summary sidebar and copy here."
          },
          {
            "id": "id-2",
            "linkId": "q2",
            "type": "text",
            "text": "Blood Pressure (Systolic/Diastolic)"
          },
          {
            "id": "id-3",
            "linkId": "q3",
            "type": "text",
            "text": "Heart Rate"
          },
          {
            "id": "id-4",
            "linkId": "q4",
            "type": "text",
            "text": "Temperature"
          },
          {
            "id": "id-1",
            "linkId": "q1",
            "type": "text",
            "text": "Respiratory Rate"
          },
          {
            "id": "id-5",
            "linkId": "q5",
            "type": "text",
            "text": "Oxygen Saturation"
          },
          {
            "id": "id-6",
            "linkId": "q6",
            "type": "text",
            "text": "Weight"
          },
          {
            "id": "id-7",
            "linkId": "q7",
            "type": "text",
            "text": "Height"
          }
        ],
        "title": "Vital Signs Assessment"
      },
      "request": {
        "method": "POST",
        "url": "Questionnaire"
      }
    }
  ]
}
```

</details>

1. **Navigate to the PlanDefinition Resource Page**
   - In the Medplum App, use the “Resource Type” search in the sidebar to find and then click on “PlanDefinition”
2. **Create a New PlanDefinition**
   - On the PlanDefinition table page, click the “New…” button at the top
   - There are many definition types available here, but the essential ones to fill out in this moment are:
     - Name (the name of your Care Template providers will see when creating a new Visit in the Medplum Provider app)
     - Title (the name that displays on Visits with this Care Template)
     - Status (usually “Active”)
     - Type (usually “Order Set”)
   - After adding these definition types, scroll to the bottom of the page and click “Create” to create your PlanDefinition (aka Care Template)
3. **Build the PlanDefinition**
   - On this new PlanDefinition page, click the “Builder” tab
   - Here you should see the Title you entered before and buttons to add Actions and Save
   - Click “Add Action” to start creating a new Task associated with this PlanDefinition
   - Add a Task Title and Description
   - Then, if applicable, choose a different action type to link a Questionnaire or ActivityDefinition to this Task
     - If you need to create a Questionnaire or ActivityDefinition, click the link in the field description to navigate to their respective pages (see details on creating [Questionnaires](#how-to-add-questionnaires) and [ActivityDefinitions](#how-to-add-activitydefinitions) below.
   - Click the “Save” button to save your PlanDefinition
4. **Test & Verify**
   - Navigate to the Schedules or Visits tab on Patient Profile page in the Medplum Provider app and try creating a new Visit
   - In the Care Templates selection field you should now see the PlanDefinition that was created
   - Select this Care Template, complete the other required fields, and then click “Create” to create a new Visit
   - On the “Note & Tasks” tab you should see the Tasks that were added in the Medplum App along with content for any associated Questionnaires and/or ActivityDefinitions.

### **How to Add Questionnaires**

1. **Navigate to the Questionnaire Resource Page**
   - In the Medplum App, use the “Resource Type” search in the sidebar to find and then click on “Questionnaire”
2. **Create a New Questionnaire**
   - On the Questionnaire table page, click the “New…” button at the top
   - There are many definition types available here, but the essential ones to fill out in this moment are:
     - Name (the name that will display in definition type selection fields)
     - Title (the name that displays on Visits)
     - Status (usually “Active”)
   - After adding these definition types, scroll to the bottom of the page and click “Create” to create your Questionnaire
3. **Build the Questionnaire**
   - On this new Questionnaire page, click the “Builder” tab
   - Here you should see options to add an item, group, or page as well as the ability to Save
   - Click “Add Item” to add a question
     - Add your first question into the box with the “Question” placeholder
     - Use the default Link ID (e.g. “q1”) or add your own
     - Choose the format of the answer (e.g. Date, Text, Choice, etc.)
     - Repeat this for each item you’d like to add to your Questionnaire
   - After adding your questions, you use the arrow icons to reorder them
   - You can also create groups or pages to add visual structure to your Questionnaire
   - Click the “Save” button to save your Questionnaire
4. **Test & Verify**
   - After saving, click the “Preview” tab on the Questionnaire page to preview how your Questionnaire will appear in the Provider App.

### **How to Set Up ChargeItems**

1. **Navigate to the ChargeItemDefinition Resource Page**
   - In the Medplum App, use the “Resource Type” search in the sidebar to find and then click on “ChargeItemDefinition”
2. **Create a New ChargeItemDefinition**
   - On the ChargeItemDefinition table page, click the “New…” button at the top
   - There are many definition types available here, but the essential ones to fill out are:
     - URL (used as a canonical identifier, can be `https://www.medplum.com/chargeItemDefinition/newvisit` or similar)
     - Status (usually “Active”)
     - Code (description of CPT or SNOMED for the billable activity)
     - Price Component under Property Group (where base price and modified prices are defined)
       - Type (will be “base” for first price component and “surcharge” for the second or beyond)
       - Factor (will be “1” for first price component and blank for the second or beyond)
       - Amount (the dollar amount to be billed to payors)
   - After adding these definition types, scroll to the bottom of the page and click “Create” to create your ChargeItemDefinition

### **How to Add ActivityDefinitions**

1. **Navigate to the ActivityDefinition Resource Page**
   - In the Medplum App, use the “Resource Type” search in the sidebar to find and then click on “ActivityDefinition”
2. **Create a New ActivityDefinition**
   - On the ActivityDefinition table page, click the “New…” button at the top
   - There are many definition types available here, but the essential ones to fill out in this moment are:
     - Name (the name that will display in definition type selection fields)
     - Status (usually “Active”)
     - Kind (ServiceRequest, MedicationRequest, CommunicationRequest, etc.)
     - Intent (usually “Order”)
   - After adding these definition types, scroll to the bottom of the page and click “Create” to create your ActivityDefinition
3. **Add the ChargeItemDefinition URL & Code to the JSON**
   - Cick the "JSON" tab at the top of the ActivityDefinition page that you just updated
   - In your JSON, add the URL of the associated ChargeItemDefinition like this:

     ```json
     "extension": [
     {
        "url": "http://medplum.com/fhir/StructureDefinition/applicable-charge-definition",
        "valueCanonical": "[Your ChargeItemDefinition URL]"
     }
     ]
     ```

   - Also in your JSON, add the CPT code for associated ChargeItemDefinition like this:

     ```json
     "code": {
     "coding": [
        {
           "system": "http://www.ama-assn.org/go/cpt",
           "code": "99203",
           "display": "New patient visit"
        }
     ]
     }
     ```

- Scroll to the bottom of the text box and click "OK" to update the JSON for your ActivityDefinition

4. **Test & Verify**
   - Navigate to a Patient Profile in the Provider App and create a new Visit, selecting the Care Teamplate (aka PlanDefinition) associated with your ActivityDefinition and ChargeItemDefinition.
   - After creating your Visit, click on the "Details & Billing" tab to the Charge Items that were created with the Visit, which should be those your defined in your ActivityDefinition and ChargeItemDefinition.

**_Note: if you are creating an ActivityDefinition after setting up your PlanDefinition, you will also need to link this within a Task in the PlanDefinition builder tab._**
