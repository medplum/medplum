# Organizing Communications

## Introduction

The `Communication` resource represents any messages in a healthcare context. It can include many scenarios – patient to physician, physician to physician, device to physician, and more. This results in a large volume of communications within this context, so ensuring that they are well organized is vital.

This guide covers different ways that you can organize the `Communication` resource. It will cover:

- Common organization patterns
  1. How to build and organize threads
  2. How to "tag" threads and messages
  3. How to use different Codesystems to classify messages
- Querying for and sorting communications and threads

## Communication Organization Patterns

### Building and Organizing Threads

The `Communication` resource cann be used to model threading, allowing you to connect multiple related messages that are part of the same discussion. Threading can best be modeled using the `Communication.topic`, `Communication.partOf`, and `Communication.inResponseTo` elements.

The `Communication.topic` element represents a description of the main focus or content of the message. It allows you to link the communication to a specific topic or subject matter. It is easy to think of the topic as if it is the subject line of an email for a given communication. In that sense, it is useful to use that level of specificity when defining a topic. For example, a topic could be an appointment for a given patient on a given date. By assigning this topic to all `Communication` resources that are related to that appointment, you can create a thread of messages about the appointment. An example of this is below:

**Example: **

```ts
{
  resourceType: 'Communication',
  id: 'example-communication',
  payload: [
    {
      id: 'example-communication-payload',
      contentString: 'Your appointment for a physical on April 10th, 2023 is confirmed.'
    }
  ],
  topic: {
    text: 'In-person physical with Homer Simpson on April 10th, 2023.',
    coding: [
      {
        code: 'in-person-appointment-physical-04-10-23',
        system: 'http://example-practice.com',
        display: 'In-person appointment for a physical - Homer Simpson - 04-10-2023'
      }
    ]
  }
}
// Although this message is a reminder rather than a confirmation, it references the same appointment, so the same topic is used to thread these together.
{
  resourceType: 'Communication',
  id: 'example-communication-2',
  payload: [
    {
      id: 'example-communication-2-payload',
      contentString: 'This is a reminder that you have an appointment tommorrow, April 10th.'
    }
  ]
  topic: {
    text: 'In-person physical with Homer Simpson on April 10th, 2023.',
    coding: [
      {
        code: 'in-person-appointment-physical-04-10-23',
        system: 'http://example-practice.com',
        display: 'In-person appointment for a physical - Homer Simpson - 04-10-2023'
      }
    ]
  }
}
```

The `Communication.partOf` element represents a larger resource of which the `Communication` is a component. It can reference any resource type, allowing us to refer to other `Communication` resources to create a thread. The `partOf` element is used to create a thread in which each message is linked to a single parent message.

When using the `partOf` field to create a thread, the parent `Communication` resource needs to be distinguished from the children. This is done simply by omitting a message in the `payload` field and a resource referenced in the `partOf` field, while all children will have both of these fields.

Once we have the parent resource, each message in the thread will create a new `Communication` resource, setting `partOf` to reference the parent resource. As more messages are sent, each one will continue to point to the parent, creating a thread with a common reference point.

It is also important to consider when it is appropriate to use the [`Encounter`](/docs/api/fhir/resources/encounter) resource as a top-level grouping mechanism instead of the `Communication` resource. An "encounter" refers to any diagnostic or treatment interaction between a patient and provider, and, in a digital health context, can include SMS chains, in-app threads, and email. The `partOf` field can reference any resource type, so when an "enconter" occurs, threads should be created with the `Encounter` resource as the parent. For more details, see the [Representing Asynchronous Encounters](/docs/communications/async-encounters/async-encounters) docs.

In the example below, each message in the thread references the parent `Communication` resource rather than referencing each other.

**Example: **

```ts
// The parent communication
{
  resourceType: 'Communication',
  id: 'example-parent-communication',
  // There is no `partOf` of `payload` field on this communication
}

// The initial communication
{
  resourceType: 'Communication',
  id: 'example-message-1',
  payload: [
    {
      id: 'example-message-1-payload',
      contentString: 'Thank you for coming to your appointment! Let us know when you would like to schedule your follow-up.'
    }
  ],
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
      contentString: 'Can I schedule it for two weeks from today?'
    }
  ],
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
```

The `Communication.inResponseTo` element represents a prior communication that the current communication was created in response to. This element specifically references other `Communication` resources, allowing us to use it to create linked threads. The `inResponseTo` element is best used to create threads in which each message links to the message it is directly replying to, eventually chaining back to the original communication. This creates a thread similar to a linked-list, where each message points to the previous message in the list.

When creating a thread in this way, the initial communication will not have a value for `inResponseTo`. For each subsequent communication, `inResponseTo` should refer to the message that it is directly responding to. As the thread grows, this should continue so that each message references the one directly prior to it, creating a linked list of messages representing a thread.

In the example below, note that each subsequent communication references the one directly previous to it, creating a thread.

**Example: **

```ts
// The initial communication
{
  resourceType: 'Communication',
  id: 'initial-communication',
  // ...
  payload: [
    {
      id: 'initial-communication-payload',
      contentString: 'Your medication is ready! Please let us know when you would like to pick it up.'
    }
  ]
  // There is no `inResponseTo` field on this communication
}

// A response to the initial message
{
  resourceType: 'Communication',
  id: 'response-1',
  // ...
  payload: [
    {
      id: 'response-1-payload',
      contentString: 'I will be in to pick it up tomorrow'
    }
  ],
  inResponseTo: [
    {
      // The resource referenced is the message directly prior to this one
      resource: {
        resourceType: 'Communication',
        id: 'initial-communication'
      }
    }
  ],
  // ...
}

// Another message in the thread, responding to the previous communication
{
  resourceType: 'Communication',
  id: 'response-2',
  // ...
  payload: [
    {
      id: 'response-2-payload',
      contentString: 'We look forward to seeing you tomorrow! Your medication will be ready to go.'
    }
  ],
  inResponseTo: [
    {
      // This message references 'response-1', the message it is directly replying to
      resource: {
        resourceType: 'Communication',
        id: 'response-1'
      }
    }
  ],
  // ...
}
```

