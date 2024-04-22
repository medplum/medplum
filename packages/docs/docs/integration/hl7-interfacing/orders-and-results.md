# Orders and Results

A common use case for HL7 is to place orders for diagnostics (labs and imaging commonly), and receive diagnostic results.  There are two common message types, the ORM (order entry) and ORU (observation result).  

This guide assumes you have already set up a Medplum [agent](/docs/agent) or otherwise [connected to the legacy healthcare application](/docs/integration/hl7-interfacing/#connecting-to-legacy-systems) (LIS, PACS, EHR, pharmacy or other system) that you want to interface with and are able to receive the feed.

## Placing Orders

To place an order effectively requires a basic understanding of the `ORM^001` Message format.  The rough equivalent of the `ORM^001` is in FHIR is the `ServiceRequest` and this example walks through the segments and an example mapping.  In practice, some customization will be needed to produce the data to the requirements of an organization ready to consume it.

### ORM^O01 Message Segments

Here’s an outline of the primary segments typically included in an `ORM^O01` message, along with simple examples for each:

1. MSH (Message Header): Establishes the message's intent, its origin, destination, date/time of creation, and type.

```
MSH|^~\&|OrderingSystem|HospitalA|LabSystem|HospitalA|202304151200||ORM^O01|1234|P|2.3
```

2. PID (Patient Identification): Provides patient identification and demographic information.

```
PID|1||001234567^^^HospitalA&1.2.840.113619.19.1||Doe^John^A||19800101|M|||123 Main St.^Apt 1^Anytown^State^12345^USA||(123)456-7890|||S||123456789|123-45-6789
```

3. PV1 (Patient Visit): Details information about the patient's current visit, such as the location, attending doctor and visit type.

```
PV1|1|O|OutpatientDept^101^HospitalA||||123456^Smith^Jane^A^^Dr.|||Outpatient||Col|123456789|Medicare|||||||||||||||||202304150800|202304151200
```

4. ORC (Common Order): Provides order control information, such as order status, ordering provider, and order timing.

```
ORC|NW|12345678||987654^LabSystem|SC||^once^^20230415^^R||202304151200|Smith^John|123 Main St.^Dept^Anytown^State^12345^USA|(123)456-7890||123456^Nurse^Amy|HospitalA^Dept^Room 5
```

5. OBR (Observation Request): Specifies the test or service requested, including the requested date/time and reason for the test.

```
OBR|1|12345678|456789^LabSystem|100^Complete Blood Count^L|||202304150800|||||Nausea and vomiting||123456^Smith^Jane^A^^Dr.|^Lab^Room 101||||202304151200||Lab|||Blood Test
```

6. OBX (Observation/Result): Optional in ORM messages, but can be used to provide additional information or preliminary results related to the order.
```
OBX|1|TX|Note^Clinical Note||Patient complains of dizziness and nausea.|||N|||202304151200|Lab
```

The bot example below, if linked to a Subscription that triggers on new and updated ServiceRequests will produce an ORM^001 message, and place an order in an external system.

```
TODO: Create an example Bot creates the ORM~001 method based off of `ServiceRequest` FHIR resource
```

## Receiving Results

Recieving results involves consuming an `ORU` message, which contains Observation Results, which roughly map to [Observations](/docs/api/fhir/resources/observation) in FHIR.  Below is an example: 

```
MSH|^~\&|LAB|1234^LAB^DNS|EHR|5678^EHR^DNS|202404221430||ORU^R01|123456|P|2.5.1
PID|1||123456789^^^LAB&1.2.3.4.5.6.7.8.9&ISO^MR||Doe^John^Q^^Mr.||19870507|M||2106-3|123 Broad St.^^Denver^CO^80020^USA||(303)555-1212|(303)555-1213||English|M|123456789|987654321|||Non-Hispanic|123-45-6789
OBR|1|8481234^LAB|1045813^LAB|1554-5^LDL Cholesterol^LN|||202404220900|||||||||123456^Smith^Jane^^^^^MD|||||202404221200|||F||||||LDL||202404221400|Serum
OBX|1|NM|1554-5^LDL Cholesterol^LN||130|mg/dL|<100=Optimal|N|||F|||202404221430||LAB^Laboratory^L
```

Mirroring the `ORM`, segments or the `ORU` are as follows:

1. MSH (Message Header): Contains metadata about the message, such as sender, receiver, and type of message.  The `ORU^R01`
2. PID (Patient Identification): Provides patient identification information such as name, date of birth, and address.
3. OBR (Observation Request): Details about the test order, including test ID and ordering physician.
4. OBX (Observation/Result): Contains the results of the test, including value, units, and reference ranges.

The bot below parses an `ORU^R01` and creates a corresponding `Observation.`

```
TODO: Create an example Bot parses the `ORU^R01` message type only and ignores others.  Creates the corresponding Patient and Observation.  Should conditionally create the Patient to demonstrate how to prevent duplicates
```


## Related Reading

- [Agent](/docs/agent) enables connectivity at the edge for HL7 feeds and more
- [Bot setup for HL7](/docs/bots/hl7-into-fhir) a guide for a hello world bot to parse HL7
- [Demo Lab Bots](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/lab-integration) on Github
- [Medplum Agent Demo](https://youtu.be/MmE3Dn939B4) on Youtube - 15 min
- [HL7 Bot Demo Video](https://youtu.be/q0SXeb_8H2Q) on Youtube - 2 min
