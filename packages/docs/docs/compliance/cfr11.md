# CFR Part 11 Certification

:::caution Note

This section is under active development.

:::

The following tutorial walks through CFR Part 11 certification requirements and documentation of Medplum's conformance, where appropriate.

## Materials and Usage

| Resource Name     | Description                                       | Access                                                                                                                                                     |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FDA Guidance      | Requirements checklist                            | [FDA.gov](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application) |
| Security Overview | General information on Medplum security practices | [medplum.com](https://www.medplum.com/security)                                                                                                            |


## Supporting Matrix

| 21 CFR Part 11 Requirement | Description | Documentation |
| --- | --- | --- |
| **Subpart B: Electronic Records** | | |
| **§ 11.10 Controls for closed systems** | Procedures and controls to ensure the authenticity, integrity, and confidentiality of electronic records. | All access is authenticated. Writes and changes are tracked. Special privileges are needed to delete data. Roles and access controls enabled. Data is encrypted at rest and in transit. Regular security review and audits are performed. |
| **Validation** | Validation of systems to ensure accuracy, reliability, consistent intended performance, and the ability to discern invalid or altered records. | Medplum maintains audit logs and edit history for all data and data access.  A Quality Management System (QMS) is also employed to ensure tracability.  Read more in the [ONC Certification](/docs/compliance/onc) documentation, particularly for criteria `(g)(3) Safety Enhanced Design` and `(g)(4) Quality Management System` |
| **Audit Trails** | Secure, computer-generated, time-stamped audit trails to independently record the date and time of operator entries and actions that create, modify, or delete electronic records. | Medplum maintains timestamped audit trails.  Read details on [ONC certification](/docs/compliance/onc) for `(d)(2) Auditable Events and Tamper-Resistance` and `(d)(3) Audit Report`, which directly address this requirement.|
| **Access Control** | Limiting system access to authorized individuals. | This is covered by Medplum's [ONC certification](/docs/compliance/onc) for `(d)(1) Authentication, Access Control, Authorization`. |
| **Record Retention and Retrieval** | Protection of records to enable their accurate and ready retrieval throughout the records retention period. | Medplum's platform, as a system for managing electronic health records, is designed for long-term data retention and retrieval, a core requirement of [HIPAA](/docs/compliance/hipaa) and other healthcare regulations they comply with. |
| **System Documentation** | Maintenance of complete and accurate documentation. | Medplum provides extensive documentation on their platform, including their [compliance with various standards](/docs/compliance), versioning policies, and API specifications. |
| **Subpart C: Electronic Signatures** | | |
| **§ 11.50 Signature Manifestations** | Signed electronic records must contain the printed name of the signer, the date and time of the signature, and the meaning of the signature (e.g., review, approval). | While Medplum's documentation doesn't specify their native electronic signature capabilities in detail, it is a common and accepted practice to use a compliant third-party service like DocuSign, which is designed to meet these specific requirements. |
| **§ 11.70 Signature/Record Linking** | Electronic signatures must be linked to their respective electronic records to ensure the signatures cannot be excised, copied, or otherwise transferred to falsify an electronic record by ordinary means. | Systems like DocuSign, when integrated with a platform like Medplum, provide a secure, linked signature that is a part of the audited record. |
| **§ 11.100 General Requirements** | Each electronic signature shall be unique to one individual and shall not be reused by, or reassigned to, anyone else. | This is a standard feature of compliant electronic signature systems. Medplum's [ONC certification](/docs/compliance/onc) for `(d)(12) Encrypt Authentication Credentials` and `(d)(13) Multi-factor Authentication` speaks to their commitment to secure and unique user identification. |
| **§ 11.200 Electronic signature components and controls** | Electronic signatures can be based upon biometrics or upon two distinct identification components such as an identification code and password. | This is also a standard feature of compliant electronic signature systems. The use of a compliant third-party provider would ensure this requirement is met. |
| **§ 11.300 Controls for identification codes/passwords** | Controls for ensuring the security and integrity of identification codes and passwords. | Medplum's [ONC certification](/docs/compliance/onc) for `(d)(12) Encrypt Authentication Credentials` and `(d)(13) Multi-factor Authentication` directly addresses these controls. |