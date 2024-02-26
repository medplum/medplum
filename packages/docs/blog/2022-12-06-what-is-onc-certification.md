---
slug: what-is-onc-certification
title: What is ONC Certification?
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [compliance, billing]
---

## What is ONC Certification?

![ONC Certification graphic](/img/blog/onc-certification.png)

The [Office of the National Coordinator for Health Information Technology (ONC) certification](/docs/compliance/onc) is a program that ensures that electronic health records (EHRs) meet certain standards for interoperability and security. It is designed to help healthcare providers adopt and use EHRs more effectively, and to promote the widespread adoption of EHRs as a means of improving the quality and efficiency of healthcare. To be certified, an EHR must meet a set of standards and criteria that have been developed by the ONC in collaboration with other organizations and stakeholders in the healthcare industry. These standards cover a range of areas, including the exchange of health information([g10](/docs/compliance/onc)), patient access to their own health data (also [g10](/docs/compliance/onc)), and the protection of sensitive health information([d1](/docs/compliance/onc),[d13](/docs/compliance/onc),[g12](/docs/compliance/onc)). By achieving ONC certification, EHRs can demonstrate that they meet these standards and are ready for use in a wide variety of healthcare settings.

From a technical perspective - **the most important thing to understand about the certification is that it requires FHIR API access - for patients _and_ practitioners.**

## The Benefits of Certification

The benefits of certification vary by the type of provider. The following are very tangible benefits to getting certified.

- For those with a large CMS (Medicare, Medicaid) population, getting reimbursement at the optimal rate will require certification.
- Supporting CMS Queries will streamline contracting with payors (other than CMS), who want insight into "quality metrics" and technical touch points.

Beyond the above there, **certified systems do gain a benefit in contracting and partnerships** because partners know they have a streamlined interface to exchange data.

## The Certification Process

The certification process has is driven by examination, there are certification vendors, e.g. [Drummond](https://www.drummondgroup.com/), who proctor vendors through a walk-through of developer products according to a [specific script](/docs/compliance/onc).

Some of the criteria, for example [g10](/docs/compliance/onc) have standardized test harness, like [Inferno](https://inferno.healthit.gov/) or [Cypress](https://cypress.healthit.gov/), that verifies that APIs are working as expected.

[This video](https://youtu.be/jSm3xsm-ehs?t=826) shows an example of the Inferno tool in practice. The proctored exam will have developers walk through the test session like this one, and the output will be verified by the proctor.

[Running the Inferno test harness](https://youtu.be/jSm3xsm-ehs?t=1390) as shown in the video will be meat of what goes on during the certification examination for that [g10](/docs/compliance/onc) criteria.

## The Developer Perspective

For developers, it is important to understand that there are two types of criteria.

- [Self attested criteria](/docs/compliance/onc): these will not be tested by the examiner, instead organizations will have to self-attest that the functionality is available and provide some documentation.
- [Live tested criteria](/docs/compliance/onc): these will be tested by an examiner, in accordance with the scripts.

You do not need to certify for all criteria at once, you can batch them up and pursue subsets.

**Prepare for frequent requirements changes**. The regulations and requirements do change frequently, with amendments coming out each year. If you are on point to deliver a system with a certain compliance profile, you can expect to need to adapt to the changing regulations and requirements.

There are "spot" solutions for many specific functionality types, for example ePrescribe, custom reporting or vaccine registry transmission, which can be composed together to support many configurations.

However, at the core of your system, we recommend a highly programmable, well-documented. FHIR enabled infrastructure like [Medplum](https://www.medplum.com/) as a base. This will give you the infrastructure needed to orchestrate the ever-changing suite of tools needed to comply with the required regs.
