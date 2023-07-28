# Organizing Communications

## Background

Communication in a patient portal can include many scenarios – patient to physician, physician to physician, device to physician, and more. This results in a large volume of communications within a portal, so ensuring that they are well organized is vital. For example, an organization may have staff on call to respond to patient messages. Without proper organization, messages may not reach the correct staff member.

## Communication Organization Patterns

There are various ways to organize communications using FHIR, but the most common are `Communication.category` and `Communication.topic`. Additionally, you can use FHIR attirbutes to organize communications using threading.

The `Communication.category` element is the type of message being conveyed. Categories can include alerts, notifications, reminders, instructions, etc. Keeping communications well organized by category can help with routing to the correct person/team. For example, communications categorized as appointment reminders that are sent to a patient can automatically be routed to the relevant phsyician as well, alert categories can be automatically routed to on-call staff during off hours, and instruction categories can be automatically routed to the relevenat nurses, patients, physicians, etc.

The `Communication.topic` element is a description of the content of the communication. It’s easy to think of this as the subject line of an email. Keeping communications well organized by topic can assist with billing and driving workflows. For example, if a patient consults with a physician via phone, this communication can be given a topic of, for example `phone-consult`. Being able to see this topic allows for easy billing to the patient. Additionally, a communication with a `prescription-refill-request` topic is an easy indicator to review this request and fulfill it if necessary.

Organizing communications via threading is an effective way to keep related messages grouped together. In healthcare apps, threads can include SMS chains, in-app chats, email exchanges, and more. These threads can constitute an [encounter](/docs/communications/async-encounters/async-encounters), which can be represented on `Communication.encounter`. The `Communication.encounter` element references a specific encounter that is closely related to the communication, or during which the communication took place. In addition, you can use the `Communication.inResponseTo` element. This element is a an array of references to `Communication` elements that preceded the current one and can be useful for tying all the messages in a threads together. Threading communications in this way allows for users to easily view all messages relevant to a single encounter.

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
			text: "Alert",
			coding: [
				{
					code: "74018-3"
					system: "https://fhir.loinc.org",
				}
			]
		},
	],
	//...
	topic: {
	  // A topic coded using SNOMED
		text: "High blood pressure",
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
			text: "Appointment Reminder",
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
		text: "Annual Physical"
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

Effectively organizing your communications makes it easier to search and query for specific data. For example, if you want to get all of the communications between the provider and a specific patient, you could use the following query. In this, we query for a patient by their id, then search all of the communications that reference them. From these communications, we get the text of the communication, the sender and time it was sent, and the receiver and time it was received.

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
      text {
        div
      }
      sent
      sender {
        resource {
          ... Practitioner
        }
      }
      received
      recipient {
        resource {
          ... Practitioner
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

Here is an example of how you could search for all communications within your provider that are not linked to an encounter. Using CommunicationList we are able to return a list of all communications that fit our argument of encounter: null. In this case we return the text of the communication, the sender, and the receiver.

```
{
	CommunicationList(encounter: null) {
		text {
			div
		},
		sender {
			resource {
				... Practitioner
			}
		},
		recipient {
			resource {
				... Patient
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

**Note** In these examples, we are only resolving the senders and recipients for one resource type, either Patient or Practitioner. To resolve all potential senders and receivers you will need to include all resource types that can send or receive. For more details on FHIR GraphQL queries see the [GraphQL](/docs/graphql/basic-queries) docs.
