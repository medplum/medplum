---
slug: estimating-rds
title: Estimating RDS Size
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [fhir-datastore, self-host]
---

# Estimating RDS Size

Data privacy, locality, governance and [compliance](/docs/compliance) are huge issues in healthcare, and that's why we at Medplum support [self-hosting](/docs/self-hosting). For those running on AWS, we use Aurora RDS, which supports auto-scaling. A common question we get is - **how big is my database going to be?**

:::tip
Medplum offers a hosted offering as well as self-hosted. Instructions to [register](/docs/tutorials/register) can be found in our docs.
:::

Say for example, you have 1M active patients annually - how does that translate to database size?

Unfortunately, there is no straightforward answer to that question, but the right way to think about it is to make a **FHIR resource count estimate, per patient, annually**. Applications with a lot of messaging and observation data are generally more resource intensive, while those that have visit notes and prescriptions are generally less resource intensive.

Here's an example of a resource projection.

| Resource Type     | Count per Patient | Total Count (M) | Avg. Size / Resource (kb) | Avg. History Length | Total Storage (GB) |
| ----------------- | ----------------- | --------------- | ------------------------- | ------------------- | ------------------ |
| Patients          | **\_\_**          | 1               | 5                         | 10.0                | 52.5               |
| Encounters        | 10                | 10              | 2                         | 2.0                 | 42.0               |
| Coverage          | 1                 | 1               | 2                         | 2.0                 | 4.2                |
| DiagnosticReport  | 10                | 10              | 2                         | 2.0                 | 42.0               |
| Observation       | 15                | 15              | 2                         | 2.0                 | 62.9               |
| MedicationRequest | 10                | 10              | 2                         | 2.0                 | 42.0               |
| Media             | 15                | 15              | 2                         | 2.0                 | 62.9               |

Average History Length (column 5) refers to the number of times the resource is edited, as changes are tracked, historical data will increase storage size.

To calculate the total storage, we use an "overhead factor" (representing metadata, indexes, etc) of 10%. The following formula shows how to estimate column 6 - Total Storage

`totalStorage = resourceCount * patientTotal * avgSize * avgHistoryLength / (1024 * 1024) * (1 + overheadFactor)`

In this example, summing the Total Storage column, you get an estimated total of 308.4 GB of data per year.

Hopefully, this lightweight exercise can help you and your organization get a sense of your database needs today and over time.

## Related Resources

- [AWS Aurora Pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [AWS Aurora Instance Class Summary](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.html#Concepts.DBInstanceClass.Summary)
- Medplum [Self-hosting guide](/docs/self-hosting)
- Self-hosting [change log](https://github.com/medplum/medplum/pulls?q=is%3Apr+is%3Aclosed+label%3Aself-host) on Github
