---
slug: fhir-workflow-patterns-to-simplify-your-life
title: FHIR Workflow Patterns to Simplify Your Life
authors: rahul
tags: [fhir-datastore]
---

# FHIR Workflow Patterns to Simplify Your Life

If you've worked with FHIR before, you've probably noticed there are a lot of resources. And I mean a lot! At first glance, it might seem overwhelming to figure out how they all fit together. But here's the thing: once you understand a few core patterns, the whole system starts to make much more sense.

Today, let's talk about one of FHIR's clever organizational tricks: the Workflow module. It's an pattern overlaid onto resource types that helps unlock how different healthcare activities relate to each other. Whether you're building a scheduling system, managing prescriptions, or handling lab orders, these patterns will come in handy.

<!-- truncate -->

## The Three Resource Patterns: A Simple Framework

Think of healthcare workflows like a play: you have the script (what should happen), the actual performance (what did happen), and the stage directions (how things should happen). FHIR organizes its workflow resources in a similar way, with three main patterns:

### 1. Request Resources: "Please Do This"

These are resources that ask and authorize someone to do something. When a doctor orders a blood test, prescribes a medication, or assigns a task to a nurse, they're creating a Request resource. It's FHIR's way of saying "hey, this needs to happen."

### 2. Event Resources: "This Happened"

These record what actually happened. When the nurse draws blood, when the patient takes their medication, or when two healthcare providers have a conversation about a case - these all become Event resources. They're the historical record of what actually happened.

### 3. Definition Resources: "Here's How Things Should Work"

These are like the rulebook or playbook. They define standard procedures, protocols, and guidelines that aren't tied to any specific patient. Think of them as templates that can be used over and over again.

## The Complete Resource Grouping

Let's look at how FHIR organizes all its workflow resources. This might seem like a lot at first, but remember - they all follow those three patterns we just discussed:

### Definitions (aka "Templates and Protocols")

| Resource                                                                  | Description                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`PlanDefinition`](/docs/api/fhir/resources/plandefinition)               | The cornerstone of clinical protocols and guidelines. Defines ordered sets of activities, including their conditions, dependencies, and timing relationships. Think of this as your master playbook.                                                                                                           |
| [`ActivityDefinition`](/docs/api/fhir/resources/activitydefinition)       | Defines a single, reusable activity that can be performed. Works hand-in-hand with PlanDefinition - if PlanDefinition is your playbook, this is a single play.                                                                                                                                                 |
| [`ObservationDefinition`](/docs/api/fhir/resources/observationdefinition) | Defines the expected structure and permissible values for a type of observation or measurement. Crucial for lab tests - it specifies things like reference ranges, critical values, and normal ranges for a particular type of test. Think of it as the template that individual Observation resources follow. |
| [`Questionnaire`](/docs/api/fhir/resources/questionnaire)                 | Templates for collecting structured data. Used everywhere from patient intake forms to research protocols.                                                                                                                                                                                                     |
| [`Measure`](/docs/api/fhir/resources/measure)                             | Defines how to calculate quality measures and performance metrics. Helps answer questions like "what percentage of our diabetic patients got their A1C tested this year?"                                                                                                                                      |

### Requests (aka "Please Do This")

