---
title: Messages
weight: 5100
description: Start patient conversations, manage the Provider inbox, and connect messaging to follow-up workflows.
---

Use **Messages** in Medplum Provider to hold a conversation about a patient with one or more practitioners. A conversation groups its participants, topic, and messages into a thread. You can work across patients from the main Messages page or open a patient's chart to see that patient's conversations.

This guide describes the standard Provider application. Your organization may customize its navigation and available actions.

{{< info title="Before you start" >}}
Sign in to Provider and make sure the [patients and practitioners](/docs/provider/getting-started) you need are available in your project.
{{< /info >}}

## Start a conversation

1. Open **Messages** and select **New Message**, the plus button above the thread list. You can also use the **New Message** action in the search menu.
2. Select the patient and at least one practitioner. Your practitioner profile is selected initially when you are signed in as a practitioner.
3. Enter an optional topic that helps the team recognize the conversation.
4. Select **Next** to create the thread and open it.
5. Write and send the first message in the conversation.

The patient and practitioner selections establish the conversation's participants. Creating the thread prepares the conversation; the message composer adds its content. When you start from a patient's chart, the patient is already selected.

## Work through the inbox

The inbox separates **In Progress** conversations from **Completed** conversations.

- **Read and reply:** select a thread to open its messages. The main Messages page also shows the patient summary for context.
- **Find a conversation:** narrow the list with filters, and use pagination to view additional conversations.
- **Return to a thread:** save its URL. Anyone opening that URL still needs access to the underlying records.

On the main Messages page, the composer supports attachments. Confirm that the selected conversation and patient are correct before uploading a file. See [Message Attachments](/docs/communications/sending-messages-and-attachments) for the underlying file model.

## Update or complete a conversation

Open **Message Settings** to review or update the patient, practitioners, and topic. Follow your organization's process when changing participants in an existing conversation.

When the conversation's work is finished, open its status menu and choose **Completed**. The thread moves to the Completed view and remains available for review. Completion describes the thread's workflow status; any follow-up task or external communication needs its own completion process.

## Delivery and follow-up

{{< note title="Patient notifications require an integration" >}}
Messages in Provider are stored in Medplum. Delivery to SMS, email, or another system requires a configured integration. Check its delivery status when confirming that a patient received an external notification.
{{< /note >}}

See [External Messaging Integration Patterns](/docs/communications/external-messaging-integration-patterns) for delivery options.

If a conversation needs work outside the thread, create or assign a [Task](/docs/provider/tasks) according to your team's workflow. Agree on who monitors the inbox and who owns follow-up before using it for operational communication.

## Troubleshooting

| What you see                           | What to check                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next** is disabled                   | Select a patient and at least one practitioner.                                                                                                       |
| A conversation is missing              | Check the In Progress/Completed view, filters, current patient, and project. Ask an administrator to check access if the record is still unavailable. |
| A patient has no external notification | Check the configured SMS or email integration and its delivery status.                                                                                |

## Building a custom messaging workflow

For developers, the [Messaging & Communications guide](/docs/communications) explains the FHIR data model, thread queries, participant management, and automation. The public [Provider Messages page](https://github.com/medplum/medplum/blob/main/examples/medplum-provider/src/pages/messages/MessagesPage.tsx) demonstrates how to compose these workflows with `ThreadInbox`.
