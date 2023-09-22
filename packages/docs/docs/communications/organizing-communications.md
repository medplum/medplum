import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

import ExampleCode from '!!raw-loader!@site/..//examples/src/communications/organizing-communications.ts';

# Organizing Communications Using Threads

## Introduction

In a healthcare context, messages are sent all the time and can include many scenarios (patient to physician, physician to physician, and more), so ensuring they are well-organized is vital. This guide covers how to model and organize threads using Medplum.

- Representing individual messages
- Building and structuring threads
- How to "tag" or group threads
- Searching for and sorting communications and threads

## Representing Individual Messages

The FHIR `Communication` resource is a representation of any message sent in a healthcare setting. This can include emails, SMS messages, phone calls and more.

| **Element**       | **Description**                                                                                  | **Relevant Valueset**                                                                  | **Example**                                               |
| ----------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `payload`         | Text, attachments, or resources that are being communicated to the recipient.                    |                                                                                        | You have an appointment scheduled for 2pm.                |
| `sender`          | The person or team that sent the message.                                                        |                                                                                        | Practitioner/doctor-alice-smith                           |
| `recipient`       | The person or team that received the message.                                                    |                                                                                        | Practitioner/doctor-gregory-house                         |
| `topic`           | A description of the main focus of the message. Similar to the subject line of an email.         | Custom Internal Code                                                                   | In person physical with Homer Simpson on April 10th, 2023 |
| `category`        | The type of message being conveyed. Like a tag that can be applied to the message.               | [SNOMED Codes](http://hl7.org/fhir/R4/valueset-medication-form-codes.html)             | [See below](#building-and-structuring-threads)            |
| `partOf`          | A reference to another resource which the `Communication` is a component.                        |                                                                                        | [See below](#how-to-"tag"-or-group-threads)               |
| `inResponseTo`    | A reference to another `Communication` resource which the current one was created to respond to. |                                                                                        | Communication/previous-communication                      |
| `medium`          | The technology used for this `Communication` (e.g. email, fax, phone).                           | [Participation Mode Codes](http://terminology.hl7.org/CodeSystem/v3-ParticipationMode) | email                                                     |
| `subject`         | A reference to the patient or group that this `Communication` is about.                          |                                                                                        | Patient/homer-simpson                                     |
| `encounter`       | A reference to a medical encounter to which this `Communication` is tightly associated.          |                                                                                        | Encounter/example-appointment                             |
| `sent`/`received` | The time that the message was either sent or received.                                           |                                                                                        | 2023-04-10T10:00:00Z                                      |
| `status`          | The status of transmission                                                                       | [Event Status Codes](http://hl7.org/fhir/R4/valueset-event-status.html)                | in-progress                                               |

:::tip The `Communication` lifecycle

Most messaging based workflows track messages through three stages: **sent**, **received**, and **read**.

While FHIR standard doesn't offer specific guidance on representing this lifecycle, Medplum recommends the following model:

| Stage    | Representation                          |
| -------- | --------------------------------------- |
| sent     | `Communication.sent` is populated       |
| received | `Communication.received` is populated   |
| read     | `Communication.status` is `"completed"` |

:::

## Building and Structuring Threads

Beyond producing individual messages, most healthcare communication tools group messages into "threads". When building a thread in FHIR, it is important to consider what type of resource should be used to group the thread together. Depending on the circumstances it makes sense to use different resources.

### Threads Involving Patients

If the messages are between a patient and a provider, you should use an `Encounter` resource to group the thread. An `Encounter` can be any interaction between a patient and provider, including various types of messages, so it is important that these are classified correctly. Using an `Encounter` resource to represent patient visits also makes it easier to submit claims to insurance to be reimbursed. For more details, please see the [Representing Asynchronous Encounters](https://www.medplum.com/docs/communications/async-encounters) docs.

### Threads Between Providers

However, when a patient is not involved, threads should be grouped using the `Communication` resource. A thread will have a two-level hierarchy – one parent `Communication` resource that represents the thread itself, and child `Communication` resources that represent each individual message. The child resources should be linked to the parent using the `partOf` field, which represents a parent resource of which the current `Communication` is a component. This allows you to refer to the parent resource to create a thread where each message is linked to the parent as a common reference point.

In these threads, the parent resource needs to be distinguished from the children. Since the parent resource will not have any content or refer to a parent of its own, this can be done by omitting a message in the `payload` field and a resource reference in the `partOf` field.

Additionally, to help organize threads, it is useful to use add a `topic` element to give the thread a subject. Similar to the subject line of an email, the `topic` should be given a high level of specificity to help distinguish the thread. The `topic` should be assigned to both the parent and children `Communication` resources in any thread.

:::tip Coding the topic field

Because of how specific the `topic` field should be, it is best to use a custom coding rather than `LOINC` or `SNOMED` codes to classify the element.

:::

<details><summary>Example of a thread grouped using a Communication resource</summary>
  <MedplumCodeBlock language="ts" selectBlocks="communicationGroupedThread">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

```mermaid

flowchart BT
    A[<b>Communication </b> <br/> Homer Simpson April 10th lab tests]
    B(<b>Communication</b> <br/> The specimen for you patient, Homer <br/> Simpson, has been received.) -->|partOf| A
    C(<b>Communication</b> <br/> Will the results be ready by the end <br/> of the week?) -->|partOf| A
    D(<b>Communication</b> <br/> Yes, we will have them to you <br/> by Thursday.) -->|partOf| A

```

## How to Tag or Group Threads

It can be useful to "tag", or group, threads so that a user can easily reference or interpret a certain type of message at a high level. For example, if there is a thread about a task that needs to be performed by a nurse, it can be tagged as such.

Tagging can be effectively done using the `Communication.category` element, which represents the type of message being conveyed. It allows messages to be classified into different types or groups based on specifications like purpose, nature, or intended audience.

When assigning a `category` to a thread, it should be included on both the parent and child `Communication` resources. It is also important to note that the `category` field is an array, so each `Communication` can have multiple tags.

Here are some common types of tags that can be used for grouping:

| Type of Tag         | Codesystem                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level of credential | [SNOMED Care Team Member Function valueset](https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1099.30/expansion)                              |
| Clinical specialty  | [SNOMED Care Team Member Function valueset](https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1099.30/expansion)                              |
| Product offering    | [SNOMED](http://hl7.org/fhir/R4/valueset-medication-form-codes.html), [LOINC](https://www.medplum.com/docs/careplans/loinc), Custom Internal Coding |

<details><summary>Example of Multiple Categories</summary>
  <MedplumCodeBlock language="ts" selectBlocks="communicationCategories">
    {ExampleCode}
  </MedplumCodeBlock>
</details>

:::tip Designing category schemes

There are different ways that you can categorize threads, each one with its own pros and cons. For example, you can have threads with multiple `category` fields, one for specialty and one for level of credentials, etc., where you would search for multiple categories at once. The pros to this are that the data model is more self-explanatory, since each `category` is explicitly represented, and better maintainability, since it is easier to update and add individual categories. However, this can also lead to more complex queries.

Alternatively, you can have threads that have just one `category` that combines specialty, level of credentials, etc., and search for that specific category. This allows for simpler searching, needing only one `category` search parameter, and a simpler, more compact data model. The downside is that it may require more parsing and logic on the front-end to handle the combined categories and that as more combinations arise, maintaining the coding system may become difficult.

:::

## Searching for and Sorting `Communication` Resources

### Searching for All Threads in a System

When searching for threads, we need to differentiate between threads that are grouped by the `Communication` resource and those that are grouped with the `Encounter` resource. We'll begin with threads grouped by `Communication`.

To search for all threads in the system, we need to find each parent `Communication` resource. One of the factors that differentiates a "thread-level", or parent, resource from a "message-level", or child, resource is that thread-level resources do not have a value in the `partOf` field.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchParentThreadsTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchParentThreadsCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchParentThreadsCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

In this example, we use the `:missing` search modifier to search for any `Communication` resources that do not reference another resource in their `partOf` field. This gives us the parent `Communication` of all threads in the system.

### Searching For All Messages in a Thread

Once you have found the thread you want, you may want to retrieve the messages from only that specific thread, in order. In the above example, though we retrieved the messages with each thread, there is no guarantee that they will be in the correct order. You can also filter down results so that you only get the messages specific to the thread you want.

Again, we will separate how to search for `Communication` and `Encounter` grouped threads, beginning with `Communication`.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchSpecificThreadTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchSpecificThreadCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchSpecificThreadCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

In the above example, we search for `Communication` resources that reference our parent in the `partOf` field and sort by the `sent` field. For more details on using the search functionality, see the [Search docs](https://www.medplum.com/docs/search/basic-search).

To search for specific threads that are grouped by `Encounter`:

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchEncounterThreadTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchEncounterThreadCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchEncounterThreadCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

In this example, we search for any `Communication` resource that references our `Encounter` in the `encounter` field. We also `_include` that `Encounter`, though you can leave this out if you only want to return the messages themselves. We then use `_sort` to get them in the order they were sent.

### Putting It All Together

To put this all together, we can also search for all threads and return their messages with them.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchThreadsWithMessagesTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchThreadsWithMessagesCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchThreadsWithMessagesCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

Here we are using the same initial search to return all of the parent threads in the system. However, we include the `_revinclude` parameter, allowing us to also search for all `Communication` resources that reference one of our search results in the `partOf` field. This allows us to return all of the child messages as well.

Searching for threads grouped by `Encounter` is a little different. Since there is no link from the parent `Encounter` to the child messages, we still search for `Communication` resources at the top level.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchEncountersWithMessagesTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchEncountersWithMessagesCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchEncountersWithMessagesCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

In this example, we set the `encounter:missing` parameter to false, to include only `Communication` resources that reference an encounter. We then use `_include` to include those `Encounter` resources in our search results. Note that this search will include all of the messages as well as the parent resources.

You can also filter down your searches further by including additional parameters.

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchFilteredThreadsTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchFilteredThreadsCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchFilteredThreadsCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

<Tabs groupId="language">
  <TabItem value="ts" label="Typescript">
    <MedplumCodeBlock language="ts" selectBlocks="searchFilteredEncountersTs">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="cli" label="CLI">
    <MedplumCodeBlock language="bash" selectBlocks="searchFilteredEncountersCli">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
  <TabItem value="curl" label="cURL">
    <MedplumCodeBlock language="bash" selectBlocks="searchFilteredEncountersCurl">
      {ExampleCode}
    </MedplumCodeBlock>
  </TabItem>
</Tabs>

Here we build upon our search by adding the `subject` parameter to search for all threads that are related to a given patient. For other items to filter your search on, see the [`Communication` Search Parameters](https://www.medplum.com/docs/api/fhir/resources/communication#search-parameters).
