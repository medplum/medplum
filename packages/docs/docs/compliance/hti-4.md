---
sidebar_position: 8
---

# HTI-4

The Health Data, Technology, and Interoperability: Electronic Prescribing, Real-Time Prescription Benefit and Electronic Prior Authorization (HTI-4) final rule updates the ONC Health IT Certification Program. It took effect October 1, 2025. See the [ONC overview and key dates](https://healthit.gov/resources/hti-4-overview-and-key-dates-for-certification-program/).

For payer API obligations and provider reporting requirements, see [CMS-0057-F](/docs/compliance/cms-0057-f).

## Electronic Prescribing and Prescription Benefits

HTI-4 updates electronic prescribing criterion **(b)(3)** to NCPDP SCRIPT v2023011, including required electronic prior authorization transactions for prescriptions. The transition from SCRIPT v2017071 ends December 31, 2027.

Starting January 1, 2028, modules certified to **(b)(3)** must use SCRIPT v2023011 and also certify to **(b)(4)**, Real-Time Prescription Benefit (RTPB), using NCPDP RTPB v13.

## Electronic Prior Authorization

HTI-4 adds three provider API certification criteria:

| Criterion   | Workflow                                |
| ----------- | --------------------------------------- |
| **(g)(31)** | Coverage Requirements Discovery (CRD)   |
| **(g)(32)** | Documentation Templates and Rules (DTR) |
| **(g)(33)** | Prior Authorization Support (PAS)       |

Developers choosing these criteria must meet the applicable API and Real World Testing conditions. CRD certification also requires **(j)(20)** CDS Hooks; PAS certification also requires **(j)(21)** Subscriptions — client.

## Medplum Certification Status

Medplum is pursuing ONC certification for CRD, DTR, and PAS. We have not announced a certification timeline. See [ONC Certification](/docs/compliance/onc) for Medplum's currently certified criteria.

Medplum v5 has separately earned [Drummond Validated™ – FHIRplace Silver (CRD) status for Q3 2026](/docs/compliance/cms-0057-f#drummond-fhirplace-validation) in both provider and payer roles. FHIRplace interoperability validation does not establish ONC certification to the new ePA criteria.

## Related Reading

- [CMS-0057-F](/docs/compliance/cms-0057-f)
- [Electronic Prior Authorization](/docs/integration/electronic-prior-auth)
- [CDS Hooks](/docs/integration/cds-hooks)
- [Medplum ONC Certification](/docs/compliance/onc)
