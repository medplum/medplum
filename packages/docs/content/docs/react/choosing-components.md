---
title: Choosing React Components
weight: 35
description: Choose FHIR field controls, resource forms, and clinical workspaces for your application.
---

Medplum's React library covers individual FHIR fields, general resource interfaces, and complete clinical workspaces. Choose a component based on how much of the interaction you want it to provide, then connect its callbacks to your application's routing and save behavior.

## Field and resource controls

Use these controls when you own the page layout and workflow.

| Task                                        | Starting point      | What your application supplies                                 |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Display a resource's name                   | `ResourceName`      | A resource or reference                                        |
| Select a referenced record                  | `ResourceInput`     | Resource type, current value, and selection handling           |
| Edit a FHIR resource                        | `ResourceForm`      | Initial resource, save callback, and server validation outcome |
| Collect a structured questionnaire response | `QuestionnaireForm` | Questionnaire, response context, and submission handling       |
| Browse a resource type                      | `SearchControl`     | Search configuration and navigation or selection handling      |

The [application guide](/docs/react/building-an-application) includes standalone search and create examples. For questionnaires, also read [Modeling Questionnaires and Responses](/docs/questionnaires/questionnaires-and-responses) and decide how the response becomes downstream clinical resources.

## Patient and operational workspaces

These components assemble several controls into a workflow. They reduce layout work while leaving domain choices, external integrations, and authorization to your application and project configuration.

| Workflow                                  | Component        | Public implementation to study                                                                                                                |
| ----------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient context alongside a workflow      | `PatientSummary` | [PatientSummary source and stories](https://github.com/medplum/medplum/tree/main/packages/react/src/PatientSummary)                           |
| A list with a selected item's detail pane | `ResourceBoard`  | [Provider medication workspace](https://github.com/medplum/medplum/blob/main/examples/medplum-provider/src/pages/patient/MedicationsPage.tsx) |
| Patient and practitioner conversations    | `ThreadInbox`    | [Provider Messages page](https://github.com/medplum/medplum/blob/main/examples/medplum-provider/src/pages/messages/MessagesPage.tsx)          |
| Lab orders and reports                    | `LabOrdersPanel` | [Provider Labs page](https://github.com/medplum/medplum/blob/main/examples/medplum-provider/src/pages/patient/LabsPage.tsx)                   |

For example, `LabOrdersPanel` handles the order and report views while the Provider page supplies routing and the order-entry modal. Reusing the panel in your own application still requires a decision about how orders reach a lab. Similarly, a messaging inbox needs the [thread data model](/docs/communications/messaging-data-model) and configured delivery channels for external messaging.

## Adapt an example in three steps

1. **Identify its data contract.** Read the component's props and the resource types it expects. Decide which records your users can read and write.
2. **Connect the application behavior.** Wire selection to your routes, saves to the API, and successful writes to a visible refresh. Keep filters and selected record IDs in the URL when users need shareable workspaces.
3. **Exercise the whole workflow.** Try loading, empty results, pagination, errors, permission restrictions, and the state after a successful save. Review narrow-screen behavior if the workflow will be used on mobile devices.

Use the [component catalog](https://storybook.medplum.com/) to explore interactive examples and the public source directories for props, stories, and tests. The [React setup guide](/docs/react) covers the required providers and styles.
