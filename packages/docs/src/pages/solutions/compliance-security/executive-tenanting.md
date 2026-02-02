# Multi-Tenant Architecture: Executive Evaluation Guide

## Executive Summary

Healthcare executives evaluating multi-tenant platforms face a critical decision: balancing cost efficiency with the absolute requirement for data security, regulatory compliance, and operational control. Medplum's multi-tenant architecture is designed specifically for healthcare organizations that need **enterprise-grade isolation** without sacrificing the economic benefits of shared infrastructure.

**The Core Challenge:** Healthcare organizations must ensure patient data never leaks between tenants, meet varying regulatory requirements across jurisdictions, maintain performance guarantees, and retain the flexibility to customize workflows—all while controlling costs and avoiding vendor lock-in.

**Medplum's Answer:** A FHIR-native, project-based tenanting model that provides hard data boundaries at the database level, per-tenant compliance configuration, performance isolation guarantees, and complete data portability—all built on open standards that prevent vendor lock-in.

---

## Critical Evaluation Questions

### 1. Data Isolation & Security

**The Question:** *"Can you guarantee with absolute certainty that patient data cannot leak between tenants?"*

**The Answer: Project-Level Hard Isolation**

Medplum enforces data isolation at multiple layers, ensuring that logical separation is backed by technical boundaries:

#### Database-Level Isolation
- **Project ID Enforcement**: Every FHIR resource is tagged with a `projectId` at the database level. This is not a soft partition—it's a hard constraint enforced by the application layer.
- **No Cross-Project References**: The system **prevents** resources in one project from referencing resources in another project. This is enforced at the API layer, not just recommended.
- **Dedicated Trust Zones**: Each customer environment is stored within a dedicated trust zone to prevent accidental or malicious co-mingling of data.

#### Encryption & Network Security
- **Encryption at Rest**: All data is encrypted using AES encryption. For self-hosted deployments, you can configure tenant-specific encryption keys through cloud provider key management services (AWS KMS, Azure Key Vault, GCP KMS).
- **Encryption in Transit**: All data transmission uses TLS 1.2/1.3.
- **Network Isolation**: For self-hosted deployments, you can configure network-level isolation using VPCs, subnets, and security groups per tenant.

#### Authentication & Authorization Isolation
- **Separate Authentication Flows**: Each project has its own user administration and authentication flows. Credentials, API keys, and secrets are never shared between projects.
- **Access Policy Enforcement**: Access policies are scoped to projects and enforced at the API layer before any database query is executed.

#### Compliance & Security Posture
- **SOC 2 Type II**: Annual audit by Prescient Assurance, demonstrating security controls meet AICPA standards. Audit reports available upon request.
- **HIPAA Compliant**: Full compliance with Health Insurance Portability and Accountability Act requirements, including Business Associate Agreement (BAA) support.
- **No Data Breach History**: Medplum maintains a clean security record with no known data breach incidents affecting tenant isolation.
- **Continuous Security Monitoring**: 24/7 security monitoring with automated threat detection.
- **Annual Penetration Testing**: Third-party security assessments conducted annually.

**For Multi-Organization Scenarios (within one Project):**
- **Organization-Based Access Control**: Using FHIR `Organization` resources and `AccessPolicy` with parameterized variables
- **Compartment-Based Isolation**: Resources are tagged with organization compartments using `meta.accounts` field
- **Access Policies**: Fine-grained control over which users can access which organization's data, with all access attempts logged and auditable

**Related Documentation:**
- [Projects Documentation](/docs/access/projects)
- [Multi-Tenant Access Control](/docs/access/multi-tenant-access-policy)
- [Security Overview](/security)

---

### 2. Regulatory Compliance per Tenant

**The Question:** *"Can each tenant have different compliance requirements, including state-specific regulations, research protocols, and data residency rules?"*

**The Answer: Per-Tenant Compliance Configuration**

