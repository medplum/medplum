# HTI-4

The "Health Data, Technology, and Interoperability" (HTI-4) rule is a new ONC regulation finalized on July 31, 2025, becoming effective October 1, 2025. This rule modernizes the entire prescribing workflow by mandating new technical certifications across all certified health IT systems, shifting key interoperability functions from optional features to mandatory requirements for certification.

The regulation aims to reduce administrative burden and clinician burnout related to prior auth, saving an estimated $19 billion in labor costs over ten years.

Medplum can be used for both [CMS-0057-F](https://www.cms.gov/files/document/fact-sheet-cms-interoperability-and-prior-authorization-final-rule-cms-0057-f.pdf) and [CMS-9115-F](https://www.cms.gov/files/document/cms-9115-f.pdf) compliance. Medplum flexibly supports both scenarios through use of our terminology services, FHIR profiles, and other key infrastructure primitives.

Medplum is pursuing certification for all three technical mandates for payor and provider organizations. Reach out to [hello@medplum.com](mailto:hello@medplum.com) if you are interested in learning more.

##  Technical Mandates

HTI-4 updates the ONC Certification Program by linking three critical criteria that work together to create a seamless, automated workflow:

### e-Prescribing (eRx) Update

Mandates the NCPDP SCRIPT v2023011 standard for all electronic prescribing systems. This new standard now requires systems to support electronic prior authorization (ePA) transactions directly within the prescribing workflow—no more manual processes.

### Real-Time Prescription Benefit (RTPB)

A new, mandatory criterion requiring the NCPDP RTPB v13 standard for cost transparency. Forces EHRs to display patient-specific drug costs and lower-cost alternatives at the point of care, enabling informed prescribing decisions.

### Electronic Prior Authorization (ePA)

Three new mandatory criteria based on HL7 FHIR APIs for medical benefits automation. This fully automates ePA by requiring EHRs to support:
- **CRD** (Coverage Requirements Discovery)
- **DTR** (Documentation Templates & Rules)
- **PAS** (Prior Authorization Support)

## Stakeholders

The following stakeholders will need to comply as follows:

### Healthcare Providers

Must use an EHR system that is certified to these new ePA standards and meet reporting requirements. Provider reporting for the new ePA measure in the MIPS Promoting Interoperability program begins in Calendar Year 2027.

### Payers (Health Plans)

A parallel CMS rule (CMS-0057-F) forces payers to build the other side of the FHIR APIs. Payers must have their ePA (CRD/DTR/PAS) APIs live and fully functional by January 1, 2027.

## Compliance Timeline

| Date | Milestone |
| ---- | --------- |
| Oct 1, 2025 | **Rule Effective** - HTI-4 becomes official. Developers can begin certifying to the new standards. |
| Jan 1, 2027 | **Payer Deadline** - Payers must have their Prior Authorization FHIR APIs (CRD, DTR, PAS) operational. |
| CY 2027 | **Provider Reporting** - Providers begin the first MIPS reporting year for the new ePA measure. |
| Dec 31, 2027 | **Transition Period Ends** - Last day developers can use the old NCPDP SCRIPT v2017071 standard. |
| Jan 1, 2028 | **Compliance Deadline** - All eRx modules must be certified to SCRIPT v2023011. RTPB becomes required and is added to the "Base EHR" definition. |

## Related Reading

- [CMS Interoperability and Prior Authorization Final Rule (CMS-0057-F)](https://www.cms.gov/files/document/fact-sheet-cms-interoperability-and-prior-authorization-final-rule-cms-0057-f.pdf)
- [CMS-9115-F](https://www.cms.gov/files/document/cms-9115-f.pdf)
- [CARIN IG for Blue Button®](http://hl7.org/fhir/us/carin-bb/STU1/)
- [DaVinci PDEX Payer Network](http://hl7.org/fhir/us/davinci-pdex-plan-net/STU1/)
- [DaVinci Payer Data Exchange (PDex) US Drug Formulary](http://hl7.org/fhir/us/davinci-drug-formulary/STU1.0.1/)
- [ONC API Resource Guide](https://onc-healthit.github.io/api-resource-guide/)
- [Medplum Bulk FHIR Implementation](/docs/api/fhir/operations/bulk-fhir)
- [DaVinci IG for Notifications](http://hl7.org/fhir/us/davinci-alerts/)
- [DaVinci Project](https://confluence.hl7.org/display/DVP)
