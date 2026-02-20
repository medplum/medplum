# Multi-Tenancy and Access Controls

Medplum's multi-tenant architecture is designed specifically for healthcare organizations that need **enterprise-grade data isolation** while retaining **flexibility to customize access** with both roles within the organization and with external partners. Medplum architecture does this all while meeting regulatory requirements across jurisdictions, maintaining performance guarantees, and retaining the economic and organizational benefits of shared infrastructure. 

---

## How does tenancy work at Medplum? 

Data is tenanted in Medplum primarily in two layers: at the project level, and at the intra-project level. 

A [Medplum Project](/docs/access/projects) is a fully isolated workspace for FHIR resources, and forms the core boundary for access control and data separation on the Medplum platform. Resources in one project cannot reference or interact with those in another, and users can only access data within the specific project to which they are granted access. All access tokens, whether for users or service accounts, are strictly limited to a single project.

:::info Project-level data isolation

As of Feb 2026, data isolation is enforced at the application layer. The 2026 road includes [database sharding](https://www.medplum.com/blog/2026-roadmap#enterprise-scale--infrastructure), which would allow for strict database level isolation. Follow the [Github discussion](https://github.com/medplum/medplum/discussions/6026)!

:::

Medplum's [intra-project tenancy model](/docs/access/multi-tenant-access-policy) enables fine-grained data segmentation within a single project. By default, every patient forms a distinct [patient compartment](/docs/access/multi-tenant-access-policy#why-is-patient-a-special-case), ensuring all data relating to that patient remains isolated. Users can group patient data or any subset of FHIR data into larger logical tenants that align with business needs or regulatory requirements, whether by clinic, geography, service area, or any other structure.

Medplum's tenancy model can be further segmented using access policies. Access policies can ensure that users only have access to specific tenant, and even subsets of tenants 


## Benefits of Medplum's Multi-Tenant Architecture

- **Data Isolation by Default:** Every project is fully isolated, preventing accidental or unauthorized cross-project access. Users and applications can only access the project(s) they’re assigned to.

- **Fine-Grained Access Controls:** Define custom access policies at both the project and intra-project level. Grant access on a need-to-know basis, including segmenting data by region, clinic, department, or any business unit.

- **Flexible Collaboration:** Enable secure, limited access for third parties—such as contract workforce, referral partners, and patients—without exposing the rest of your data. Easily give partners access only to what they need (e.g., a directory, a patient list, or referral data).

- **Simplified Regulatory Compliance:** Logical and technical boundaries help your organization meet strict requirements for HIPAA, SOC 2, and regional data regulations, supporting audit and reporting requirements.

- **Scalable and Secure by Design:** Whether you’re running a single clinic or building a platform for hundreds of organizations, Medplum’s tenancy model supports efficient and secure resource sharing with minimal overhead. 


---

## Related Documentation

- [Projects Documentation](/docs/access/projects) - Technical details on project-based isolation
- [Multi-Tenant Access Control](/docs/access/multi-tenant-access-policy) - Implementation guide for organization-level multi-tenancy
- [Multi-Tenant Decision Guide](/solutions/compliance-security/multi-tenant-decision-guide) - Operational guide for choosing your tenanting model
- [Security Overview](/security) - Comprehensive security documentation
- [Compliance Overview](/docs/compliance) - Detailed compliance information
- [MSO Demo Application](https://github.com/medplum/medplum-mso-demo) - Example implementation of organization-level multi-tenancy
- [Bulk Data Export](/docs/api/fhir/operations/bulk-fhir) - Data export capabilities
- [Self-Hosting Guide](/docs/self-hosting) - Guide for self-hosted deployments

---

*This document provides an executive-level overview of Medplum's multi-tenant architecture. For technical implementation details, please refer to the technical documentation or schedule a consultation with our solutions engineering team.*