Medplum supports tenant-specific compliance configurations, allowing each organization to meet its unique regulatory requirements:

#### Business Associate Agreements (BAAs)
- **Per-Project BAAs**: Each project (tenant) can have its own Business Associate Agreement with Medplum. This is standard practice for hosted Medplum customers.
- **Self-Hosted Control**: For self-hosted deployments, you maintain full control over BAAs with your own organization and can configure tenant-specific agreements.

#### Data Residency Requirements
- **Cloud Region Selection**: For self-hosted deployments, you can deploy Medplum in specific cloud regions (AWS, GCP, Azure) to meet data residency requirements.
- **Multi-Region Support**: Support for multi-region deployments allows you to place tenant data in specific geographic locations.
- **Project-Level Data Location**: Each project's data can be configured to reside in specific regions or cloud providers.

#### State-Specific Compliance
- **Custom Consent Management**: Each project can implement its own consent management workflows using FHIR `Consent` resources and custom [Questionnaires](/docs/api/fhir/resources/questionnaire).
- **State-Specific Forms**: Projects can maintain their own library of state-specific forms, consent documents, and regulatory templates.
- **Configurable Workflows**: Using [Bots](/docs/bots), each tenant can implement state-specific workflows, such as California's specific consent requirements or Texas's medical record retention rules.

#### Research vs. Clinical Compliance
- **Separate Projects for Research**: Academic medical centers can maintain separate projects for research protocols (requiring IRB oversight) versus clinical operations.
- **Custom Access Policies**: Research projects can implement stricter access controls, audit requirements, and data retention policies.
- **Compliance Tracking**: Each project maintains its own audit logs and compliance reports.

#### Additional Compliance Certifications
Medplum maintains multiple compliance certifications that benefit all tenants:
- **ONC Certified**: Certified for interoperability standards (B10 certification)
- **HITRUST**: Pursuing HITRUST certification (H1 2026)
- **HTI-4**: Compliance with HTI-4 mandates (aligned to January 2027 enforcement)
- **ISO 9001**: Quality management systems
- **CFR Part 11**: Electronic records compliance
- **CLIA/CAP**: Clinical laboratory compliance
- **GDPR**: Full compliance with data deletion support

**Related Documentation:**
- [Compliance Overview](/docs/compliance)
- [Questionnaires](/docs/products/questionnaires)
- [Bots Documentation](/docs/bots)

---

### 3. Performance Isolation

**The Question:** *"If Tenant A does a bulk data import, will that impact Tenant B's response times? What guarantees do we have?"*

**The Answer: Tenant-Specific Resource Allocation & Rate Limiting**

Medplum implements multiple layers of performance isolation to ensure that one tenant's usage cannot degrade another tenant's experience:

#### Per-Tenant Rate Limiting
- **Project-Level Rate Limits**: Each project has its own rate limit configuration, preventing any single tenant from consuming excessive system resources.
- **User-Level Rate Limiting**: Within each project, individual users have rate limits to prevent abuse.
- **Configurable Limits**: Rate limits can be customized per project based on your SLA requirements.
- **FHIR Operation Quotas**: Different FHIR operations (read, create, update, delete) have weighted point costs, ensuring fair resource allocation.

#### Database Query Isolation
- **Project-Scoped Queries**: All database queries are automatically scoped to the project context. A query from Project A **cannot** access data from Project B, even at the database level.
- **Indexed Performance**: Database indexes on `projectId` ensure efficient tenant-scoped queries without cross-tenant overhead.
- **No Cross-Tenant Query Impact**: Database query performance for one tenant is independent of other tenants' query patterns.

#### Resource Allocation
- **Horizontal Scaling**: Stateless application servers allow horizontal scaling. As tenant load increases, you can scale application servers without affecting other tenants.
- **Database Partitioning**: PostgreSQL with project-level partitioning via `projectId` column ensures efficient data access patterns.
- **Async Operations**: Heavy operations like bulk exports are handled asynchronously, preventing them from blocking other tenants' requests.