| Resource                                                                            | Description                                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Clinical Care**                                                                   |                                                                                                                               |
| [`ServiceRequest`](/docs/api/fhir/resources/servicerequest)                         | The Swiss Army knife of clinical orders. Used for lab tests, imaging studies, procedures - basically any clinical service.    |
| [`MedicationRequest`](/docs/api/fhir/resources/medicationrequest)                   | Covers both outpatient prescriptions and inpatient medication orders.                                                         |
| [`DeviceRequest`](/docs/api/fhir/resources/devicerequest)                           | Orders for medical device use or changes.                                                                                     |
| [`ImmunizationRecommendation`](/docs/api/fhir/resources/immunizationrecommendation) | Recommendations for vaccines based on protocols and patient history.                                                          |
| [`CarePlan`](/docs/api/fhir/resources/careplan)                                     | Coordinates multiple related health activities. Think of a post-surgery recovery plan or a diabetes management program.       |
| [`NutritionOrder`](/docs/api/fhir/resources/nutritionorder)                         | Dietary orders and nutritional recommendations, from hospital meals to long-term dietary plans.                               |
| [`VisionPrescription`](/docs/api/fhir/resources/visionprescription)                 | Prescriptions for vision correction (glasses, contacts).                                                                      |
| **Administrative**                                                                  |                                                                                                                               |
| [`Task`](/docs/api/fhir/resources/task)                                             | Generic workflow tasks that don't fit other categories. Great for tracking administrative work like insurance followup.       |
| [`Appointment`](/docs/api/fhir/resources/appointment)                               | Scheduled time slots for any healthcare service. Works with AppointmentResponse for managing scheduling.                      |
| [`CommunicationRequest`](/docs/api/fhir/resources/communicationrequest)             | Requests for someone to communicate something. Used for everything from "please call this patient" to "get consultant input". |
| [`SupplyRequest`](/docs/api/fhir/resources/supplyrequest)                           | Requests for supplies or materials. Used in inventory and supply chain management.                                            |
| **Financial**                                                                       |                                                                                                                               |
| [`Claim`](/docs/api/fhir/resources/claim)                                           | Requests for payment from insurers. The starting point of the billing cycle.                                                  |
| [`CoverageEligibilityRequest`](/docs/api/fhir/resources/coverageeligibilityrequest) | Asks "will insurance cover this?" before providing service.                                                                   |
| [`EnrollmentRequest`](/docs/api/fhir/resources/enrollmentrequest)                   | Requests to enroll a patient in an insurance plan or program.                                                                 |

### Events (aka "This Happened")

| Resource                                                                        | Description                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clinical Events**                                                             |                                                                                                                                                                   |
| [`Observation`](/docs/api/fhir/resources/observation)                           | Records measurements, test results, or assessments. Used for vital signs, lab results, social history, and much more. Most commonly used clinical event resource. |
| [`Procedure`](/docs/api/fhir/resources/procedure)                               | Records of procedures that were performed. Links to ServiceRequest that authorized them.                                                                          |
| [`Condition`](/docs/api/fhir/resources/condition)                               | Documented health conditions and diagnoses. Also known as "problems" in EHR-speak.                                                                                |
| [`Encounter`](/docs/api/fhir/resources/encounter)                               | A patient's interaction with healthcare providers. Could be an office visit, hospital stay, telemedicine call, etc.                                               |
| [`EpisodeOfCare`](/docs/api/fhir/resources/episodeofcare)                       | Groups related Encounters together. Think of a pregnancy or cancer treatment journey.                                                                             |
| [`ClinicalImpression`](/docs/api/fhir/resources/clinicalimpression)             | A clinician's assessment of a patient's situation, including their reasoning.                                                                                     |
| [`ImagingStudy`](/docs/api/fhir/resources/imagingstudy)                         | Details of imaging procedures performed.                                                                                                                          |
| [`Immunization`](/docs/api/fhir/resources/immunization)                         | Records of vaccines administered.                                                                                                                                 |
| **Medication Events**                                                           |                                                                                                                                                                   |
| [`MedicationDispense`](/docs/api/fhir/resources/medicationdispense)             | Tracks medication dispensing by pharmacies.                                                                                                                       |
| [`MedicationAdministration`](/docs/api/fhir/resources/medicationadministration) | Records when medications were given. Critical for inpatient medication tracking.                                                                                  |
| [`MedicationStatement`](/docs/api/fhir/resources/medicationstatement)           | A patient's report of what medications they're taking. May differ from what's prescribed!                                                                         |
| **Communication**                                                               |                                                                                                                                                                   |
| [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse)       | Completed forms, linked to their Questionnaire definition.                                                                                                        |
| [`Communication`](/docs/api/fhir/resources/communication)                       | Records of communications that occurred. The counterpart to CommunicationRequest.                                                                                 |
| **Clinical Documentation**                                                      |                                                                                                                                                                   |
| [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport)                 | Formatted reports about diagnostic studies. Includes everything from lab reports to radiology reads.                                                              |
| [`RiskAssessment`](/docs/api/fhir/resources/riskassessment)                     | Documents evaluated risks to a patient.                                                                                                                           |
| [`DeviceUseStatement`](/docs/api/fhir/resources/deviceusestatement)             | Records of when/how devices were used.                                                                                                                            |
| [`DocumentReference`](/docs/api/fhir/resources/documentreference)               | Points to clinical documents like discharge summaries, imaging reports, or scanned forms.                                                                         |
| **Administrative & Financial**                                                  |                                                                                                                                                                   |
| [`Coverage`](/docs/api/fhir/resources/coverage)                                 | Documents active insurance coverage.                                                                                                                              |
| [`ClaimResponse`](/docs/api/fhir/resources/claimresponse)                       | The insurer's response to a Claim. Usually includes what they'll pay and why.                                                                                     |
| [`PaymentReconciliation`](/docs/api/fhir/resources/paymentreconciliation)       | Detailed breakdown of how payments were applied to claims.                                                                                                        |
| [`PaymentNotice`](/docs/api/fhir/resources/paymentnotice)                       | Notification that a payment has been made.                                                                                                                        |
| [`SupplyDelivery`](/docs/api/fhir/resources/supplydelivery)                     | Documents delivery of requested supplies.                                                                                                                         |

