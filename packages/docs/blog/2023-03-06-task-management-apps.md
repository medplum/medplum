---
slug: task-management-apps
title: Task Management Apps
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [react, fhir-datastore]
---

# Task Management Apps

Great workflow apps are core for us at Medplum, and we provide tools to build **highly ergonomic asynchronous task tracking systems providers**. Some examples of task management apps in the medical context are apps that:

- Review and approve lab reports
- Approve or reject medication refill requests
- Instantiate custom care plans for a patient

Medical systems in general and FHIR in specific have robust workflow resources to create, track and implement workflows. [Tasks](/docs/api/fhir/resources/task) and [ServiceRequests](/docs/api/fhir/resources/servicerequest) are the most common workflow resources for asynchronous work.

## Setting up Queues or Worklists

The core or a workflow app is a **queue** or sometimes called a **worklist**. This is exactly what it sounds like - a list of tracking tasks that represent the work to be done and it's current status. The FHIR [Tasks](/docs/api/fhir/resources/task) as a group are often used to represent a queue. Tasks can be created programmatically, or via [Questionnaire and Bot](/docs/bots/bot-for-questionnaire-response).

When populating the Task resource, it can be useful to populate the following fields:

- `Task.focus` - this is what the task is about, for example you can link it to a DiagnosticReport, MedicationRequest or CarePlan
- `Task.businessStatus` - this can be used for custom workflow, where you can set your own statuses that fit your workflow
- `Task.code` - this can be useful to cue the Task specific user interface (below), example might be "Lab Review"
- `Task.executionPeriod` - this can be useful for productivity tracking
- `Task.for` - this is usually a link to the Patient

Once you have created some Tasks you can view [Tasks in the Medplum App](https://app.medplum.com/Task?_count=20&_fields=id,_lastUpdated,businessStatus,status,intent,owner,focus,code&_offset=0&_sort=-_lastUpdated).

Once you have confirmed that tasks are formed the way you want them to be, you can embed a search control in your Task tracking application, there are examples in the sample application.

Like in the [Medplum App](https://app.medplum.com/Task), it is recommended that you have one page in your app that supports permalinking to a specific task search as it is useful for collaboration, integrating into chat apps and other common workflow tooling scenarios.

## Task specific User interface

For each task, you will want to show a user interface that gives the user some context on how to resolve or take action on that task. This is very workflow dependent so customizability is important. You can see a video (70 seconds) on this topic [here](https://youtu.be/6bKrcT5SuOQ).

The exact components of the Task specific user interface are often driven by `Task.focus` or `Task.code`.

## Dashboards

Turnaround times and productivity tracking are crucial for observing the health of your task-based workflow. Assuming you populate the timestamps correctly in the resources, it is straightforward to calculate how many work hours a certain task takes, or the turnaround time.

Here is an example of a timestamp calculation:

- Turnaround Time for a Task: `Task.executionPeriod.end - Task.authoredTime`
- Work hours for a task: `Task.executionPeriod.end - Task.executionPeriod.start`

Using these calculations, it is straightforward to make a dashboard that gives a very clear picture into the status and health of your queues. In this example below, each of the graphs is a representation of a Task search, with results bucketed by turnaround time or by work hours.

![TAT Dashboard Sample](/img/blog/tat-dashboard-sample.jpg)

## Related Resources

- [Sample Task App](https://github.com/medplum/medplum-task-demo) Github repository
- Task center stage [video](https://youtu.be/6bKrcT5SuOQ)
- [Task Resource](/docs/api/fhir/resources/task) Documentation
- Tasks in the [Medplum App](https://app.medplum.com/Task)