### How to "Tag" Threads and Messages

It can be useful to "tag" threads or individual messages so that a user can easily reference or interpret a certain type of message at a high level. For example, if there is a thread about a task that needs to be performed by a nurse, it can be tagged as such.

Tagging can be effectively done using the `Communication.category` element, which represents the type of message being conveyed. It allows messages to be classified into different types or groups based on specifications like purpose, nature, or intended audience. It is also important to note that the `category` field is an array, so each `Communication` can have multiple tags.

Below is an example of a `Communication` that is tagged with multiple `category` fields, each representing a different specification for the message.

**Example: **

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

:::tip Note

There are different ways that you can categorize threads, each one with its own pros and cons. For example, you can have threads with multiple `category` fields, one for specialty and one for level of credentials, etc., where you would search for multiple categories at once. The pros to this are that the data model is more self-explanatory, since each `category` is explicitly represented, and better maintainability, since it is easier to update and add individual categories. However, this can also lead to more complex queries.

Alternatively, you can have threads that have just one `category` that combines specialty, level of credentials, etc., and search for that specific category. This allows for simpler searching, needing only one `category` search parameter, and a simpler, more compact data model. The downside is that it may require more parsing and logic on the front-end to handle the combined categories and that as more combinations arise, maintaining the coding system may become difficult.

:::

### Codesystems

When classifying the `Communication.category` field, it is best to use SNOMED codes. Specifically, for for practitioner roles and clinical specialty, SNOMED provides the [SNOMED Care Team Member Function](https://vsac.nlm.nih.gov/valueset/2.16.840.1.113762.1.4.1099.30/expansion) valueset.

When classifying the `topic` element, it is common to use an internal custom coding so you can provide the proper level of specificity. However, it is still possible to use SNOMED and LOINC if you prefer.

**Example: **

```ts
// A communication with both SNOMED and custom coding
{
  resourceType: "Communication",
	//...
	category: [
	  // A category coded using SNOMED
		{
			coding: [
				{
					code: "158965000",
					system: "http://snomed.info/sct",
          display: "Medical Practitioner"
				}
			]
		},
	],
	//...
	topic: {
	  // A topic coded using a custom coding
		coding: [
			{
				code: "high-blood-pressure-08-02-23-patient=john-doe",
				system: "http://example-hospital.org",
				display: "High blood pressure result for John Doe. Test performed 8/2/2023"
			}
		]
	}
}
```

## Searching for and Sorting `Communication` Resources

`Communication` resources are easily searchable using the [Medplum Client SDK](/docs/sdk/classes/MedplumClient) `searchResources` method. Throughout this section, we will use an example of threading using `partOf` to reference a single parent `Communication` resource.

To search for all threads in the system, we need to find each parent resource, in this case `Communication` resources. One of the factors that differentiates a "thread-level", or parent, resource from a "message-level", or child, resource is that thread-level resources do not have a value in the `partOf` field.

**Example: **

```ts
await medplum.searchResources('Communication', {
  'part-of:missing': true,
  _revinclude: 'Communication:part-of',
});
```

```curl
curl https://api.medplum.com/fhir/R4/Communication?part-of:missing=true&_revinclude=Communication:part-of
```

In this example, we use the `:missing` search modifier to search for any `Communication` resources that do not reference another resource in their `partOf` field. However, this would only provide us with the parent `Communication` and none of the actual messages that are part of the thread. In order to get those messages, we use the `_revinclude` search paramter. This parameter adds any `Communication` resources whose `partOf` field references one of the original search results. If you only need the parent resource, you can omit the `_revinclude` field.

:::note Note

FHIR search parameters do not use camel case, so we use `'part-of'` rather than the camel case `partOf` that is the name of the actual field on a `Communication` resource. Since `part-of` includes a `-`, it must be included as the key on the search object as a string. To see a list of all search parameters on `Communication` resources, see the [`Communication` reference docs](https://www.medplum.com/docs/api/fhir/resources/communication#search-parameters).

:::

Once you have found the thread you want, you may want to retrieve the messages from only that specific thread, in order. In the above example, though we retrieved the messages with each thread, there is no guarantee that they will be in the correct order. You can also filter down results so that you only get the messages specific to the thread you want.

**Example: **

```ts
/*
curl https://api.medplum.com/fhir/R4/Communication?part-of=Communication/123&_sort=sent
*/
const communication = { resourceType: 'Communication', id: '123'}
await medplum.searchResources('Communication', {
  `part-of`: 'Communication/123',
  _sort: 'sent'
});
// OR
await medplum.searchResources('Communication', {
  'part-of': getReferenceString(communication),
  _sort: 'sent'
})
```

In the above example, we search for `Communication` resources that reference our thread in the `partOf` field. This can be done by passing in the reference string or, if you have the `Communication` resource for the thread you want, by using the `getReferenceString` utility method to help construct your query. In addition, we use the `_sort` parameter to sort the results based on the `sent` element. This element represents the time that a `Communication` was sent. You could also use the `received` element, which represents the time that a `Communication` was received. For more details on using the search functionality, see the [Search docs](/docs/search/index).