## How These Patterns Connect: The Standard Relationships

Before we dive into a specific example, let's talk about how FHIR connects these different patterns. The specification defines several standard relationships that you'll see over and over:

- `basedOn` is the canonical way to connect an Event to the Request that triggered it. When something happens because someone asked for it, this is your go-to field.
- `instantiates` is how Events and Requests point to their Definition (like saying "I'm following this protocol")
- `partOf` shows parent-child relationships between Events or between Definitions
- `replaces` is used when a newer version supersedes an older Request or Definition

Understanding these standard relationships is key to using FHIR effectively. They're not just random fields - they're carefully chosen to represent common healthcare workflows.

## A Real Example: Handling Insurance Rejections

Let's make this concrete with a real-world example. Imagine you're building a system to handle insurance claim rejections. You need to track communications between customer service agents and pharmacy staff about resolving these rejections. How would you model this in FHIR?

Your first instinct might be to just create a bunch of Communication resources and call it a day. But understanding the workflow patterns helps us make better choices:

1. First, we need a Task (a Request resource) that represents the work of resolving the rejection
2. Then, we'll have multiple [`Communication`](/docs/api/fhir/resources/communication) resources (Event resources) that document the discussions about resolving it

But here's the tricky part: how should we link these together? FHIR gives us several options:

- `Communication.about`
- `Communication.basedOn`
- `Communication.partOf`

This is where understanding the patterns and their standard relationships really helps! Since we're linking an Event ([`Communication`](/docs/api/fhir/resources/communication) ) to the Request (Task) that triggered it, `basedOn` is the canonical choice - it's specifically designed for connecting Events to their triggering Requests. Here's what that looks like in practice:

```typescript
{
  resourceType: "Communication",
  basedOn: [{
    reference: "Task/insurance-rejection-123"
  }],
  status: "completed",
  payload: [{
    contentString: "Patient's new insurance card received. Resubmitting claim."
  }]
}
```

## Why This Matters for You

Understanding these patterns isn't just about knowing FHIR better (though that's nice too!). It's about making your life easier as a developer. When you understand these patterns, you can:

- Figure out which resource you need more quickly
- Predict what fields a resource probably has
- Make better decisions about how to connect resources
- Write more maintainable code

## The Big Picture

Healthcare workflows are complex - there's no way around that. But FHIR's patterns give us a structured way to handle this complexity. Next time you're working with FHIR resources, try asking yourself:

- Is this something being requested, something that happened, or a definition of how things should work?
- How does this resource relate to others in the workflow?
- What real-world process am I trying to model?

Understanding these patterns transforms FHIR from a seemingly random collection of resources into a coherent system for modeling healthcare workflows. And that makes building healthcare applications a whole lot more manageable!
