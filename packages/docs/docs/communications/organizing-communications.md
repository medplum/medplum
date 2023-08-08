# Organizing Communications

## Introduction

The `Communication` resource represents any messages in a healthcare context. It can include many scenarios – patient to physician, physician to physician, device to physician, and more. This results in a large volume of communications within this context, so ensuring that they are well organized is vital.

This guide covers different ways that you can organize the `Communication` resource. It will cover:

- Common organization patterns
  1. How to build and organize threads
  2. How to "tag" threads and messages
  3. How to use different Codesystems to classify messages
- Searching for messages and threads using the the search helper method from the [Medplum Client SDK](/docs/sdk/classes/MedplumClient)
- Querying for and sorting communications and threads

## Communication Organization Patterns

### Building and Organizing Threads

The `Communication` resource cann be used to model threading, allowing you to connect multiple related messages that are part of the same discussion. Threading can best be modeled using the `Communication.topic`, `Communication.partOf`, and `Communication.inResponseTo` elements.
These fields allow you to reference other communications, establishing a relationship, or thread, between new and existing communications.

The `Communication.topic` element represents a description of the main focus or content of the message. It allows you to link the communication to a specific topic or subject matter. It is easy to think of the topic as if it is the subject line of an email for a given communication. In that sense, it is useful to use that level of specificity when defining a topic. For example, a topic could be an appointment for a given patient on a given date. By assigning this topic to all `Communication` resources that are related to that appointment, you can create a thread of messages about the appointment. An example of this is below:

**Example: **

```ts
{
  resourceType: 'Communication',
  id: 'example-communication',
  payload: [
    {
      contentString: 'Your appointment for a physical on April 10th, 2023 is confirmed.'
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
// Although this message is a reminder rather than a confirmation, it references the same appointment, so the same topic is used to thread these together.
{
  resourceType: 'Communication',
  id: 'example-communication-2',
  payload: [
    {
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

The `Communication.partOf` element represents a larger resource of which the communication is a component. It can reference any resource type, allowing us to refer to other `Communication` resources to create a thread. The `partOf` element is best used to create a thread in which each message is linked to a single parent message.

When using the `partOf` field to create a thread, the parent `Communication` resource needs to be distinguished from the children. This is done simply by omitting a message in the `payload` field and a resource referenced in the `partOf` field. Conversely, all children will have both of these fields.

Once we have the parent resource, each message in the thread will create a new `Communication` resource, setting `partOf` to reference the parent resource. As more messages are sent, each one will continue to point to the parent, creating a thread with a common reference point.

It is also important to consider when it is appropriate to use the `Encounter` resource as a top-level grouping mechanism instead of the `Communication` resource. An "encounter" refers to any diagnostic or treatment interaction between a patient and provider, and, in a digital health context, can include SMS chains, in-app threads, and email. The `partOf` field can reference any resource type, so when an "enconter" occurs, threads should be created with the `Encounter` resource as the parent. See the [Representing Asynchronous Encounters](/docs/communications/async-encounters/async-encounters) docs.

In the example below, each message in the thread references the parent `Communication` resource rather than referencing each other.

**Example: **

```ts
// The parent communication
{
  resourceType: 'Communication',
  id: 'example-parent-communication',
  // There is no `partOf` field on this communication
}

