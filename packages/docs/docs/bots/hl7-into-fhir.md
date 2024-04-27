---
sidebar_position: 8
---

# HL7 to FHIR

HL7 interfaces are common in healthcare, and widely supported by legacy EHRs, RIS/PACS systems, lab machines and more. Medplum provides a [HL7 Interfacing engine](/docs/integration/hl7-interfacing) that supports consumption and production of HL7 feeds, and the [Medplum Agent](/docs/agent) supports connecting to systems on-premises.

## This guide will show you

- How to integrate Medplum with an HL7 feed bi-directionally, receiving messages and sending back confirmation messages.
- How to convert those HL7 messages into FHIR objects

## The Workflow

When we this implementation is complete we will:

- Receive an HL7 message over HTTPS from another EHR that produces HL7 feeds
- Create FHIR objects that capture the parts of the feed we care about.
- Respond to the EHR with an HL7 acknowledgment that the message was received
- (Optional) Send a notification to another application, indicating that new FHIR resources are available.

## The Implementation

### Account and Policy Setup

- Make sure you have an account on Medplum, if not, [register](https://app.medplum.com/register).
- Create a [ClientApplication](https://app.medplum.com/admin/project) on Medplum called "ADT Bot Client Application".
- (Optional) Create a very restrictive [AccessPolicy](https://app.medplum.com/AccessPolicy) called "ADT Bot Policy", make it so that the policy only allows readwrite on the Patient object.
- (Optional) In the [ProjectAdmin dashboard](https://app.medplum.com/admin/project) apply the "ADT Bot Policy" policy to the `ClientApplication` by clicking `Access`.

### Bot Setup

- Linking the ADT feed to Medplum is done through [Medplum Bots](https://app.medplum.com/Bot).
- At a high level, each Bot exposes an endpoint and HL7 messages are posted over HTTPS to that endpoint.
- The HL7 message is parsed and then converted to a corresponding FHIR object.
- (Optional) If needed, you can link a [Subscription](https://app.medplum.com/Subscription) to the FHIR objects that the Bot creates to notify downstream applications that new data is available.

- Make the bot that will listen for HL7 messages
  - First, [create a bot](https://app.medplum.com/admin/project) called ADT Handler Bot and save it
  - Paste the code below into the Bot you created and save. You can also find this bot and a corresponding test in the [Sample Bots Github Repository](https://github.com/medplum/medplum-demo-bots/).

```js
import { BotEvent, Hl7Message, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Hl7Message> {
  const input = event.input as Hl7Message;
  // Log Message Type
  const messageType = input.get('MSH')?.get(8);
  console.log(messageType);

  // Get patient name
  const givenName = input.get('EVN')?.get(5).get(1) as string;
  const familyName = input.get('EVN')?.get(5).get(2) as string;

  // Get patient ID
  const mrnNumber = input.get('PID')?.get(3).get(4);

  let patient = await medplum.searchOne('Patient', 'identifier=' + mrnNumber);

  if (patient) {
    console.log('Patient already in the system');
  } else {
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        {
          given: [givenName],
          family: familyName,
        },
      ],
      identifier: [
        {
          system: 'www.myhospitalsystem.org/IDs',
          value: mrnNumber,
        },
      ],
    });
    console.log('Created patient', patient.id);
  }

  // Based on the messageType, you may consider making additional FHIR objects here

  // Return Ack
  return input.buildAck();
}
```

Functionally, the code above will create a new patient with the `mrnNumber` provided, assuming that patient isn't already in this system.

### Testing your Bot

You'll need your bot id (see [bot list](https://app.medplum.com/Bot) and click) to execute the bot. Once you have found it, you can attempt to execute your Bot using an HTTP message by sending the following via curl. Note the content type.

```bash
curl -X POST 'https://api.medplum.com/fhir/R4/Bot/<bot-id>/$execute' \
--header 'Content-Type: x-application/hl7-v2+er7' \
--header 'Authorization: Bearer <access_token>' \
--data-raw 'MSH|^~\&|Primary||CL|PDMT|20200312081842|168866|ADT^A28|203598|T|2.3|||||||||||
EVN|A28|20200312081842||REG_UPDATE|168866^GLOVER^JASMIN^^^^^^PHC^^^^^10010||
PID|1||E3866011^^^EPIC^MRN~900093259^^^EPI^MR||TESTING^UGA||20000312|M|||^^^^^USA^P||||||||123-54-8888|||||N||||||N||
PD1|||PHYSICIANS ATLANTIC STATION^^10010|||||||||||||||
PV1|1|N||||||||||||||||||||||||||||||||||||||||||||||||||||
PV2||||||||||||||||||||||N|||||||||||||||||||||||||||'
```

If all goes well, you should see the following HL7 acknowledgement message in the console.

```bash
MSH|^~\\&|CL|PDMT|Primary||2022-05-10T16:19:50.244Z||ACK|1652199590244|P|2.5.1\rMSA|AA|203598|OK
```

Alternatively, you can submit the HL7 message type to the bot as a file using the following command.

```bash
curl -x POST 'https://api.medplum.com/fhir/R4/Bot/<bot-id>/$execute' \
  --header 'Content-Type: x-application/hl7-v2+er7' \
  --header 'Authorization: Bearer <access_token>' \
  --data-binary "@/path/to/filename"
```

### Creating a subscription

If you want to receive a notification whenever a Patient (or other FHIR resource) is created, you can do so by creating a [Subscription](./bot-basics#executing-automatically-using-a-subscription).

Subscriptions have a concept of `Criteria` which indicates when they should be triggered. Link them to the FHIR resource of choice.

### Complex Logic in Bots

Creating a patient from a single type of HL7 message is straightforward and doesn't require much code.

In practice, this is unrealistic, and the code will soon require a more complex application with testing and strongly typed objects. To support that we have a Bot toolkit for development and deployment that you can find here: [CLI Tool](https://github.com/medplum/medplum-demo-bots).
