# Organizing Communications

# Introduction

Communications in a healthcare context (modeled as [Communication](/docs/api/fhir/resources/communication) resources) can include many scenarios – patient to physician, physician to physician, device to physician, and more. This results in a large volume of communications within this context, so ensuring that they are well organized is vital. For example, a provider may have staff on call to respond to patient messages. Without proper organization, messages may not reach the correct staff member.

This guide covers different ways that you can organize communications and how to think about different properties on the `Communication` element. It will cover:

- Common communication organization patterns, including `Communication.category`, `Communication.topic`, and threading.
- Searching for communications and threads using the the search helper method from the [Medplum Client SDK](/docs/sdk/classes/MedplumClient)
- Sorting communications by time
- How to use different Codesystems to classify communications.
- Querying for communications.

## Communication Organization Patterns

There are various ways to organize communications using FHIR, but the most common are `Communication.category` and `Communication.topic`. Additionally, you can use properties such as `Communication.inResponseTo` and `Communication.partOf` to organize communications using threading.

## Organizing Using `Communication.category`

The `Communication.category` element is the type of message being conveyed. It allows users to categorize and classify communications into different types or groups based on their purpose, nature, or intended audience. It provides contextual information about the communication, making it easier for users to understand the nature of the message without necessarily having to read or understand the entire communication.

:::tip Note

`Communication.category` is stored as an array of [CodeableConcept](/docs/api/fhir/datatypes/codeableconcept) datatypes, so it is important to note that it is possible for a communication to have multiple categories.

:::

The category property can help in keeping communications organized among the many intricacies of a healthcare setting. For example, you can use it to organize by specific specialties, clinical topics, or the intended audience of a message.

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
}
```

`category` is a search parameter on the `Communication` resource, so you can easily search for communications with specific categories. The parameter type is a token, so you will need to search for a specific coded category that your practice has defined. It is possible to search for multiple categories, as shown in the example below. This searches for all communications with the category codes representing 'Doctor' and 'Endocrinology'.

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

:::tip Note

There are different ways that you can categorize threads, each one with its own pros and cons. For example, you can have threads with multiple categories, one for specialty and one for level of credentials, etc., where you would search for multiple categories at once. The pros to this are that data model is more self-explanatory, since each category is explicitly represented, and better maintainability, since it is easier to update and add individual categories. However, this can also lead to more complex queries and a more complex data model.
Alternatively, you can have threads that have just one category that combines specialty, level of credentials, etc., and search for that specific category. This allows for simpler searching, needing only one category search parameter, and a simpler, more compact data model. The downside is that it may require more parsing and logic to handle the combined categories and that as more combinations arise, maintaining the coding system may become complex and difficult to manage.

:::

## Organizing Using `Communication.topic`

The `Communication.topic` element represents a description of the main focus or content of the message. It allows you to link the communication to a specific topic, or subject matter, making it easier for recipients to understand the purpose and content of the message.

It is easy to think of the topic as if it is the subject line of an email for a given communication. In that sense, it is useful to use that level of specificity when defining a topic. For example, a topic could be an appointment for a given patient on a given date. This topic could be assigned to all communications related to that appointment.

**Example: **

```ts
{
  resourceType: 'Communication',
  id: 'example-communication-2',
  topic: {
    text: 'In-person appointment with Homer Simpson on April 10th, 2023. Made by telephone.',
    coding: [
      {
        code: '185420007',
        system: 'http://snomed.info.sct',
        display: 'In-person appointment made by telephone - Homer Simpson - 04-10-2023'
      }
    ]
  }
}
```

## Modeling Threads

You can also use the `Communication` resource to model threading, enabling you to represent the relationship between multiple communications that are part of the same discussion. This is a way to organize related communications and logically link messages so that the context of the conversation is maintained.

Threading can best be modeled using the `Communication.partOf` and `Communication.inResponseTo` elements. These properties allow you to reference other communications, establishing a relationship, or thread, between new and existing communications.

## Threading with `Communication.partOf`

The `partOf` element represents a larger resource of which the communication is a component or step. It can reference any resource type, allowing us to refer to other communications to create a thread. The `partOf` element is best used to create a thread in which each message is linked back to the original parent message, creating an ancestor-descendant relationship.

When creating a thread the initial parent message will not have a value stored in `partOf`. For each response create a new communication resource, setting `partOf` to reference the original communication resource. As the thread grows, each communication should continue to point to that original parent, which will form a group of communications with a common reference point.

In the example below, despite that this is a thread of communications in order, the initial message is the communication being referenced by both responses in the `partOf` property.

**Example: **

```ts
// The initial communication
{
  resourceType: 'Communication',
  id: 'example-parent-communication',
  payload: [
    {
      contentString: 'We have confirmed your appointment for 10:00am on August 8th.'
    }
  ],
  // There is no `partOf` field on this communication
}

