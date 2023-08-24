---
slug: onc-b10-certification-medplum
title: ONC Certified for (b)(10)
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [fhir-datastore, compliance]
---

# Announcing ONC (b)(10) Certification for Medplum

The Medplum team is pleased to announce that we have certified the [(b)(10) ONC Criteria](https://www.healthit.gov/test-method/electronic-health-information-export) - Electronic Health Information Export.

To see details related to our certification please check out our [ONC Certification](/docs/compliance/onc) page.

_What does this mean?_

It means that a **full export of a patient's data can be pulled from Medplum in a machine readable format**, in a timely manner. At the time of this writing, [the CHPL](https://chpl.healthit.gov/#/search) lists 70 EHRs have certified the (b)(10), out of 708 total. The requirements are summarized as follows:

✅ All data for a specific patient can be exported

✅ Machine readable format

✅ Timely export

✅ Self-service, can be done without contacting support

For those new to EHRs,** it can come as a surprise that it isn't a requirement that a patient's data be exportable in machine readable format**. This criteria is relatively recent, and a result of the [21st Century CURES Act](https://www.congress.gov/bill/114th-congress/house-bill/34). We believe it is a great benefit to our industry and for patients.

Medplum's implementation is [open source](https://github.com/medplum/medplum) and we believe we are the only open source implementation of this criteria so far. **For data management certification criteria, the key benefit of open source is composability.** Instead of ripping and replacing a huge monolithic system that needs to conform to one or more complex compliance frameworks, you can progressively enhance an implementation to fit the requirements of your specific scenario.

## Related Reading

- [Medplum's Compliance Documentation](/docs/compliance)
- [Composability and Standards](/blog/composability-medplum)
- [What is ONC Certification](/blog/what-is-onc-certification)
