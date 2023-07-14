---
tags:
  - care plans
  - workflow
  - tasks
---

# Using `Tasks` to Manage Workflow

## Introduction

Workflow is an essential part of healthcare, and healthcare operations requiring coordination of many manual steps physicians, patients, nurses, care coordinators, etc. 

While the majority of FHIR resources represent clinical data that is *operated on*, FHIR also defines a set of workflow resources that describe and track *work to be done.* This guide will discuss the usage of the [`Task`](/docs/api/fhir/resources/task) resource, which is the basic building block resource for tracking workflow progress. 

A common application is for organizations to build **task queue systems** to route tasks to the correct practitioner based on specialty, level of credential, and availability. The [Medplum Task Demo](https://github.com/medplum/medplum-task-demo) application provides a minimalist task queue that demonstrates task search, assignment, and status. 

## Task type

The `Task.code` element is used to represent the task type, equivalent to the task title. This can either be different from task to task, or selected from an standard set of task types. Using the latter approach helps enable querying across all `Tasks` of the same type.

`Task.description` can be used to add additional descriptive text to the specific `Task` instance.

## Task status

- Designing status codes for tasks varies from implementation to implementation, and requires some design work. 

- `Task` provides three fields fields, `status` , `businessStatus`, and `statusReason`

  - `status` maps to a fixed set of values, and provides coarse-grained information about the activity state of a `Task`.
  - `businessStatus` provides fine-grained information about how the `Task` is progressing through your operational funnel. 
  - `statusReason` describes *why* the `Task` has the current status, and is most commonly used when `status` is set to `"on-hold"` or `"cancelled"`. 

  

  `Task.status` maps to the FHIR task life cycle shown below. It is most useful for day-to-day operations, as it allows for efficient queries on active, completed, and cancelled tasks. Using standard codes means these





- basic status
  - standard statuses to fit into the common task state machine. Useful to build generic tools, and build robust queries
  - Eg. show me all tasks that are active
- business status
  - More detailed statuses that map to your application, and give users pointers to the action that needs to be taken
- Status Reason



:::tip A note on analytics

Primary stakeholder is clinical and operations teams

Secondary stakeholders are analytics teams to optimize workflows.  

:::



I would recommend using the `on-hold` value for Task.status, and then using the 'statusReason` field to indicate why this is on hold. 

While not hard-and-fast rules, businessStatus can often refer to where the task is in your operational funnel. Using an orthogonal statusReason allows you to efficiently query for all tasks at the same point in the funnel (same business status), and then further break down by all the reasons they may be on hold. 

This will be REALLY impactful for your business analytics teams, who are going to want to report metrics across various different slices



Yes, 100% agree with the above. Use statusReason to mark why a task is cancelled or suspended. This will be of great use to your CX team



Rahul Agarwal

9:35 AM Mar 6

Agree that businessStatus can probably be optional for now. The real stakeholders that should be looped in here are Ops (cc: @[michael.caves@thirtymadison.com](mailto:michael.caves@thirtymadison.com) ). They will probably have specific statuses related to their funnel and checkpoints.

Because businessStatus is a searchable field, you'll be able to create dashboards that filter on this status

## Task priority

The task

## Task assignment

`Task.owner` indicates the party responsible for *performing* the task. This can either be an individual (`Practitioner`, `PractitionerRole`, `Patient`, `RelatedPerson`) or a group (`Organization`, `HealthcareService`, `CareTeam`).

`Task.for` indicates who *benefits* from the task, and is most commonly the patient for whom care is being delivered. 

### Assigning tasks to roles

A common pattern is telehealth practices to assign to assign tasks to all practitioners with a given role (e.g. clinical specialty, level of credential, etc.). `Task.performerType` is a searchable element that can be used to indicate which roles can/should perform this task. 

It is a best practice to select these roles from a standard code system to promote interoperability. The [US Core Guidelines]() recommend using the [SNOMED Care Team Member Function](https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1099.30/expansion) valueset for `performerType`. The table below contains SNOMED code for the common roles used in digital healthcare. 

In rare instances, SNOMED might not contain an appropriate code for a given role (e.g. Customer Service Representative). Medplum recommends using the [Standard Occupational Classification (SOC)](https://www.bls.gov/soc/) codes published by the Bureau of Labor Statistics. 

| Name | SNOMED Code | SOC Code | See Also |
| ---- | ----------- | -------- | -------- |
| Doctors | 158965000 ([Doctor](https://browser.ihtsdotools.org/?perspective=full&conceptId1=158965000&edition=MAIN/2023-03-31&release=&languages=en)) | | |
| Nurse Practitioner | 224571005 ([Nurse Practitioner](https://browser.ihtsdotools.org/?perspective=full&conceptId1=224571005&edition=MAIN/2023-03-31&release=&languages=en)) | | |
| Registered Nurse | 224535009 ([Registered Nurse](https://browser.ihtsdotools.org/?perspective=full&conceptId1=224535009&edition=MAIN/2023-03-31&release=&languages=en)) | | |
| Care Coordinator | 768820003 ([Care Coordinator](https://browser.ihtsdotools.org/?perspective=full&conceptId1=768820003&edition=MAIN/2023-03-31&release=&languages=en)) | | |
| Care Team Coordinator | 768821004 ([Care Team Coordinator](https://browser.ihtsdotools.org/?perspective=full&conceptId1=768821004&edition=MAIN/2023-03-31&release=&languages=en)) | | |
| Medical Billing Specialist | 1251542004 ([Medical Coder](https://browser.ihtsdotools.org/?perspective=full&conceptId1=1251542004&edition=MAIN/2023-04-30&release=&languages=en)) | | |
| Quality Assurance | 56542007 ([Medical record administrator (occupation)](https://browser.ihtsdotools.org/?perspective=full&conceptId1=56542007&edition=MAIN/2023-04-30&release=&languages=en)) | | |
| Physician Assistant | 449161006 ([Physician assistant](https://browser.ihtsdotools.org/?perspective=full&conceptId1=449161006&edition=MAIN/2023-03-31&release=&languages=en)) | | |

Below is an example of a `Task.performerType` [CodeableConcept](/docs/fhir-basics#codeable-concepts-standarding-data) using both SNOMED and SOC systems.

```ts
{
  resourceType: 'Task',
  // ... 
  performerType: [
    {
      text:'Medical Billing Specialist',
      coding:[
        // Snomed
        {
          code:'1251542004',
          system: 'http://snomed.info/sct',
          display: 'Medical Coder'
        },
        // US SOC
        {
          code:"SOC CODE" //This corresponds to doctor
          system: "https://www.bls.gov/soc"
        }
      ],
    }
  ]
}
```

## Task focus

The `Task.focus` element tracks the FHIR resource being *operated on* by this task, known as the "focal resource". See the [Examples](#examples) section below for examples of focal resources in common scenarios.

Well maintained `Task.focus` elements are critical data hygiene that streamlines operations and analytics . Making sure that every `Task` has a populated`focus` reference will make it easier to find all touch points for a given clinical resource, spot operational bottlenecks and calculate turn-around-times, conversions, and care quality metrics as your implementation scales.

## Task start / due dates

The `Task.restriction.period` field describes the time period over which the `Task` should be fulfilled, with `Task.restriction.period.end` representing the *due date*, and `Task.restriction.period.start` representing the (potentially optional) start date.

## Subtasks

`Tasks` can be organized into a hierarchical structure to create subtasks, sub-tasks, etc. To represent this hierarchy, subtasks should reference their parent using the using the `Task.partOf` element. `Task.partOf` is a searchable field, which can be used to query all sub-tasks of a given task, and can be combined with the [`_revinclude`](/docs/search/includes#_include-and-_revinclude) and [`:iterate`](/docs/search/includes#iterate-modifier) directives to query the entire `Task` tree. 

:::caution

While this functionality is powerful, it can be hard to maintain and operationalize. Medplum recommends that most implementations start with a single-level `Task` hierarchy, and gradually add depth over time.

::: 

## Examples

- Example, the ServiceRequest may indicate an order for a lab
  - Might need to be authorized, filled, reviewed
- Review Diagnostic Report
- Patient Collect medical history / fill out questionnaire
- Write notes for encounter

## See Also

- The [FHIR Workflow Spec](http://hl7.org/fhir/R4/workflow.html)
- [Medplum Task Demo](https://github.com/medplum/medplum-task-demo)
