# Pediatrics

Pediatrics implementations have unique characteristics that can make traditional EHRs challenging to use. Traditional EHRs have many assumptions built into them that assume an adult patient, which can make an existing interface confusing for practitioners, making visual customizations important.

There are also three common workflow challenges are prominent in pediatrics.

- Caregivers, commonly parents, need access to patient records, sometimes multiple patient records in case of siblings
- Patient messaging and inquiries are common in pediatrics, and in some cases message based interactions are billable
- Administrative tasking, for example records requests or complex referrals, are common in pediatrics

## Caregiver Access

Parental and caregiver access is supported through Medplum [access controls](/docs/access/access-policies), and supports multiple caregivers having access to multiple siblings or children. Read our guide on [modeling family relationships](/docs/fhir-datastore/family-relationships) for information on how to enable this feature. A [explainer video](https://youtu.be/IDhsWiIxK3o) on the mechanics of the access controls is also available.

## Messaging

Patient-provider messaging is a common feature of pediatric applications. Organizing, annotating, documenting and billing for [asynchronous encounters](/docs/communications/async-encounters) is a common implementation pattern.

## Tasks

[Tasking](/docs/careplans/tasks) for front desk, operations teams and clinicians are common in Medplum pediatrics implementations, and are often high return on investment due to time saved by clinicians.

## Case Studies

- [Develo Pediatric EHR](/blog/develo-case-study)
- [24/7 Pediatrician Access](/blog/summer-case-study) - Summer Health Case Study
