# Organizing Communications Using Threads

## Introduction

In a healthcare context, messages are sent all the time and can include many sceanrios (patient to physician, physician to physician, and more), so ensuring they are well-organized is vital. This guide covers how to model and organize threads using Mepdlum.

- How to build threads
- How to "tag" or group threads
- Querying for and sorting communications and threads

## Building and Structuring Threads

The FHIR `Communication` resource is a representation of any message sent in a healthcare setting. In the context of a thread, it is a single message that is a part of a conversation.

| Element       | Description                                                                                      | DataType                                                                                                                                                                                                                                                                                                                                                                                             | Relevant Valueset                                                                      | Example                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| payload       | Text, attachments, or resources that are being communicated to the recipient.                    | CommunicationPayload                                                                                                                                                                                                                                                                                                                                                                                 |                                                                                        | contentString: "You have an appointment scheduled for 2pm." |
| sender        | The entity (e.g. person, practice, care team, etc.) that sent the message.                       | ([Device](/docs/api/fhir/resources/device), [Organization](/docs/api/fhir/resources/organization), [Patient](/docs/api/fhir/resources/patient), [Practitioner](/docs/api/fhir/resources/practitioner), [PractitionerRole](/docs/api/fhir/resources/practitioner-role), [RelatedPerson](/docs/api/fhir/resources/related-person), [HealthcareService](/docs/api/fhir/resources/healthcare-service))[] |                                                                                        | Practitioner/id="123"                                       |
| recipient     | The entity (e.g. person, practice, care team, etc.) that received the message.                   | ([Device](/docs/api/fhir/resources/device), [Organization](/docs/api/fhir/resources/organization), [Patient](/docs/api/fhir/resources/patient), [Practitioner](/docs/api/fhir/resources/practitioner), [PractitionerRole](/docs/api/fhir/resources/practitioner-role), [RelatedPerson](/docs/api/fhir/resources/related-person), [HealthcareService](/docs/api/fhir/resources/healthcare-service))[] |                                                                                        | Practitioner/id="456"                                       |
| topic         | A description of the main focus of the message. Like the subject line of an email.               | [CodeableConcept](/docs/api/fhir/resources/codeable-concept)                                                                                                                                                                                                                                                                                                                                         | Custom Internal Code                                                                   | In person physical with Homer Simpson on April 10th, 2023   |
| category      | The type of message being conveyed. Like a tag that can be applied to the message. See Below.    | [CodeableConcept](/docs/api/fhir/resources/codeable-concept)[]                                                                                                                                                                                                                                                                                                                                       | [SNOMED Codes](http://hl7.org/fhir/R4/valueset-medication-form-codes.html)             | See below                                                   |
| partOf        | A reference to a larger resource which the `Communication` is a component. See Below.            | Resource[]                                                                                                                                                                                                                                                                                                                                                                                           |                                                                                        | See below                                                   |
| inResponseTo  | A reference to another `Communication` resource which the current one was created to respond to. | [Communication](/docs/api/fhir/resources/communication)[]                                                                                                                                                                                                                                                                                                                                            |                                                                                        | Communication/id="previous-communication"                   |
| medium        | The channel used for this `Communication` (e.g. email, fax, phone).                              | [CodeableConcept](/docs/api/fhir/resources/codeable-concept)[]                                                                                                                                                                                                                                                                                                                                       | [Participation Mode Codes](http://terminology.hl7.org/CodeSystem/v3-ParticipationMode) | code: EMAILWRIT, display: Email                             |
| subject       | A reference to the patient or group that this `Communication` is about.                          | [Patient](/docs/api/fhir/resources/patient), [Group](/docs/api/fhir/resources/group)                                                                                                                                                                                                                                                                                                                 |                                                                                        | Patient/id="789"                                            |
| encounter     | A reference to a medical encounter to which this `Communication` is tightly associated.          | [Encounter](/docs/api/fhir/resources/encounter)                                                                                                                                                                                                                                                                                                                                                      |                                                                                        | Encounter/id="example-appointment"                          |
| sent/received | The time that the message was either sent or received.                                           | string                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                        | "2023-04-10T10:00:00Z"                                      |

When building a thread, it is important to consider what type of resource should be used to group the thread together. Depending on the circumstances it makes sense to use different resources.

If the messages are between a patient and a provider, you should use an `Encounter` resource to group the thread. For more details, please see the [Representing Asynchronous Encounters](https://www.medplum.com/docs/communications/async-encounters) docs.

However, when a patient is not involved, threads should be grouped using the `Communication` resource with the `partOf` field. A `Communication` will be both a parent resource to represent the thread and a child resource to represent each individual message.

The `Communication.partOf` element represents a larger resource of which the current `Communication` is a component. It can reference any resource type, allowing us to refer to other `Communication` resources to create a thread. The `partOf` element creates a thread in which each message is linked to a single parent message.

When using the `partOf` field to create a thread, the parent `Communication` resource needs to be distinguished from the children. This is done simply by omitting a message in the `payload` field and a resource referenced in the `partOf` field, while all children will have both of these fields.

Once we have the parent resource, each message in the thread will create a new `Communication` resource, setting `partOf` to reference the parent `Communication`. As more messages are sent, each one will continue to point to the parent, creating a thread with a common reference point.

To help organize threads, it is also useful to use the `topic` field. The topic field is like the subject line of an email, and should be given the same level of specificity as you would provide a subject line.

:::Note

Because of how specific the `topic` field should be, it is best to use a custom coding rather than `LOINC` or `SNOMED` codes to classify the element.

:::

<details><summary>Example of a thread grouped using a `Communication` resource</summary>

```ts

// The parent communication
{
  resourceType: 'Communication',
  id: 'example-parent-communication',
  // There is no `partOf` of `payload` field on this communication
  // ...
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  }
}

// The initial communication
{
  resourceType: 'Communication',
  id: 'example-message-1',
  payload: [
    {
      id: 'example-message-1-payload',
      contentString: 'The specimen for you patient, Homer Simpson, has been received.'
    }
  ],
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  },
  // ...
  partOf: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-parent-communication'
      }
    }
  ]
}

// A second response, directly to `example-message-1` but still referencing the parent communication
{
  resourceType: 'Communication',
  id: 'example-message-2',
  payload: [
    {
      id: 'example-message-2-payload',
      contentString: 'Will the results be ready by the end of the week?'
    }
  ],
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  },
  // ...
  partOf: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-parent-communication'
      }
    }
  ]
  inResponseTo: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-message-1'
      }
    }
  ]
}

// A third response
{
  resourceType: 'Communication',
  id: 'example-message-3',
  payload: [
    {
      id: 'example-message-2-payload',
      contentString: 'Yes, we will have them to you by Thursday.'
    }
  ],
  topic: {
    text: 'Homer Simpson April 10th lab tests'
  },
  // ...
  partOf: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-parent-communication'
      }
    }
  ]
  inResponseTo: [
    {
      resource: {
        resourceType: 'Communication',
        id: 'example-message-2'
      }
    }
  ]
}

```

</details>

```mermaid

flowChart TD
  A[Parent Communication] --> B(The specimen for your patient, Homer Simpson, has been received.)
  A --> C(Will the results be ready by the end of the week?)
  A --> D(Yes, we will have them to you by Thursday)


```

## How to "Tag" or Group Threads

It can be useful to "tag", or group, threads so that a user can easily reference or interpret a certain type of message at a high level. For example, if there is a thread about a task that needs to be performed by a nurse, it can be tagged as such.

Tagging can be effectively done using the `Communication.category` element, which represents the type of message being conveyed. It allows messages to be classified into different types or groups based on specifications like purpose, nature, or intended audience. It is also important to note that the `category` field is an array, so each `Communication` can have multiple tags.

:::Note

When classifying the `Communication.category` field, it is best to use SNOMED codes. Specifically, for for practitioner roles and clinical specialty, SNOMED provides the [SNOMED Care Team Member Function](https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1099.30/expansion) valueset.

:::

<details><summary>Examples of Different Categories</summary>

```ts
{
  resourceType: 'Communication',
  id: 'example-communication',
  category: [
    {
      text: 'Doctor',
      coding: [
        {
          code: '158965000',
          system: 'http://snomed.info/sct'
        }
      ]
    },
    {
      text: 'Endocrinology',
      coding: [
        {
          code: '394583002',
          system: 'http://snomed.info.sct'
        }
      ]
    },
    {
      text: 'Diabetes self-management plan',
      coding: [
        {
          code: '735985000',
          system: 'http://snomed.info.sct'
        }
      ]
    }
    }
  ]
  // ...
}
```

</details>

:::tip Note

There are different ways that you can categorize threads, each one with its own pros and cons. For example, you can have threads with multiple `category` fields, one for specialty and one for level of credentials, etc., where you would search for multiple categories at once. The pros to this are that the data model is more self-explanatory, since each `category` is explicitly represented, and better maintainability, since it is easier to update and add individual categories. However, this can also lead to more complex queries.

Alternatively, you can have threads that have just one `category` that combines specialty, level of credentials, etc., and search for that specific category. This allows for simpler searching, needing only one `category` search parameter, and a simpler, more compact data model. The downside is that it may require more parsing and logic on the front-end to handle the combined categories and that as more combinations arise, maintaining the coding system may become difficult.

:::

## Searching for and Sorting `Communication` Resources

`Communication` resources are easily searchable using the [Medplum Client SDK](/docs/sdk/classes/MedplumClient) `searchResources` method. Throughout this section, we will use an example of threading using `partOf` to reference a single parent `Communication` resource.

When searching for threads, we need to differentiate between threads that are grouped by the `Communication` resource and those that are grouped with the `Encounter` resource. We'll begin with threads grouped by `Communication`.

To search for all threads in the system, we need to find each parent `Communication` resource. One of the factors that differentiates a "thread-level", or parent, resource from a "message-level", or child, resource is that thread-level resources do not have a value in the `partOf` field.

**Example: **

```ts
// Search for a Communication-grouped thread
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  _revinclude: 'Communication:part-of',
});
```

```curl
curl https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&_revinclude=Communication:part-of
```

In this example, we use the `:missing` search modifier to search for any `Communication` resources that do not reference another resource in their `partOf` field. However, this would only provide us with the parent `Communication` and none of the actual messages that are part of the thread. In order to get those messages, we use the `_revinclude` search paramter. This parameter adds any `Communication` resources whose `partOf` field references one of the original search results. If you only need the parent resource, you can omit the `_revinclude` field.

Searching for threads grouped by `Encounter` is a little different. Since there is no link from the parent `Encounter` to the child messages, we still search for `Communication` resources at the top level.

```ts
/*
curl https://api.medplum.com/fhir/R4/Communication?encounter:missing=false&_include=Communication:encounter
*/

// Search for an Encounter-grouped thread
await medplum.searchResources('Communication', {
  'encounter:missing': false,
  _include: 'Communication:encounter',
});
```

In this example, we set the `encounter:missing` parameter to false, to include only `Communication` resources that reference an encounter. We then use `_include` to include those `Encounter` resources in our search results. Note that this search will include all of the messages as well as the parent resources.

Once you have found the thread you want, you may want to retrieve the messages from only that specific thread, in order. In the above example, though we retrieved the messages with each thread, there is no guarantee that they will be in the correct order. You can also filter down results so that you only get the messages specific to the thread you want.

Again, we will separate how to search for `Communication` and `Encounter` grouped threads, beginning with `Communication`.

**Example: **

```ts
/*
curl https://api.medplum.com/fhir/R4/Communication?part-of=Communication/123&_sort=sent
*/

const communication = { resourceType: 'Communication', id: '123' };
await medplum.searchResources('Communication', {
  `part-of`: 'Communication/123',
  _sort: 'sent'
});

// OR

await medplum.searchResources('Communication', {
  'part-of': getReferenceString(communication),
  _sort: 'sent'
});
```

In the above example, we search for `Communication` resources that reference our thread in the `partOf` field. This can be done by passing in the reference string or, if you have the `Communication` resource for the thread you want, by using the `getReferenceString` utility method to help construct your query. In addition, we use the `_sort` parameter to sort the results based on the `sent` element. This element represents the time that a `Communication` was sent. You could also use the `received` element, which represents the time that a `Communication` was received. For more details on using the search functionality, see the [Search docs](/docs/search/index).

To search for specific threads that are grouped by `Encounter`:

```ts
/*
curl https://api.medplum.com/fhir/R4/Communication?encounter=Encounter/456&_include=Communication:encounter&_sort=sent
*/

const encounter = { resourceType: 'Encounter', id: '456' };
await medplum.searchResources('Communication', {
  encounter: 'Encounter/456',
  _include: 'Communication:encounter',
  _sort: 'sent',
});

// OR

await medplum.searchResources('Communication', {
  encounter: getReferenceString(encounter),
  _include: 'Communication:encounter',
  _sort: 'sent',
});
```

In this example, we search for any `Communication` resource that references our `Encounter` in the `encounter` field. We also `_include` that `Encounter`, though you can leave this out if you only want to return the messages themselves. We then use `_sort` to get them in the order they were sent.