// The initial communication
{
  resourceType: 'Communication',
  id: 'example-message-1',
  payload: [
    {
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

When classifying the `topic` element, it is common to use an internal custom coding so you can provide the proper level of specificity. However, it is still possible to use SNOMED and LOINC if you would like to.

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
					code: "158965000"
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

## Retrieving Threaded Communications

Threads can be retrieved with the [Medplum Client SDK](/docs/sdk/classes/MedplumClient) `searchResources` method using special search parameters. If you are using `partOf` to create an ancestor-descendant relationship, you can search for the parent communication as well as any communications that reference it.

**Example: **

```ts
await medplum.searchResources('Communication', {
  id: 'example-ancestor-id',
  _revinclude: 'Communication:part-of',
});
```

```
curl https://api.medplum.com/fhir/R4/Communication?id=example-ancestor-id&_revinclude=Communication:part-of
```

The `category` element is a search parameter on the `Communication` resource, so you can easily search for communications with specific categories. The parameter type is a token, so you will need to search for a specific coded category that your practice has defined. It is possible to search for multiple categories, as shown in the example below. This searches for all communications with the category codes representing 'Doctor' and 'Endocrinology'.

**Example: **

```ts
await medplum.searchResources('Communication', [
    ['category', '394583002'],
    ['category', '158965000']
  ]
});
// OR
await medplum.searchResources('Communication', 'category=394583002&category=158965000');
```

```
curl https://api.medplum.com/fhir/R4/Communication?category=394583002&category=158965000
```

In this example we are searching for a communication with a given `id`. By including the `_revinclude` parameter, we also search for any communications whose `partOf` element references the communication with the given id. For more details on searching using linked resources, see the [Search](/docs/search/includes) documentation.

If you are using `inResponseTo` to model a parent-child relationship, you can search for the parent communication and then iterate along the thread to get all of the communications.

**Example: **

```ts
await medplum.searchResources('Communication', {
  id: 'example-parent-id',
  _revinclude:iterate: 'Communication:inResponseTo'
});
```

In this example we are searching for a communication by `id`. After, we include the `_revinclude:iterate: 'Communication:inResponseTo` parameter, to retrieve all communications that reference the communication we are searching for. By including the `:iterate` modifier to recursively apply the reverse inclusion until no more resources are found. This first finds any direct responses to the initial communication. Then it iterates to find any communications that reference the direct response, and so on until it finds no more communications. For more details on using the `:iterate` modifier, see the [Search](/docs/search/includes) documentation.

## Sorting Communications by Time

Sorting communications by time or organizing messages chronologically is a common requirement when retrieving threaded communications. The communication resource includes two timestamp fields, `sent` and `received`, which represent the time that a message was sent or received. You can search for sorted results by including the special search parameter `_sort`, which allows you to specify a list of search parameters to sort by.

Taking our example from earlier, we could search for a thread that uses `partOf` and sort the results with the below search.

**Example: **

```ts
await medplum.searchResources('Communication', {
  id: 'example-id',
  _revinclude: 'Communication:part-of',
  _sort: 'sent',
});
```

This will return the communications sorted in ascending order. You can also sort by descending order and provide more than one argument to sort by in a comma separated list. The below example sorts the thread by descending time `sent` and then by `sender`.

**Example: **

```ts
await medplum.searchResources('Communication', {
  id: 'example-id',
  _revinclude: 'Communication:part-of',
  _sort: '-sent,sender',
});
```

## Querying for Communications with GraphQL

Effectively grouping and filtering your communications makes it easier to search and query for specific data.

For example, if you want to get all of the communications between the provider and a specific patient, you could use the following query. In this, we query for a patient by their id, returning their name. We then alias our queries their communications as `communicationsSent` and `communicationsReceived`. In these lines, we use the `_reference` keyword to query for any communication that references our patient in the `sender` and `recipient` fields respectively. From these communications, we get the payload of the communication and its content, as well as the sender, receiver, and the time it was sent and received. Preview this query in [GraphiQL](graphiql.medplum.com)

```
{
	# Search for a specific patient by id
  Patient(id: "36bfa7b5-2b62-4ea8-8a30-c17f4e4831c0") {
    resourceType
    id
		name {
			family
			given
		}
		# Search for communications that reference the patient as a sender
    communicationsSent: CommunicationList(_reference: sender) {
      payload {
        contentString
      }
      # Resolve the practitioners referenced by Communication.recipient
      recipient {
        resource {
          ... on Practitioner {
            name {
              family
              given
            }
          }
        }
      }
    }
    # Search for communications that reference the patient as a recipient
    communicationsReceived: CommunicationList(_reference: recipient) {
      payload {
        contentString
      }
      # Resolve the practitioners referenced by Communication.sender
      sender {
        resource {
          ... on Practitioner {
            name {
              family
              given
            }
          }
        }
      }
    }
  }
}
```

```ts
await medplum.graphql(`
{
  query GetPatientCommunications{
  Patient(id: "36bfa7b5-2b62-4ea8-8a30-c17f4e4831c0") {
  	resourceType
    id
		name {
			family
			given
		}
    communicationsSent: CommunicationList(_reference: sender) {
      payload {
        contentString
      }
      recipient {
        resource {
          ... on Practitioner {
            name {
              family
              given
            }
          }
        }
      }
    }
    communicationsReceived: CommunicationList(_reference: recipient) {
      payload {
        contentString
      }
      sender {
        resource {
          ... on Practitioner {
            name {
              family
              given
            }
          }
        }
      }
    }
  }
}`);
```

```curl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
-H "Content-Type: applicatoin/json" \
-H "Authorization: Bearer $your_access_token" \
-d '{"query": "query GetPatientCommunications { Patient(id: \"36bfa7b5-2b62-4ea8-8a30-c17f4e4831c0\") { resourceType id name { family given } communicationsSent: CommunicationList(_reference: sender) { payload { contentString } recipient { resource { ... on Practitioner { name { family given } } } } } communicationsReceived: CommunicationList(_reference: recipient) { payload { contentString } sender { resource { ... on Practitioner { name { family given } } } } } } }"}'
```

Here is an example of how you could search for all communications within your provider that are not linked to an encounter. Using CommunicationList we are able to return a list of all communications that fit our argument of `encounter: null`. In this case we return the text of the communication, the sender, and the receiver. Preview this query in [GraphiQL](graphiql.medplum.com).

```
{
	CommunicationList(encounter: null) {
		payload {
			contentString
		}
		sender {
			resource {
				... on Practitioner {
          name {
            family
            given
          }
        }
			}
		}
		recipient {
			resource {
				... on Patient {
          name {
            family
            given
          }
        }
			}
		}
	}
}
```

```ts
await medplum.graphql(`
{
	CommunicationList(encounter: null) {
		payload {
			contentString
		}
		sender {
			resource {
				... on Practitioner {
          name {
            family
            given
          }
        }
			}
		}
		recipient {
			resource {
				... on Patient {
          name {
            family
            given
          }
        }
			}
		}
	}
}
`);
```

```curl
curl -X POST 'https://api.medplum.com/fhir/R4/$graphql' \
-H "Content-Type: application/json" \
-H "Authorization: Bearer: $your_access_token" \
-d '{"query":"{ CommunicationList(encounter: null) { payload { contentString } sender { resource { ... on Practitioner { name { family given } } } } recipient { resource { ... on Patient { name { family given } } } } } }"}'
```

:::tip Note

In these examples, we are only resolving the senders and recipients for one resource type, either Patient or Practitioner. To resolve all potential senders and receivers you will need to include all resource types that can send or receive. For more details on FHIR GraphQL queries see the [GraphQL](/docs/graphql/basic-queries) docs.

:::