// A response to the original communication
{
  resourceType: 'Communication',
  id: 'example-response-1',
  payload: [
    {
      contentString: 'Can this appointment be changed to 9:30?'
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

// A second response, directly to `example-response-1` but still referencing the parent communication
{
  resourceType: 'Communication',
  id: 'example-response-2',
  payload: [
    {
      contentString: 'Your appointment has been updated to 9:30am on August 8th.'
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

:::info Note
The `partOf` element is not only meant to be used for threading. It is typed as an array of references to any resource, so if a communication is part of a `Procedure`, this can also be included on the element.
:::

## Threading with `Communication.inResponseTo`

The `inResponseTo` element represents a prior communication that the current communication was created in response to. This element specifically references to other communication resources, allowing us to use it to create linked threads of communications. The `inResponseTo` element is best used to create threads in which each message links to the message it is directly replying to, eventually chaining back to the original communication. This creates a thread with a parent-child relationship between communications.

When creating a thread in this way, the initial communication will not have a value for `inResponseTo`. For each subsequent communication, `inResponseTo` should refer to its parent that it is directly responding to. As the thread grows, this should continue so that each message references its direct parent, creating a chain of messages representing a thread.

In the example below, note that each subsequent communication references the one directly previous to it, creating a chained thread.

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

## Retrieving Threaded Conversations

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

In this example we are searching for a communication with a given `id`. By including the `_revinclude` parameter, we also search for any communications whose `partOf` property references the communication with the given id. For more details on searching using linked resources, see the [Search](/docs/search/includes) documentation.

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

Sorting communications by time or organizing messages chronologically is a common requirement when retrieving threaded communications. The communication resource includes two timestamp properties, `sent` and `received`, which represent the time that a message was sent or received. You can search for sorted results by including the special search parameter `_sort`, which allows you to specify a list of search parameters to sort by.

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

## Codesystems

It is recommended to use LOINC or SNOMED codes to classify `Communication.category` and `Communication.topic`, but it is also possible to use custom coding internal to your practice.

Below is an example of organizing a communication using all three of LOINC, SNOMED, and a custom code.

```
{
  resourceType: "Communication",
	//...
	category: [
	  // A category coded using LOINC
		{
			text: "Practitioner",
			coding: [
				{
					code: "18601-5"
					system: "http://loinc.org",
          display: "Primary practitioner profession"
				}
			]
		},
	],
	//...
	topic: {
	  // A topic coded using SNOMED
		text: "High blood pressure result for John Doe, from test performed 8/2/2023",
		coding: [
			{
				code: "38341003",
				system: "http://snomed.info/sct",
				display: "Hypertensive Disorder"
			}
		]
	}
}

{
	resourceType: "Communication",
	//...
	// An example of how an internal custom coding could be used for both category and topic
	category: [
		{
			text: "appointment-reminder",
			coding: [
				{
					code: "apt-rem",
					system: "https://example-practice.org"
				}
			]
		}
	],
	//...
	topic: {
		text: "annual-physical"
		coding: [
			{
				code: "annu-phys",
				system: "https://example-practice.org"
			}
		]
	}
}
```

## Search and GraphQL

Effectively grouping and filtering your communications makes it easier to search and query for specific data.

For example, if you want to get all of the communications between the provider and a specific patient, you could use the following query. In this, we query for a patient by their id, then search all of the communications that reference them. From these communications, we get the text of the communication, the sender and time it was sent, and the receiver and time it was received. Preview this query in [GraphiQL](graphiql.medplum.com)

```
{
	# Search for a specific patient by id
  Patient(id: "example-patient-id") {
  	resourceType
    id
		name {
			family
			given
		}
		# Search for communications that reference the patient
    communications: CommunicationList(_reference: patient) {
      payload {
        div
      }
      sent
      sender {
        resource {
          ... PractitionerDetails
        }
      }
      received
      recipient {
        resource {
          ... PatientDetails
        }
      }
    }
  }
}

fragment PractitionerDetails on Practitioner {
	name {
		family
		given
	}
}

fragment PatientDetails on Patient {
	name {
		family
		given
	}
}
```

Here is an example of how you could search for all communications within your provider that are not linked to an encounter. Using CommunicationList we are able to return a list of all communications that fit our argument of encounter: null. In this case we return the text of the communication, the sender, and the receiver. Preview this query in [GraphiQL](graphiql.medplum.com).

```
{
	CommunicationList(encounter: null) {
		text {
			div
		},
		sender {
			resource {
				... PractitionerDetails
			}
		},
		recipient {
			resource {
				... PatientDetails
			}
		}
	}
}

fragment PractitionerDetails on Practitioner {
	name {
		family,
		given
	}
}

fragment PatientDetails on Patient {
	name {
		family,
		given
	}
}
```

:::tip Note

In these examples, we are only resolving the senders and recipients for one resource type, either Patient or Practitioner. To resolve all potential senders and receivers you will need to include all resource types that can send or receive. For more details on FHIR GraphQL queries see the [GraphQL](/docs/graphql/basic-queries) docs.

:::