#### SLA Guarantees
- **Tenant-Specific SLAs**: For hosted Medplum, SLAs can be negotiated per project based on your requirements.
- **Performance Monitoring**: Each project's performance metrics are tracked independently, allowing you to monitor and optimize per-tenant.
- **Resource Caps**: Projects can have resource caps (e.g., maximum number of resources) to prevent runaway growth from impacting system performance.

#### Scaling Roadmap (2026)
- **Sharding Capabilities**: Implementing sharding for larger datasets to further isolate performance impact.
- **Data Archiving**: Archiving capabilities for historical data management, reducing active database size.
- **Kafka Integration**: Data warehouse integration via Kafka for high-volume connections, offloading heavy operations from the primary database.

**Related Documentation:**
- [Rate Limits](/docs/rate-limits)
- [Bulk Data Export](/docs/api/fhir/operations/bulk-fhir)

---

### 4. Customization vs. Standardization Trade-offs

**The Question:** *"We need cost benefits of multi-tenancy, but also need to customize clinical forms, integrate with our EHR, and white-label the interface. How much customization is possible?"*

**The Answer: Extensive Customization Without Breaking Multi-Tenancy**

Medplum is designed as a **platform**, not a rigid application. This means extensive customization is not only possible but expected:

#### Clinical Forms & Workflows
- **Custom Questionnaires**: Each tenant can create unlimited custom [Questionnaires](/docs/products/questionnaires) for intake forms, clinical assessments, and patient surveys. These are stored as FHIR resources within each project.
- **Questionnaire Builder**: Visual form builder (similar to Google Forms) allows non-technical staff to create and modify forms without developer intervention.
- **Workflow Automation**: Using [Bots](/docs/bots), each tenant can implement custom clinical workflows, decision support rules, and automated care protocols.
- **FHIR Profiles**: Tenants can define custom FHIR profiles to extend standard resources with tenant-specific fields and constraints.

#### EHR Integration
- **FHIR API**: Every tenant gets full FHIR R4 API access, allowing integration with any EHR that supports FHIR (Epic, Cerner, Allscripts, etc.).
- **SMART on FHIR**: Built-in support for SMART on FHIR app launch, allowing your application to embed within existing EHR workflows.
- **Custom Integrations**: Using Bots and webhooks, tenants can build custom integrations with legacy systems, lab systems, imaging systems, and more.
- **HL7 Integration**: Support for HL7 v2 message processing for integration with systems that don't yet support FHIR.

