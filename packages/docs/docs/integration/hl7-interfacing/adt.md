# Admit, Discharge, Transfer (ADT) 

ADT stands for "Admit, Discharge, Transfer." It is a type of HL7 message used in electronic health records systems to communicate changes in a patient's demographic or visit status. This includes registration, admission, discharge, and transfer information about a patient. 

This guide assumes you have already set up a Medplum [agent](/docs/agent) or aggregator equivalent to connect to the legacy healthcare application that you want to interface with and are able to receive the feed.

The following are a subset of the event types for ADT:

- `A01`: Admit/visit notification
- `A02`: Transfer a patient
- `A03`: Discharge a patient
- `A04`: Register a patient
- `A05`: Pre-admit a patient
- `A06`: Change an outpatient to an inpatient
- `A07`: Change an inpatient to an outpatient
- `A08`: Update patient information
- `A09`: Patient departing - tracking
- `A10`: Patient arriving - tracking
- `A11`: Cancel admit/visit notification
- `A12`: Cancel transfer
- `A13`: Cancel discharge
- `A14`: Pending admit
- `A15`: Pending transfer
- `A16`: Pending discharge
- `A17`: Swap patients

## Consuming ADT

This example synchronizes data with your FHIR datastore on register and update messages.  This example ignores message types other than `A04` and `A08`.

```
TODO: Create an example that throws away all of the message types except for A04 and A08 and update demographic in case of A04 and A08
```

## Publishing ADT

This example publishes an A04 event when a `Patient` is created and an A08 when the `Patient` resource is updated. No other message types are created as part of this feed.

```
TODO: Create an example that throws away all of the message types except for A04 and A08 and update demographic in case of A04 and A08
```

## Related Reading

- [Agent](/docs/agent) enables connectivity at the edge for HL7 feeds and more
- [Bot setup for HL7](/docs/bots/hl7-into-fhir) a guide for a hello world bot to parse HL7
- [Enterprise Master Patient Index](/blog/empi-implementation) implementations often use ADT as part of the [deduplication architecture](/docs/fhir-datastore/patient-deduplication)
- [Medplum Agent Demo](https://youtu.be/MmE3Dn939B4) on Youtube - 15 min
- [HL7 Bot Demo Video](https://youtu.be/q0SXeb_8H2Q) on Youtbve - 2 min