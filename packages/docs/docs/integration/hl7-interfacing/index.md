# HL7 Interfacing

Medplum [Bots](/docs/bots) enables highly customizable HL7 interfacing engine that can be used as an alternative to Mirth or Corepoint.  Medplum allows developers to **produce and consume HL7 feeds from legacy healthcare applications**, such as EHRs, LIS, RIS/PACS, billing systems and more.

## Overview

HL7 feeds are streams of electronic health data transmitted between healthcare systems using the legacy Health Level Seven (HL7) standards. These feeds facilitate the real-time exchange of clinical and administrative information, such as patient demographics, lab results, billing data, and treatment records.  HL7 feeds are common **event driven interfaces** for healthcare related applications and are used for notifications and real-time data exchange.

HL7 interfaces are common in healthcare, and widely supported by legacy EHRs, RIS/PACS systems, lab instruments and more. Some common HL7 feeds include:

- Admission, Discharge and Transfer feeds (ADT Feed)
- Observation/Results (OBX Feed)
- Scheduling Information Unsolicited (SIU feed)

Medplum makes consuming and publishing these feeds straightforward, in a cloud-native manner, with the bots listening for and producing HL7 messages.  Below is an example of an HL7 message (in this case an ADT):

```
MSH|^~\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT|MSG00001|P|2.1
PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC
NK1|1|JONES^BARBARA^K|SPO|||||20011105
PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-
```

It should be noted that HL7 should only be used when necessary.  If a system has a FHIR or REST interface, those are preferable to HL7.

## Use Cases

There are infinitely many use cases for consuming and publishing HL7 messages from legacy systems, but these are some of the most common.

- Consuming Feeds

| Use case               | HL7 Message Type | Description                                                                      |
|------------------------|------------------|----------------------------------------------------------------------------------|
| Identity management    | ADT              | When a new message is received - check to see if the [patient demographic](/docs/charting/patient-demographics) exists and if not create a new record.                                                 |
| Diagnostics results    | ORU              | When a new lab test result is completed, store the result in the datastore.      |
| Schedule-driven workflow | SIU            | When a new appointment is scheduled, prompt the patient to complete their onboarding. |


- Publishing Feeds

| Use case               | HL7 Message type | Description                                                      |
|------------------------|------------------|------------------------------------------------------------------|
| Discharge notification | ADT              | When a patient is discharged trigger an event for others to consume |
| Diagnostic orders      | ORM              | Place a lab test order                                           |
| Schedule display       | SIU              | Publish [scheduling](/docs/scheduling) events so another organization can consume your schedule |

An estimated 95% of healthcare institutions in the US support HL7 V2, but the implementations vary widely.  Medplum provides guidance and documentation on how to do the basic consume and create workflows.

## Connecting to Legacy Systems

The HL7 V2 messaging format was released in 1987, and notably predates HTTPS - which was released in 1994.  It is not natively encrypted and cannot be sent over the open internet in a compliant manner.  Medplum supports several methods of capturing HL7 at the edge securely as follows.

### Medplum Agent

The Medplum [agent](/docs/agent) can be installed on the local area network with an HL7 enabled device and used as a bi-directional bridge between applications.  The agent can be used to enable organizations to connect to partners directly without a third party service.

### File Based HL7 Integrations

Some organizations will enable HL7 messages dropped as files onto an SFTP server.  The Medplum bot framework supports an [SFTP client](/docs/bots/file-uploads#sftp-uploads), using which you can connect to and acquire files from a site.  Then, using the SDK you can parse the HL7 message files using the SDK.  Bots can be run on [cron](/docs/bots/bot-cron-job) to mimic the effect of an event-driven workflow.

### HL7 Aggregators

There are several commercially available HL7 feed aggregators such as [HealthJump](https://www.healthjump.com/product-overview), [PointClickCare](https://pointclickcare.com/products/member-activity-visibility/) and many more, which can be connected, on-demand to a Medplum bot.  These integrations will require contracting with a third party to enable connectivity.

## Getting Started

To get started do the following.

- [ ] Identify the HL7 feeds you would like to publish/consume
- [ ] Identify what method you want to use to connect to the legacy application
- [ ] Write the [bot](/docs/bots) and create the [subscriptions](/docs/subscriptions) needed to set up your workflow 

After all the primitives are in place, test your implementation and ensure that dataflow is as expected.

## Recommended Reading

- [Bot setup for HL7](/docs/bots/hl7-into-fhir) a guide for a hello world bot to parse HL7
- [Agent](/docs/agent) enables connectivity at the edge for HL7 feeds and more
- [Enterprise Master Patient Index](/blog/empi-implementation) implementations often use ADT as part of the [deduplication architecture](/docs/fhir-datastore/patient-deduplication)
- [HL7 V2](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=185) - briefs and documentation
- [Medplum Agent Demo](https://youtu.be/MmE3Dn939B4) on Youtube - 15 min
- [HL7 Demo Bot](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/src/hl7-bot.ts)
- [HL7 Bots for Lab](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/lab-integration) - ORU and OBX bots
- [HL7 Bot Demo Video](https://youtu.be/q0SXeb_8H2Q) on Youtuve - 2 min