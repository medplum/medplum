---
slug: technical-guide-to-tefca
title: Technical Guide to TEFCA
authors: andrei-zudin
tags: [self-host, integration, interop, community]
---

# A Technical Guide to TEFCA Integration for Software Developers and Health IT Professionals

> [Andrei Zudin](https://www.linkedin.com/in/andrei-zudin-phd-1300021) is a healthcare interoperability expert and advisor to the Medplum community.  He is the former CTO and co-founder of [Health Gorilla](https://healthgorilla.com/).

> A Technical Guide to TEFCA Integration for Software Developers and Health IT Professionals ([Download as PDF](https://drive.google.com/file/d/11xRALs60J-hwkdylll0biRMa63peYnFm/view?usp=sharing))

## Purpose

This white paper aims to provide a **technical guide for software developers and healthcare IT professionals seeking to integrate their systems with the Trusted Exchange Framework** **and Common Agreement** (TEFCA). It delves into the technical aspects of TEFCA, including the various participation models, QHIN connectivity, data exchange methods, and security considerations. It also explores the incentives for TEFCA participation and how Medplum can help organizations achieve TEFCA compliance and leverage its benefits.

<!-- truncate -->

## Background

The healthcare industry has long struggled with **fragmented data**, leading to **inefficiencies**, errors, and suboptimal patient care. TEFCA represents a step towards addressing these challenges by establishing a nationwide framework for secure and interoperable health information exchange[^1]. By participating in TEFCA, healthcare organizations can improve care coordination, reduce costs, and enhance patient outcomes[^2].

## Understanding the TEFCA Framework

TEFCA, enacted through the 21st Century Cures Act, aims to establish a **universal policy** and **technical floor** for nationwide interoperability[^3]. It seeks to simplify connectivity for organizations to securely exchange information to improve patient care, enhance the welfare of populations, and generate healthcare value[^3]. TEFCA operates as a "network of networks," connecting various Health Information Networks (HINs) across the country[^1]. These HINs, upon meeting specific criteria and undergoing a vetting process, are designated as Qualified Health Information Networks (QHINs)[^4].


### TEFCA Goals

TEFCA has three primary goals:

1. Establish a **universal policy and technical framework** for nationwide interoperability.  
2. **Simplify connectivity** for organizations to securely exchange information.  
3. **Empower individuals (patients)** to gather their own health information[^3].

### Trusted Exchange Framework (TEF) Principles

The Trusted Exchange Framework (TEF) outlines seven foundational principles for trust policies and practices to facilitate data sharing among HINs:

1. **Standardization:** Prioritize the use of federally recognized and industry-acknowledged technical standards, policies, best practices, and procedures for a cohesive and efficient exchange ecosystem[^5].  
2. **Openness and Transparency:** QHINs should operate transparently, promoting stakeholder trust and fostering a collaborative environment[^5].  
3. **Cooperation and Non-discrimination:** QHINs should cooperate with each other and not discriminate against other HINs or participants[^5].  
4. **Privacy:** QHINs should prioritize the privacy of individuals' health information and comply with applicable privacy laws and regulations[^5].  
5. **Security and Safety:** QHINs should ensure the security and safety of health information exchange, protecting it from unauthorized access and disclosure[^5].  
6. **Access:** QHINs should facilitate and promote a clear understanding of how information has been used or disclosed while adhering to civil rights obligations on accessibility[^5].  
7. **Equity:** QHINs should consider the diverse impacts of interoperability on different populations and throughout the entire lifecycle of the activity, ensuring an inclusive approach[^5].

These principles guide the development and implementation of TEFCA, fostering a trustworthy and reliable health information exchange ecosystem.

### TEFCA Architecture

TEFCA operates as a "**network of networks**," connecting various Health Information Networks (HINs) across the country[^1]. These HINs, upon meeting specific criteria and undergoing a rigorous vetting process, are designated as Qualified Health Information Networks (QHINs)[^4]. QHINs serve as facilitators of nationwide interoperability within the TEFCA framework, adhering to a common set of rules and technical specifications[^1].

Participants, such as healthcare providers, health systems,  payers, connect to a QHIN to engage in TEFCA exchange[^6]. Subparticipants, often members of a Participant's organization, can also connect to a QHIN through a Participant[^6]. This layered structure creates an interconnected network where data can flow seamlessly between different organizations and systems.

![Exchange under TEFCA](/img/blog/exchange-under-tefca.png)

The following table illustrates the different ways an organization can participate in TEFCA:

| Participation Model | Description |
| :---- | :---- |
| QHIN | A large HIN that serves as the backbone for nationwide interoperability, connecting to other QHINs and facilitating data exchange between its Participants and Subparticipants. |
| Participant | An organization that connects to a QHIN to engage in TEFCA exchange, typically a healthcare individual patient, provider, health system, government agency or payer. |
| Subparticipant | An organization that connects to a QHIN through a Participant, often a member of the Participant's organization. |

### 

![QHIN](/img/blog/qhin.png)

### Qualified Health Information Networks (QHINs)

QHINs are the foundation of the TEFCA framework, responsible for ensuring secure and reliable health information exchange across the network[^1]. They play a crucial role in upholding the principles of TEFCA and ensuring compliance with the Common Agreement.

To become a QHIN, an organization must meet stringent requirements, including:

* **Ownership Requirements:** Being a U.S. entity with no foreign control that could pose a national security risk[^7].  
* **Exchange Requirements:** Demonstrating the capability to exchange Electronic Health Information (EHI) with multiple unaffiliated organizations, supporting all required exchange purposes, and adhering to non-discrimination policies[^7].  
* **Designated Network Services Requirements:** Maintaining a robust and secure network infrastructure, establishing data governance policies, and ensuring compliance with privacy and security standards[^8].

**QHIN Onboarding**

The QHIN onboarding process involves several steps to ensure the organization's readiness for participation in TEFCA exchange. This includes:

* **Application and Review:** Submitting a comprehensive application with supporting documentation and undergoing a thorough review by the Recognized Coordinating Entity (RCE)[^7].  
* **Testing:** Conducting tests to ensure the QHIN's network can connect to those of other QHINs[^7].  
* **Production Environment Integration:** Successfully integrating the QHIN's network into the TEFCA production environment and demonstrating the ability to exchange data with other QHINs[^7].

This rigorous onboarding process ensures that QHINs meet the technical and operational requirements for secure and reliable health information exchange within the TEFCA framework.

As of March 2025, eight organizations have been designated as QHINs:

| QHIN | Description |
| :---- | :---- |
| CommonWell Health Alliance | A non-profit trade association focused on enabling nationwide health data exchange. |
| eHealth Exchange | A nationwide health information network that facilitates data exchange between federal agencies and private sector healthcare organizations. |
| Epic Nexus | A QHIN specifically for organizations using Epic's EHR systems. |
| Health Gorilla | A health information network that focuses on providing access to clinical data, including social determinants of health (SDOH) data. |
| KONZA National Network | A national health information network that enables data exchange across different care settings and communities. |
| Kno2 | A health information network that provides solutions for connecting healthcare providers, health plans, and public health agencies. |
| MedAllies | A nationwide health information network that offers a platform for secure and efficient data exchange. |
| eClinicalWorks | A QHIN specifically for organizations using eClinicalWorks' EHR systems. |

### Data Exchange Methods

TEFCA supports both document-based (CDA) and FHIR-based exchange methods to accommodate the diverse needs of healthcare organizations.

**Document-Based Exchange**

The initial iteration of TEFCA focuses on document-based exchange, leveraging existing standards and infrastructure[^9]. This involves the exchange of HL7 CDA documents, which are widely used in healthcare for sharing clinical information[^9]. TEFCA leverages Integrating the Healthcare Enterprise (IHE) profiles, such as Cross-Community Patient Discovery (XCPD) and Cross-Community Access (XCA), to facilitate the secure retrieval of these documents[^5].

**FHIR-Based Exchange**

While the first iteration of TEFCA focuses on document-based exchange and supports facilitated FHIR exchange, FHIR is not mandatory at this time. Nevertheless a large number of Participants and Sub-participants voluntarily use FHIR as it addresses their needs best. Examples of such use cases included but not limited to Individual Access Services using SMART-on-FHIR and Electronic Case Reporting. More use cases and exchange purposes are on the roadmap for future development[^9]. The TEFCA FHIR roadmap outlines a phased approach for incorporating FHIR into TEFCA, with the goal of enabling more granular and standardized data exchange[^5]. This will allow developers to leverage FHIR APIs for accessing and exchanging data, promoting interoperability and innovation in healthcare applications.

### Patient Matching in TEFCA

Patient matching is a critical aspect of TEFCA, ensuring that the correct patient data is accessed and exchanged[^5]. Accurate patient matching is essential for preventing errors, improving care coordination, and ensuring the integrity of health information exchange.

TEFCA acknowledges the challenges of patient matching and plans to work with QHINs to create future patient-matching guidelines[^5]. This collaborative approach will help improve patient matching accuracy and consistency across the TEFCA network.

## Key Considerations for QHIN Connectivity

Connecting to a QHIN is a crucial step for organizations seeking to participate in TEFCA exchange. Here are some key considerations:

* **Technical Requirements:** Organizations must ensure their systems meet the technical specifications specific to the QHIN of their choice. Organizations can join several QHINs if necessary. Depending on the selected QHIN connectivity specifications may  include supporting IHE profiles, FHIR IGs, security standards, patient matching methods, and provenance tracking[^6].  
* **Data Governance and Compliance:** Organizations must establish data governance policies and procedures that align with TEFCA requirements and flow down agreements. This includes addressing data quality control, data storage, and legal considerations related to privacy and security[^10].  
* **Operational Considerations:** Organizations should consider operational factors such as network traffic, potential data quality issues, and the dispute resolution process when connecting to a QHIN[^7].  
* **Choosing a QHIN:** Organizations should carefully evaluate different QHINs based on their technical capabilities, network reach, governance model, and participation costs[^6].

## Medplum & TEFCA

Becoming a TEFCA compatible FHIR responding node is part of the Medplum roadmap and we hope to connect with organizations that are interested in this functionality.

Today, Medplum is a healthcare platform that can help organizations achieve TEFCA compliance and leverage its benefits[^11]. It offers a range of capabilities that align with TEFCA requirements, including:

* **Integration Engine:** Medplum's integration engine supports various healthcare data exchange standards, including FHIR, HL7, and CCD-A[^12]. This allows organizations to connect their existing systems to QHINs and participate in TEFCA exchange.  
* **FHIR Support:** Medplum is FHIR-native, providing a FHIR datastore and API for storing and accessing healthcare data[^13]. This ensures compliance with TEFCA's future direction towards FHIR-based exchange.  
* **Security Features:** Medplum prioritizes security and compliance, offering HIPAA compliance, SOC2 certification, and robust security controls[^14]. This helps organizations meet TEFCA's security requirements and protect patient data.

The following are specific features that relate to TEFCA that are on the Medplum roadmap.

| Feature Area | Feature | Description | Plan |
| :---- | :---- | :---- | :---- |
| Authentication | TEFCA Certificates | Authentication via TEFCA X.509 certificates | On Roadmap |
| Administration | Dynamic Client Registration ([UDAP](https://www.udap.org/udap-dynamic-client-registration-stu1.html)) | Dynamic client registration with support for Basic App Certification | On Roadmap |
| Authorization | Authorization Extension Objects | Support TEFCA-specific authorization extension for user and apps | On Roadmap |
| Error Handling | Error responses with TEFCA support | Medplum's error responses need to include TEFCA Authorization Extension Error objects. | On Roadmap |
| Identity | Patient Match | Medplum's FHIR implementation should support the $match operation | On Roadmap |
| Auditability | FHIR Provenance | Track FHIR resources through transformations | On Roadmap |

### Addressing the Gaps

Medplum is committed to supporting TEFCA and has a roadmap for addressing any potential gaps in its capabilities[^15]. This includes plans for enhancing FHIR-based exchange functionalities, expanding its integration engine to support emerging TEFCA use cases, and continuously improving its security and compliance posture.

### Medplum's Value Proposition

Medplum offers a compelling value proposition for organizations looking to participate in TEFCA:

* **Open-Source:** Medplum's core technology is open source, providing flexibility, transparency, and community-driven innovation[^16].  
* **Comprehensive Feature Set:** Medplum offers a wide range of features, including questionnaires, scheduling, communications, care plans, and analytics, enabling organizations to build comprehensive healthcare solutions[^16].  
* **Simplified Compliance:** Medplum simplifies compliance with HIPAA and other healthcare regulations, providing built-in audit capabilities and secure authentication[^16].

## Incentives for TEFCA Participation

Participating in TEFCA offers several incentives for healthcare organizations:

* **Regulatory Requirements:** TEFCA aligns with federal regulations and may be required for participation in certain government programs[^6].  
* **Value-Based Care:** TEFCA facilitates data exchange necessary for value-based care models, enabling care coordination and improved patient outcomes[^6].  
* **Improved Patient Care:** TEFCA enables access to a more complete patient record, leading to better clinical decision-making and improved care coordination[^6].  
* **Enhanced Interoperability:** TEFCA promotes interoperability across different healthcare systems, enabling seamless data exchange and reducing administrative burden[^6].  
* **Public Health Reporting:** TEFCA facilitates public health reporting, enabling the electronic submission of case reports and other critical data[^6].  
* **Competitive Advantage:** TEFCA participation can provide a competitive advantage by demonstrating a commitment to interoperability and data exchange[^6].

## Data Governance and Compliance

TEFCA emphasizes data governance and compliance to ensure the responsible and secure exchange of health information. Key considerations include:

* **Data Quality Control:** QHINs and their participants are responsible for implementing data quality control measures to ensure the accuracy and reliability of exchanged data[^17].  
* **Data Storage:** QHINs generally act as pass-throughs for data and do not store it. Participants and Subparticipants become stewards of the data they consume and are responsible for its storage and use in compliance with HIPAA and other applicable laws[^17].  
* **Legal Considerations:** Agreements between QHINs, Participants, and Subparticipants address how information will be exchanged and do not alter existing legal authority for accessing or sharing data[^17].

## Operational Considerations

When connecting to a QHIN, organizations should consider the following operational aspects:

* **Network Traffic:** QHINs are designed to handle high volumes of transactions, but organizations should monitor network traffic and potential bottlenecks[^17].  
* **Data Quality Issues:** Organizations should have processes in place to address potential data quality issues and escalate concerns to the RCE if necessary[^17].  
* **Dispute Resolution:** Organizations should be familiar with the TEFCA dispute resolution process for resolving any issues or disagreements that may arise[^17].

## The Evolving Landscape and Future of TEFCA

TEFCA is shaping the future of healthcare interoperability, and its landscape is constantly evolving.

### The Role of Epic and Other EHR Vendors

Epic, a leading EHR vendor, plays a significant role in TEFCA. Epic has developed its own QHIN, Epic Nexus, to facilitate TEFCA participation for its customers[^18]. As of December 2024, Epic Nexus has connected 625 hospitals to the TEFCA network[^18]. This demonstrates the commitment of EHR vendors to supporting TEFCA and promoting nationwide interoperability.

### The Future of Carequality and CommonWell

Carequality and CommonWell, two major health information exchange frameworks, are aligning their strategies with TEFCA[^19]. Carequality is enhancing its framework to bolster trust and plans to converge with TEFCA in the future[^19]. CommonWell, now a designated QHIN, is actively collaborating with TEFCA to improve data exchange and interoperability[^20]. This convergence of existing frameworks with TEFCA will further strengthen nationwide interoperability and streamline data exchange.

### Emerging Use Cases

TEFCA is enabling new and innovative use cases for health information exchange. Some examples include:

* **Electronic Case Reporting:** TEFCA facilitates electronic case reporting to public health agencies, enabling the automated transmission of case reports and supporting public health surveillance[^21].  
* **Public Health Data Exchange:** TEFCA enables public health agencies to access and exchange data for various purposes, such as case investigations, syndromic surveillance, and immunization reporting[^21].  
* **HEDIS Reporting:** TEFCA is being explored for HEDIS reporting, potentially streamlining data collection and reducing the burden associated with quality measurement[^22].

These emerging use cases demonstrate the potential of TEFCA to transform healthcare interoperability and improve various aspects of healthcare delivery and public health.

## Benefits of TEFCA for Developers

TEFCA offers several benefits for software developers:

* **Facilitating Innovation:** TEFCA provides a standardized framework for data exchange, removing barriers to innovation and enabling the development of new technologies and applications[^2].  
* **Reducing Administrative Burden:** TEFCA streamlines data exchange processes, reducing administrative burden and allowing developers to focus on building and improving healthcare solutions[^2].  
* **Promoting the Development of New Technologies:** TEFCA fosters a collaborative environment for developing new technologies and applications that leverage interoperable health data[^2].

## Challenges and Opportunities of TEFCA

While TEFCA presents a significant opportunity for improving healthcare interoperability, there are also challenges to consider:

* **Implementation Complexity:** Implementing TEFCA requires careful planning and coordination to ensure compliance with technical specifications, governance policies, and security requirements[^10].  
* **Stakeholder Alignment:** Achieving widespread adoption of TEFCA requires alignment and collaboration among various stakeholders, including healthcare providers, payers, health IT vendors, and government agencies[^10].

Despite these challenges, TEFCA offers a unique opportunity to create a more connected and interoperable healthcare system, leading to improved patient care, enhanced efficiency, and greater innovation.

## Security Considerations

TEFCA prioritizes security and privacy, requiring QHINs and their participants to implement robust security controls[^23]. These include:

* **HIPAA Compliance:** QHINs and participants subject to HIPAA must comply with its privacy and security rules[^23].  
* **Data Encryption:** All entities must encrypt individually identifiable information, both in transit and at rest[^23].  
* **Cybersecurity Measures:** QHINs must implement cybersecurity measures, including annual technical audits, penetration testing, and incident reporting[^23].  
* **Identity Proofing and Authentication:** TEFCA requires strong identity proofing and authentication mechanisms to ensure secure access to health information[^23].

These security measures help protect patient data and maintain the integrity and trustworthiness of the TEFCA exchange ecosystem.

## Conclusion

TEFCA represents a significant advancement in healthcare interoperability, establishing a nationwide framework for secure and efficient data exchange. By connecting various health information networks and their participants, TEFCA enables seamless access to patient information, improves care coordination, and promotes innovation in healthcare.

Software developers and healthcare IT professionals play a crucial role in integrating systems with TEFCA. By understanding the technical specifications, governance policies, and security requirements of TEFCA, they can ensure their applications and organizations are TEFCA-compliant and leverage its benefits.

Medplum offers a valuable platform for organizations seeking to participate in TEFCA. Its integration engine, FHIR support, and security features facilitate QHIN connectivity and enable the development of interoperable healthcare solutions.

The evolving landscape of TEFCA, with the participation of major EHR vendors and the alignment of existing HIE frameworks, further strengthens the foundation for nationwide interoperability. Emerging use cases, such as electronic case reporting and public health data exchange, demonstrate the potential of TEFCA to transform healthcare and improve patient outcomes.

We encourage healthcare organizations and developers to embrace TEFCA and contribute to the development of a more connected and interoperable healthcare ecosystem.

## Glossary of Terms

| Term | Definition |
| :---- | :---- |
| **Access Consent Policy (ACP)** | Policies that may influence access control decisions and which can be referenced in queries[^24]. |
| **Actor** | A QHIN, Participant, or Subparticipant[^24]. |
| **Applicable Law** | All federal, state, local, or tribal laws and regulations then in effect and applicable to the activities of a QHIN, Participant, or Subparticipant[^24]. |
| **Breach of Unencrypted Individually Identifiable Information** | The acquisition, access, or disclosure of unencrypted individually identifiable information maintained by an Individual Access Services (IAS) Provider that compromises the security or privacy of the unencrypted individually identifiable information[^24]. |
| **Confidential Information** | Any information that is designated as confidential by the disclosing person or entity, or that a reasonable person would understand to be confidential, and is disclosed pursuant to a Framework Agreement[^24]. |
| **Delegate** | A QHIN, Participant, or Subparticipant that is not a Principal and has a written agreement with a Principal authorizing the Delegate to conduct TEFCA Exchange activities on behalf of the Principal[^24]. |
| **Delegated Request** | A TEFCA Exchange Request initiated by a Delegate working for a Principal[^24]. |
| **Designated Network** | The health information network that a QHIN uses to offer and provide Designated Network Services[^25]. |
| **Designated Network Governance Body** | A representative and participatory group or groups that approve the processes for fulfilling the Governance Functions and participate in such Governance Functions for Signatory's Designated Network[^25]. |
| **Directory Entry(ies)** | The listing of each Node controlled by a QHIN, Participant, or Subparticipant, which includes the Endpoint for such Node(s) and any other organizational or technical information required by the QTF or applicable SOP[^24]. |
| **Discovery** | For purposes of determining the date on which a TEFCA Security Incident was discovered, the term Discovery shall be determined consistent with 45 CFR § 164.402[^24]. |
| **Electronic Case Investigation** | A public health tool that involves a PHA gathering additional information in response to a disease or condition that has already been reported under Applicable Law[^24]. |
| **Enterprise Master Patient Index (eMPI)** | A system that coordinates patient identification across multiple systems by collecting, storing, and managing identifiers and patient-identifying demographic information from a source system[^24]. |
| **Exchange Modality** | QHIN Query, Message Delivery, and Facilitated FHIR[^24]. |
| **Exchange Purpose(s) or XP(s)** | The reason, as authorized by a Framework Agreement, including the applicable SOPs for a Transmission, Request, Use, Disclosure, or Response transacted through TEFCA Exchange[^24]. |
| **FHIR Adopters** | Any QHIN, Participant, or Subparticipant that wishes to engage in TEFCA Exchange using FHIR[^25]. |
| **FHIR Endpoint** | Has the meaning assigned to such term in the Health Level Seven (HL7®) FHIR® standard[^25]. |
| **FHIR Push** | A PUT or POST operation that submits data to a QHIN, Participant, or Subparticipant[^25]. |
| **FHIR Query** | An operation that Queries information from a Responding Node[^25]. |
| **QHIN Directory** | A system used by QHINs to record and resolve the identifiers and Endpoints of their Participants and Subparticipants[^25]. |
| **QHIN Message Delivery** | The act of a QHIN delivering information to one or more other QHINs[^25]. |
| **QHIN Query** | The act of a QHIN Querying information from one or more other QHINs[^25]. |
| **QHIN Technical Framework (QTF)** | The most recent effective version of the document that outlines the technical specifications and other technical requirements necessary for QHINs to exchange information[^25]. |


#### **Works cited**

1\. TEFCA | HealthIT.gov, accessed February 16, 2025, [https://www.healthit.gov/topic/interoperability/policy/trusted-exchange-framework-and-common-agreement-tefca](https://www.healthit.gov/topic/interoperability/policy/trusted-exchange-framework-and-common-agreement-tefca)  
2\. Understanding TEFCA: Key Changes and Impacts on Healthcare in 2025 and Beyond, accessed February 16, 2025, [https://www.productiveedge.com/blog/understanding-tefca-key-changes-and-impacts-on-healthcare-in-2025-and-beyond](https://www.productiveedge.com/blog/understanding-tefca-key-changes-and-impacts-on-healthcare-in-2025-and-beyond)  
3\. TEFCA Overview and Perspectives From the Field \- ASTHO, accessed February 16, 2025, [https://www.astho.org/48f67a/globalassets/pdf/tefca-overview-and-perspectives-slides-april-2024.pdf](https://www.astho.org/48f67a/globalassets/pdf/tefca-overview-and-perspectives-slides-april-2024.pdf)  
4\. Qualified Health Information Network | QHIN \- MedAllies, accessed February 16, 2025, [https://www.medallies.com/qualified-health-information-network-qhin/](https://www.medallies.com/qualified-health-information-network-qhin/)  
5\. TEFCA in Healthcare: TEFCA QHIN and Components of TEFC \- Kodjin, accessed February 16, 2025, [https://kodjin.com/blog/trusted-exchange-framework-and-common-agreement/](https://kodjin.com/blog/trusted-exchange-framework-and-common-agreement/)  
6\. Trusted Exchange Framework and Common Agreement (TEFCA) Overview \- CDC Foundation, accessed February 16, 2025, [https://www.cdcfoundation.org/TEFCADataSharingandImplementationCenters-JimJirjis.pdf?inline](https://www.cdcfoundation.org/TEFCADataSharingandImplementationCenters-JimJirjis.pdf?inline)  
7\. HTI-2 Final Rule Fact Sheet: TEFCA and QHIN Designations, Governance and Appeal Rights | HIMSS, accessed February 16, 2025, [https://gkc.himss.org/resources/hti-2-final-rule-fact-sheet-tefca-and-qhin-designations-governance-and-appeal-rights](https://gkc.himss.org/resources/hti-2-final-rule-fact-sheet-tefca-and-qhin-designations-governance-and-appeal-rights)  
8\. Standard Operating Procedure (SOP): TEFCA Security Incident Reporting, accessed February 16, 2025, [https://rce.sequoiaproject.org/wp-content/uploads/2024/07/SOP-TSI-Reporting-v1-508.pdf](https://rce.sequoiaproject.org/wp-content/uploads/2024/07/SOP-TSI-Reporting-v1-508.pdf)  
9\. Understanding TEFCA and its Role in National Interoperability \- Harmony Healthcare IT, accessed February 16, 2025, [https://www.harmonyhit.com/understanding-tefca-and-its-role-in-national-interoperability/](https://www.harmonyhit.com/understanding-tefca-and-its-role-in-national-interoperability/)  
10\. Decoding Interoperability: TEFCA and National Networks and Frameworks Explained, accessed February 16, 2025, [https://gkc.himss.org/news/decoding-interoperability-tefca-and-national-networks-and-frameworks-explained](https://gkc.himss.org/news/decoding-interoperability-tefca-and-national-networks-and-frameworks-explained)  
11\. Medplum | Medplum, accessed February 16, 2025, [https://www.medplum.com/](https://www.medplum.com/)  
12\. Integrations and Interoperability Engine \- Medplum, accessed February 16, 2025, [https://www.medplum.com/products/integration](https://www.medplum.com/products/integration)  
13\. Products | Medplum, accessed February 16, 2025, [https://www.medplum.com/products](https://www.medplum.com/products)  
14\. Security | Medplum, accessed February 16, 2025, [https://www.medplum.com/security](https://www.medplum.com/security)  
15\. Blog | Medplum, accessed February 16, 2025, [https://www.medplum.com/blog](https://www.medplum.com/blog)  
16\. Stop building your own EHR \- A CTO's introduction to Medplum, accessed February 16, 2025, [https://www.vintasoftware.com/blog/building-ehr-introducing-medplum](https://www.vintasoftware.com/blog/building-ehr-introducing-medplum)  
17\. TEFCA Frequently Asked Questions | ASTHO, accessed February 16, 2025, [https://www.astho.org/globalassets/pdf/tefca-frequently-asked-questions.pdf](https://www.astho.org/globalassets/pdf/tefca-frequently-asked-questions.pdf)  
18\. Health Systems Using Epic Have Connected 625 Hospitals to the ..., accessed February 16, 2025, [https://www.epic.com/epic/post/health-systems-using-epic-have-connected-625-hospitals-to-the-tefca-interoperability-framework-in-one-year/](https://www.epic.com/epic/post/health-systems-using-epic-have-connected-625-hospitals-to-the-tefca-interoperability-framework-in-one-year/)  
19\. Carequality Announcement About Framework Enhancements, accessed February 16, 2025, [https://carequality.org/carequality-announcement-about-framework-enhancements/](https://carequality.org/carequality-announcement-about-framework-enhancements/)  
20\. About CommonWell, accessed February 16, 2025, [https://www.commonwellalliance.org/about/](https://www.commonwellalliance.org/about/)  
21\. www.cdcfoundation.org, accessed February 16, 2025, [https://www.cdcfoundation.org/TEFCA-eCR-Query-Hartsell?inline](https://www.cdcfoundation.org/TEFCA-eCR-Query-Hartsell?inline)  
22\. Updated TEFCA SOPs for Health Care Operations and NCQA \- NCQA, accessed February 16, 2025, [https://www.ncqa.org/blog/updated-tefca-sops-for-health-care-operations/](https://www.ncqa.org/blog/updated-tefca-sops-for-health-care-operations/)  
23\. ASTP Final Rule Codifies Requirements for TEFCA-Qualified Health Information Networks, accessed February 16, 2025, [https://www.mwe.com/insights/astp-final-rule-codifies-requirements-for-tefca-qualified-health-information-networks/](https://www.mwe.com/insights/astp-final-rule-codifies-requirements-for-tefca-qualified-health-information-networks/)  
24\. TEFCA Glossary, accessed February 16, 2025, [https://rce.sequoiaproject.org/wp-content/uploads/2024/01/Draft-TEFCA-Glossary-508-Compliant.pdf](https://rce.sequoiaproject.org/wp-content/uploads/2024/01/Draft-TEFCA-Glossary-508-Compliant.pdf)  
25\. TEFCA Glossary, accessed February 16, 2025, [https://rce.sequoiaproject.org/wp-content/uploads/2024/07/TEFCA-Glossary\_508-1.pdf](https://rce.sequoiaproject.org/wp-content/uploads/2024/07/TEFCA-Glossary_508-1.pdf)

## Footnotes

[^1]: Framework for Public Health Interoperability \- Version 2.1 Published. NACCHO. (n.d.). Retrieved February 16, 2025, from [https://www.naccho.org/blog/articles/tefca-ver-2.1-published](https://www.naccho.org/blog/articles/tefca-ver-2.1-published)

[^2]: Health Data, Technology, and Interoperability: Trusted Exchange Framework and Common Agreement (TEFCA) Rule. Federal Register. (2024, December 16). Retrieved February 16, 2025, from [https://www.federalregister.gov/documents/2024/12/16/2024-29163/health-data-technology-and-interoperability-trusted-exchange-framework-and-common-agreement-tefca](https://www.federalregister.gov/documents/2024/12/16/2024-29163/health-data-technology-and-interoperability-trusted-exchange-framework-and-common-agreement-tefca)

[^3]: Trusted Exchange Framework and Common Agreement (TEFCA). HealthIT.gov. (n.d.). Retrieved February 16, 2025, from [https://www.healthit.gov/topic/interoperability/policy/trusted-exchange-framework-and-common-agreement-tefca](https://www.healthit.gov/topic/interoperability/policy/trusted-exchange-framework-and-common-agreement-tefca)

[^4]: Common Agreement \- ONC TEFCA RCE. The Sequoia Project. (n.d.). Retrieved February 16, 2025, from [https://rce.sequoiaproject.org/common-agreement/](https://rce.sequoiaproject.org/common-agreement/)

[^5]: TEFCA Overview and Perspectives Slides (April 2024). Association of State and Territorial Health Officials (ASTHO). (2024, April). Retrieved February 16, 2025, from [https://www.astho.org/48f67a/globalassets/pdf/tefca-overview-and-perspectives-slides-april-2024.pdf](https://www.astho.org/48f67a/globalassets/pdf/tefca-overview-and-perspectives-slides-april-2024.pdf)

[^6]: TEFCA Data Sharing and Implementation Centers. CDC Foundation. (n.d.). Retrieved February 16, 2025, from [https://www.cdcfoundation.org/TEFCADataSharingandImplementationCenters-JimJirjis.pdf?inline](https://www.cdcfoundation.org/TEFCADataSharingandImplementationCenters-JimJirjis.pdf?inline)

[^7]: Understanding TEFCA: Key Changes and Impacts on Healthcare in 2025 and Beyond. Productive Edge. (n.d.). Retrieved February 16, 2025, from [https://www.productiveedge.com/blog/understanding-tefca-key-changes-and-impacts-on-healthcare-in-2025-and-beyond](https://www.productiveedge.com/blog/understanding-tefca-key-changes-and-impacts-on-healthcare-in-2025-and-beyond)

[^8]: Epic TEFCA Alignment: Key Takeaways for Development Companies. Vitamin Software. (n.d.). Retrieved February 16, 2025, from [https://vitaminsoftware.com/blog/epic-tefca-alignment-key-takeaways-for-development-companies](https://vitaminsoftware.com/blog/epic-tefca-alignment-key-takeaways-for-development-companies)

[^9]: The Trusted Exchange Framework and Common Agreement (TEFCA) and Blockchain Technology. National Library of Medicine. (2024). Retrieved February 16, 2025, from [https://pmc.ncbi.nlm.nih.gov/articles/PMC10785864/](https://pmc.ncbi.nlm.nih.gov/articles/PMC10785864/)

[^10]: What is TEFCA? How the ONC's Trusted Exchange Framework Impacts Your Practice. RXNT. (n.d.). Retrieved February 16, 2025, from [https://www.rxnt.com/what-is-tefca-how-the-oncs-trusted-exchange-framework-impacts-your-practice/](https://www.rxnt.com/what-is-tefca-how-the-oncs-trusted-exchange-framework-impacts-your-practice/)

[^11]: Medplum. (n.d.). Retrieved February 16, 2025, from [https://www.medplum.com/](https://www.medplum.com/)

[^12]: Medplum Integration. (n.d.). Retrieved February 16, 2025, from [https://www.medplum.com/products/integration](https://www.medplum.com/products/integration)

[^13]: Medplum FHIR Datastore. (n.d.). Retrieved February 16, 2025, from [https://www.medplum.com/products/fhir-datastore](https://www.google.com/search?q=https://www.medplum.com/products/fhir-datastore)

[^14]: Medplum Security. (n.d.). Retrieved February 16, 2025, from [https://www.medplum.com/security](https://www.medplum.com/security)

[^15]: Medplum 2025 Roadmap. Medplum. (2025, January 8). Retrieved February 16, 2025, from [https://www.medplum.com/blog/medplum-2025-roadmap](https://www.google.com/search?q=https://www.medplum.com/blog/medplum-2025-roadmap)

[^16]: Building EHR: Introducing Medplum. Vinta Software. (n.d.). Retrieved February 16, 2025, from [https://www.vintasoftware.com/blog/building-ehr-introducing-medplum](https://www.vintasoftware.com/blog/building-ehr-introducing-medplum)

[^17]: TEFCA Frequently Asked Questions. Association of State and Territorial Health Officials (ASTHO). (n.d.). Retrieved February 16, 2025, from [https://www.astho.org/globalassets/pdf/tefca-frequently-asked-questions.pdf](https://www.astho.org/globalassets/pdf/tefca-frequently-asked-questions.pdf)

[^18]: Epic Welcomes Oracle Health to TEFCA. PR Newswire. (2024, October 28). Retrieved February 16, 2025, from [https://www.prnewswire.com/news-releases/epic-welcomes-oracle-health-to-tefca-302289098.html](https://www.prnewswire.com/news-releases/epic-welcomes-oracle-health-to-tefca-302289098.html)

[^19]: Carequality to align interoperability strategy with TEFCA. Healthcare IT News. (n.d.). Retrieved February 16, 2025, from [https://www.healthcareitnews.com/news/carequality-align-interoperability-strategy-tefca](https://www.healthcareitnews.com/news/carequality-align-interoperability-strategy-tefca)

[^20]: CommonWell Health Alliance is now a Designated Qualified Health Information Network™ (QHIN™). CommonWell Health Alliance. (n.d.). Retrieved February 16, 2025, from [https://www.commonwellalliance.org/tefca/](https://www.commonwellalliance.org/tefca/)

[^21]: TEFCA: A Framework for Public Health Interoperability - Version 2.1 Published. NACCHO. (n.d.). Retrieved February 16, 2025, from https://www.naccho.org/blog/articles/tefca-ver-2.1-published ↩ ↩2


[^22]: Updated TEFCA SOPs for Health Care Operations. NCQA. (n.d.). Retrieved February 16, 2025, from https://www.ncqa.org/blog/updated-tefca-sops-for-health-care-operations/ ↩


[^23]: The Impact of TEFCA & HITRUST on Patient Privacy and Security. A-LIGN. (n.d.). Retrieved February 16, 2025, from https://www.a-lign.com/articles/the-impact-of-tefca-hitrust-on-patient-privacy-and-security ↩ ↩2 ↩3 ↩4 ↩5


[^24]: TEFCA Glossary. The Sequoia Project. (2024, July). Retrieved February 16, 2025, from https://rce.sequoiaproject.org/wp-content/uploads/2024/07/TEFCA-Glossary_508-1.pdf ↩ ↩2 ↩3 ↩4 ↩5 ↩6 ↩7 ↩8 ↩9 ↩10 ↩11 ↩12 ↩13


[^25]: QHIN Technical Framework (QTF) Version 2.0. The Sequoia Project. (2024, July). Retrieved February 16, 2025, from https://rce.sequoiaproject.org/wp-content/uploads/2024/07/QTF-v2.0_508.pdf ↩ ↩2 ↩3 ↩4 ↩5 ↩6 ↩7 ↩8 ↩9 ↩10