#### White-Labeling & Branding
- **Self-Hosted Control**: For self-hosted deployments, you have complete control over the user interface, branding, and domain names.
- **React Component Library**: Medplum provides a comprehensive [React component library](/docs/react) that you can customize, theme, and brand according to your organization's identity.
- **Custom Applications**: Many customers build completely custom applications using Medplum's API and React components, with full control over the user experience.
- **Provider Application**: The open-source [medplum-provider](https://github.com/medplum/medplum-provider) application serves as a reference implementation that you can fork and customize.

#### What Stays Standardized (By Design)
- **FHIR Data Model**: All data is stored as FHIR resources, ensuring interoperability and preventing vendor lock-in.
- **API Standards**: The FHIR API is standardized, but you can extend it with custom operations via Bots.
- **Core Infrastructure**: Database schema, authentication mechanisms, and security controls are standardized for reliability and security.

#### Customization Limits
- **No Breaking Changes**: Customization cannot break the multi-tenant isolation model—that's enforced at the platform level.
- **FHIR Compliance**: Customizations must remain FHIR-compliant to ensure interoperability.
- **Performance Impact**: Heavy customizations (e.g., complex Bots) may impact that tenant's performance but are isolated from other tenants.

**Related Documentation:**
- [Custom EHR Solutions](/solutions/custom-ehr)
- [Questionnaires](/docs/products/questionnaires)
- [Bots Documentation](/docs/bots)
- [React Components](/docs/react)
- [MSO Demo Application](https://github.com/medplum/medplum-mso-demo) - Example of multi-tenant customization

---

### 5. Tenant Administration & Delegation

**The Question:** *"Can our IT team manage our tenant without calling your support team for every user provisioning or configuration change?"*

**The Answer: Self-Service Tenant Administration**

Medplum provides comprehensive self-service administration capabilities, allowing your IT team to manage your tenant independently:

#### User Management
- **User Provisioning**: IT administrators can create, update, and deactivate user accounts through the web interface or API.
- **Bulk User Import**: Support for bulk user provisioning via CSV import or API.
- **Role-Based Access Control (RBAC)**: Administrators can assign users to roles and configure custom access policies without vendor intervention.
- **Project Membership Management**: Control which users have access to which projects, with fine-grained permission management.

#### Access Policy Configuration
- **Custom Access Policies**: Each project can define custom [Access Policies](/docs/access/access-policies) that control what resources users can read, write, or delete.
- **Parameterized Policies**: Access policies support parameterized variables (e.g., `%current_organization`) for dynamic access control.
- **Policy Testing**: Administrators can test access policies before deploying them to production.

#### API Key & Integration Management
- **API Key Management**: Administrators can create, rotate, and revoke API keys for integrations.
- **Client Application Management**: Register and manage OAuth2 client applications for integrations.
- **Webhook Configuration**: Configure webhooks for real-time event notifications.

#### Audit Logs & Monitoring
- **Self-Service Audit Logs**: Administrators can access and export audit logs for their project through the web interface or API.
- **Access Logging**: All resource access is logged with project context, user identity, and timestamp.
- **Compliance Reports**: Generate compliance reports (e.g., access reports, user activity reports) without vendor assistance.

#### Configuration Management
- **System Settings**: Configure project-level system settings (rate limits, feature flags, etc.) through the web interface.
- **Custom Resources**: Create and manage custom FHIR resources, profiles, and value sets.
- **Questionnaire Management**: Create, version, and manage questionnaires without developer or vendor support.

#### When Vendor Support is Needed
- **Infrastructure Changes**: Changes to underlying infrastructure (e.g., database scaling, region changes) may require vendor coordination for hosted deployments.
- **Security Incidents**: In the event of a security incident, vendor support is available 24/7.
- **Compliance Documentation**: Vendor can provide SOC 2 reports, compliance documentation, and security attestations.

**Related Documentation:**
- [Access Policies](/docs/access/access-policies)
- [Projects Documentation](/docs/access/projects)
- [User Management](/docs/access/users)

---

### 6. Disaster Recovery & Business Continuity

**The Question:** *"If one tenant's data is corrupted, can you restore just that tenant without affecting others? What are our RTO/RPO guarantees?"*

**The Answer: Per-Tenant Disaster Recovery & Business Continuity**

Medplum provides tenant-specific disaster recovery capabilities, ensuring that one tenant's issues don't impact others:

#### Per-Tenant Backup & Restore
- **Project-Level Backups**: Automated backups are maintained per project, allowing tenant-specific restore operations.
- **Point-in-Time Recovery**: Support for point-in-time recovery at the project level, allowing you to restore a tenant to a specific timestamp without affecting other tenants.
- **Selective Restore**: In the event of data corruption, you can restore a single project's data without impacting other tenants.

#### Recovery Time Objectives (RTO) & Recovery Point Objectives (RPO)
- **Configurable RTO/RPO**: For hosted Medplum, RTO and RPO can be negotiated per project based on your requirements.
- **Standard RPO**: Transaction log retention of 7+ days provides recovery point options.
- **Standard RTO**: Recovery time depends on deployment model:
  - **Hosted Medplum**: RTO typically 4-24 hours depending on severity
  - **Self-Hosted**: RTO depends on your infrastructure configuration and can be as low as minutes with proper HA setup

#### High Availability
- **Cloud-Native Architecture**: Built on AWS/GCP/Azure with native redundancy and failover capabilities.
- **Database High Availability**: Configurable HA options for database (e.g., AWS RDS Multi-AZ, GCP Cloud SQL HA, Azure Database for PostgreSQL HA).
- **Application Server Redundancy**: Stateless application servers allow for horizontal scaling and automatic failover.
- **Multi-Region Support**: Support for multi-region deployments for geographic redundancy.

#### Data Protection
- **Encrypted Backups**: All backups are encrypted at rest.
- **Backup Retention**: Automated backup retention policies ensure long-term data protection.
- **Disaster Recovery Testing**: Tenants can request disaster recovery testing to validate their recovery procedures.

#### Business Continuity Planning
- **24/7 Monitoring**: Continuous monitoring of system health and performance.
- **Status Page**: Public status page (status.medplum.com) provides real-time system status updates.
- **Incident Response**: Documented incident response procedures with defined escalation paths.
- **Communication**: Automated notifications for planned maintenance and incident updates.

#### Tenant-Specific Business Continuity
- **Data Export**: Tenants can export their data at any time using [FHIR Bulk Data Export](/docs/api/fhir/operations/bulk-fhir) for additional backup redundancy.
- **Disaster Recovery Procedures**: Each tenant can document and test their own disaster recovery procedures using exported data.

**Related Documentation:**
- [Self-Hosting Guide](/docs/self-hosting)
- [Bulk Data Export](/docs/api/fhir/operations/bulk-fhir)

---

### 7. Exit Strategy

**The Question:** *"If we leave, how do we get our data out? Is it in a standard format? Can we get a complete audit trail?"*

**The Answer: Complete Data Portability in Standard Formats**

Medplum is built on open standards specifically to prevent vendor lock-in. Your data belongs to you, and you can export it at any time:

#### FHIR Bulk Data Export
- **Standard FHIR Export**: Medplum supports the [FHIR Bulk Data Access (Flat FHIR) specification](https://hl7.org/fhir/uv/bulkdata/export.html), the industry standard for data export.
- **Complete Data Export**: Export all resources in your project, or filter by resource type, date range, or patient group.
- **NDJSON Format**: Data is exported in NDJSON (newline-delimited JSON) format, the standard format for FHIR bulk data.
- **Async Export**: Large exports are handled asynchronously, with status polling and download links provided upon completion.

#### Export Capabilities
- **System-Level Export**: Export all resources in your project.
- **Patient-Level Export**: Export all resources for specific patients or patient groups.
- **Group Export**: Export resources for a specific group of patients.
- **Incremental Export**: Use `_since` parameter to export only resources modified since a specific date.
- **Resource Type Filtering**: Export specific resource types (e.g., only Patient, Observation, and Encounter resources).

#### Audit Trail Export
- **Complete Audit Logs**: All access and modification events are logged and can be exported.
- **Audit Event Resources**: Audit logs are stored as FHIR `AuditEvent` resources, which can be exported like any other resource.
- **Compliance Documentation**: Export audit logs in formats suitable for compliance reporting and regulatory submissions.

#### Data Format & Interoperability
- **FHIR R4 Standard**: All data is stored and exported in FHIR R4 format, ensuring compatibility with any FHIR-compliant system.
- **No Proprietary Formats**: Medplum does not use proprietary data formats—everything is standard FHIR.
- **Import Compatibility**: Exported data can be imported into any FHIR-compliant system, including other EHRs, data warehouses, and analytics platforms.

#### Export Process
1. **Initiate Export**: Use the FHIR `$export` operation via API or web interface.
2. **Monitor Progress**: Poll the export status endpoint to track progress.
3. **Download Data**: Once complete, download exported files from provided URLs.
4. **Verify Completeness**: Validate exported data using standard FHIR validation tools.

#### Data Deletion
- **GDPR Compliance**: Support for complete data deletion upon request, in compliance with GDPR and other data protection regulations.
- **Deletion Audit Trail**: All data deletions are logged and auditable.

**Related Documentation:**
- [Bulk Data Export](/docs/api/fhir/operations/bulk-fhir)
- [CLI Bulk Export](/docs/tools/cli#bulk-export)

---

### 8. Cost Model Transparency

**The Question:** *"What drives our costs in a multi-tenant environment? How does this compare to single-tenant alternatives?"*

**The Answer: Transparent, Usage-Based Pricing with Clear Cost Drivers**

Medplum's pricing model is designed to be transparent and predictable, with costs driven by actual usage rather than arbitrary per-seat or per-tenant fees:

#### Hosted Medplum Pricing Model
- **Per-Project Pricing**: Pricing is based on projects (tenants), with clear tiers based on usage volume.
- **Usage-Based Components**:
  - **Storage**: Costs scale with the amount of data stored (FHIR resources, binary files, etc.)
  - **API Calls**: Costs based on API request volume, with different tiers for different usage levels
  - **Users**: Some tiers include a base number of users, with additional users available
- **No Hidden Fees**: No per-integration fees, no per-form fees, no per-workflow fees.
- **Predictable Scaling**: As your usage grows, costs scale predictably without sudden jumps.

#### Self-Hosted Cost Model
- **Infrastructure Costs Only**: For self-hosted deployments, you pay only for the underlying cloud infrastructure (compute, storage, networking).
- **Unlimited Projects**: A single self-hosted deployment supports unlimited projects at no additional licensing cost.
- **Cost Efficiency**: Shared infrastructure costs are distributed across all tenants, providing significant cost savings compared to single-tenant deployments.
- **No Per-Tenant Licensing**: No licensing fees per tenant or per user.

#### Cost Comparison: Multi-Tenant vs. Single-Tenant
**Multi-Tenant Advantages:**
- **Shared Infrastructure**: Database, application servers, and monitoring infrastructure are shared, reducing per-tenant costs by 60-80% compared to single-tenant deployments.
- **Operational Efficiency**: Centralized operations, monitoring, and maintenance reduce operational overhead.
- **Automated Provisioning**: New tenant onboarding is automated, reducing setup costs.

**When Single-Tenant Makes Sense:**
- **Extreme Regulatory Requirements**: Some regulations may require completely separate infrastructure (rare, but possible).
- **Very Large Scale**: Organizations with extremely large data volumes may benefit from dedicated infrastructure, though Medplum's architecture scales to handle large tenants.

#### Cost Optimization Strategies
- **Resource Archiving**: Archive historical data to reduce active storage costs.
- **Efficient API Usage**: Use bulk operations and efficient query patterns to reduce API call volume.
- **Right-Sized Tiers**: Choose the pricing tier that matches your actual usage patterns.

#### Cost Transparency
- **Usage Dashboard**: Real-time visibility into storage, API calls, and user counts.
- **Billing Reports**: Detailed billing reports showing cost breakdown by component.
- **Cost Forecasting**: Tools to forecast costs based on projected growth.

**Related Documentation:**
- [Pricing Information](https://www.medplum.com/pricing) (if available)
- [Self-Hosting Guide](/docs/self-hosting)

---

### 9. Reference Customers & Similar Contexts

**The Question:** *"Can we talk to other health systems or payers using your multi-tenant solution, particularly ones with similar regulatory requirements or scale?"*

**The Answer: Reference Customer Program**

Medplum maintains a reference customer program to connect prospective customers with existing customers in similar contexts:

#### Reference Customer Matching
- **Similar Context Matching**: We can connect you with reference customers who have:
  - Similar regulatory requirements (state-specific compliance, research protocols, etc.)
  - Similar scale (community hospitals, academic medical centers, health systems, payers)
  - Similar use cases (custom EHR, patient portal, data integration hub, etc.)
- **Geographic Matching**: Connect with customers in similar geographic regions or regulatory jurisdictions.

#### Customer Success Stories
- **Case Studies**: Detailed case studies available for various use cases and organization types.
- **Implementation Examples**: Examples of multi-tenant implementations, including:
  - **MSO (Managed Service Organization)**: [MSO Demo Application](https://github.com/medplum/medplum-mso-demo) - Example of organization-level multi-tenancy
  - **Multi-Location Health Systems**: Examples of health systems managing multiple clinics within a single project
  - **B2B2C Platforms**: Examples of technology vendors serving multiple independent healthcare organizations

#### Customer Types
Medplum serves a diverse range of healthcare organizations:
- **Community Hospitals**: Small to mid-size hospitals using Medplum for custom applications
- **Academic Medical Centers**: Research institutions with complex compliance requirements
- **Health Systems**: Multi-location health systems managing multiple clinics
- **Payers**: Health insurance companies using Medplum for data integration and member portals
- **Health Tech Companies**: Technology vendors building healthcare applications on Medplum
- **Specialty Clinics**: Niche healthcare providers (pediatrics, mental health, etc.)

#### Reference Call Process
1. **Initial Discussion**: Share your use case, regulatory requirements, and scale with our team.
2. **Matching**: We identify reference customers with similar contexts.
3. **Introduction**: Facilitated introduction to reference customers who have agreed to share their experiences.
4. **Follow-Up**: Ongoing support to answer questions and address concerns.

**To Request Reference Customers:**
Contact our sales team or solutions engineering team to be matched with appropriate reference customers.

---

### 10. Tenant Onboarding & Operational Readiness

**The Question:** *"How long does it take to spin up a new tenant? Are there limits on tenant count that might indicate architectural constraints?"*

**The Answer: Rapid Onboarding with No Architectural Limits**

Medplum's architecture is designed to support rapid tenant onboarding with no practical limits on tenant count:

#### Tenant Onboarding Process
- **Automated Provisioning**: New projects (tenants) can be provisioned in minutes through the web interface or API.
- **Self-Service Onboarding**: For self-hosted deployments, your IT team can provision new tenants without vendor involvement.
- **Onboarding Timeline**:
  - **Project Creation**: < 5 minutes (automated)
  - **Initial Configuration**: 1-2 hours (user setup, access policies, basic configuration)
  - **Integration Setup**: 1-5 days (depending on complexity of EHR integrations, custom workflows, etc.)
  - **Go-Live**: Typically 1-4 weeks from project creation to production use, depending on customization requirements

#### No Architectural Limits
- **Unlimited Projects**: Medplum's architecture supports unlimited projects (tenants) within a single deployment. There are no hard limits on tenant count.
- **Horizontal Scaling**: As tenant count grows, you can horizontally scale application servers and database resources without architectural changes.
- **Proven Scale**: Medplum's own hosted offering serves multiple customers on shared infrastructure, demonstrating the architecture's scalability.

#### Onboarding Support
- **Documentation**: Comprehensive documentation for self-service onboarding.
- **Templates**: Pre-configured project templates for common use cases (MSO, health system, specialty clinic, etc.).
- **Professional Services**: Optional professional services available for complex onboarding scenarios, including:
  - Custom access policy configuration
  - Integration setup and testing
  - Workflow automation development
  - Training and knowledge transfer

#### Operational Readiness
- **Monitoring & Alerting**: Each tenant gets access to monitoring dashboards and can configure custom alerts.
- **Documentation Access**: Full access to documentation, API references, and implementation guides.
- **Support Tiers**: Various support tiers available, from community support to dedicated account management.

**Related Documentation:**
- [Getting Started Guide](/docs/tutorials/register)
- [Projects Documentation](/docs/access/projects)
- [Multi-Tenant Decision Guide](/solutions/compliance-security/multi-tenant-decision-guide)

---

## Architecture Overview

### Project-Level Isolation Model

```
┌─────────────────────────────────────────────────────────┐
│                    Medplum Server                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐         ┌──────────────┐              │
│  │  Project A   │         │  Project B   │              │
│  │              │         │              │              │
│  │  • Patients  │         │  • Patients  │              │
│  │  • Providers│         │  • Providers │              │
│  │  • Data     │         │  • Data     │              │
│  │              │         │              │              │
│  │  Hard        │         │  Hard        │              │
│  │  Boundary    │         │  Boundary    │              │
│  └──────────────┘         └──────────────┘              │
│         │                        │                       │
│         └────────┬───────────────┘                       │
│                  │                                       │
│         ┌────────▼────────┐                             │
│         │   PostgreSQL    │                             │
│         │  (projectId)    │                             │
│         └─────────────────┘                             │
└─────────────────────────────────────────────────────────┘
```

### Organization-Level Multi-Tenancy Model

```
┌─────────────────────────────────────────────────────────┐
│                    Single Project                        │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │         AccessPolicy (Parameterized)              │   │
│  │  compartment: %current_organization             │   │
│  └──────────────────────────────────────────────────┘   │
│                        │                                  │
│        ┌───────────────┼───────────────┐                │
│        │               │               │                │
│  ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐        │
│  │   Org A   │   │   Org B   │   │   Org C   │        │
│  │           │   │           │   │           │        │
│  │ Patients  │   │ Patients  │   │ Patients  │        │
│  │ Providers │   │ Providers │   │ Providers │        │
│  │ Resources │   │ Resources │   │ Resources │        │
│  └───────────┘   └───────────┘   └───────────┘        │
│                                                           │
│  Shared Resources: ValueSets, CodeSystems, Bots          │
└─────────────────────────────────────────────────────────┘
```

---

## Decision Framework: Which Model to Use?

### Use Project-Level Isolation When:
- ✅ Serving completely independent healthcare organizations
- ✅ Regulatory requirements mandate complete data separation
- ✅ Need separate authentication/authorization flows
- ✅ Different compliance requirements per tenant (different BAAs, data residency)
- ✅ B2B2C scenarios with multiple partners
- ✅ Need to license your EMR to other organizations

### Use Organization-Level Multi-Tenancy When:
- ✅ Managing multiple clinics within a health system
- ✅ Building an MSO (Managed Service Organization)
- ✅ Need to share common resources (terminology, profiles, bots)
- ✅ Want centralized administration with clinic-level access control
- ✅ Cost optimization through shared infrastructure
- ✅ Unified reporting across multiple locations

---

## Key Differentiators

1. **FHIR-Native**: Tenanting built on FHIR standards (Projects, Organizations, AccessPolicies), ensuring interoperability and preventing vendor lock-in
2. **Flexible Models**: Support both project-level and organization-level tenanting, allowing you to choose the right model for your use case
3. **Healthcare-Focused**: Designed specifically for healthcare compliance requirements, not adapted from generic multi-tenant platforms
4. **Open Source**: Full visibility into tenanting implementation—you can review, audit, and even contribute to the codebase
5. **Self-Hostable**: Deploy your own multi-tenant instance with full control over infrastructure, compliance, and operations
6. **Proven Scale**: Used by Medplum's own hosted offering serving multiple customers, demonstrating real-world scalability
7. **Complete Data Portability**: Standard FHIR export ensures you're never locked in

---

## Next Steps

1. **Architecture Review**: Schedule a technical architecture review to discuss your specific tenanting needs and answer any remaining questions
2. **Compliance Documentation**: Request SOC 2, HIPAA, and other compliance documentation
3. **Proof of Concept**: Set up a pilot project to validate the tenanting model with your data and workflows
4. **Security Assessment**: Review security controls and isolation mechanisms with your security team
5. **Cost Analysis**: Evaluate total cost of ownership for your tenanting model, including infrastructure, operations, and support costs
6. **Reference Customer Calls**: Connect with reference customers in similar contexts to learn from their experiences

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
