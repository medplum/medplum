# Medplum Tenanting Architecture: Executive Overview

## Executive Summary

Medplum provides a **strict yet flexible tenanting model** designed for healthcare organizations requiring strict data isolation, regulatory compliance, and operational flexibility. 


What is the problem, in the language of executives? 


---

## Key Questions Healthcare Executives Ask 

### 1. "How is our data isolated from other tenants?"

Medplum uses **project-based architecture** to 


### 1. "Can I do tenanting across multiple projects? "
- Reasons why you shouldn't 

### 3. Does this allow me to license my EMR to other organizations? 
- Yes, talk about how 

### Can users be enrolled in multiple tenants?

### Execute level version of which resources should be used for tenanting, and which resources should be tenant-restricted? 
- 

### Roll-based understanding of organization is very important for defining "walls" in tenanting  


- **No Cross-Project References**: The system enforces that resources within one project cannot reference resources in another, creating a hard boundary.



**Answer: Project-Level Hard Isolation**

- **Data Isolation**: Every FHIR resource is tagged with a `projectId` at the database level. Resources in one project **cannot reference** resources in another project - this is enforced by the application layer.
- **Dedicated Trust Zones**: Each customer environment is stored within a dedicated trust zone to prevent accidental or malicious co-mingling.
- **Account-Based Isolation**: Medplum uses account-based isolation approach where each customer's data is separated using accounts to ensure data is protected and isolated.
- **No Cross-Project References**: The system enforces that resources within one project cannot reference resources in another, creating a hard boundary.

**For Multi-Organization Scenarios (within one Project):**
- **Organization-Based Access Control**: Using FHIR `Organization` resources and `AccessPolicy` with parameterized variables
- **Compartment-Based Isolation**: Resources are tagged with organization compartments using `meta.accounts` field
- **Access Policies**: Fine-grained control over which users can access which organization's data

---

### 2. "What compliance certifications do you have?"

**Answer: Comprehensive Healthcare Compliance**

Medplum maintains multiple compliance certifications:

- **SOC 2 Type II** - Annual audit by Prescient Assurance, demonstrating security controls meet AICPA standards
- **HIPAA Compliant** - Full compliance with Health Insurance Portability and Accountability Act requirements
- **ONC Certified** - Certified for interoperability standards (B10 certification)
- **HITRUST** - Pursuing HITRUST certification (H1 2026)
- **HTI-4** - Compliance with HTI-4 mandates (aligned to January 2027 enforcement)
- **ISO 9001** - Quality management systems
- **CFR Part 11** - Electronic records compliance
- **CLIA/CAP** - Clinical laboratory compliance
- **GDPR** - Full compliance with data deletion support

**Security Practices:**
- Data encrypted at rest (AES) and in transit (TLS 1.2/1.3)
- Continuous security monitoring
- Annual third-party penetration testing
- OWASP Top 10 compliance
- NIST SP 800-123, 800-190, 800-180 guidelines

---

### 3. "How does this scale? Can you handle our growth?"

**Answer: Multi-Tenant Architecture Built for Scale**

**Current Architecture:**
- **Shared Infrastructure**: Multi-tenant cloud architecture leveraging AWS/GCP/Azure native security
- **Database Isolation**: PostgreSQL with project-level partitioning via `projectId` column
- **Horizontal Scaling**: Stateless application servers allow horizontal scaling
- **Indexed Queries**: Database indexes on `projectId` ensure efficient tenant-scoped queries

**Scaling Roadmap (2026):**
- **Sharding Capabilities**: Implementing sharding for larger datasets
- **Data Archiving**: Archiving capabilities for historical data management
- **Kafka Integration**: Data warehouse integration via Kafka for high-volume connections
- **Cross-Cloud Support**: Enhanced support for GCP, Azure, and AWS deployments

**Performance Characteristics:**
- Each project operates independently - tenant growth doesn't impact other tenants
- Database queries are automatically scoped to the project context
- No cross-tenant query overhead

---

### 4. "What happens if another tenant has a security breach?"

**Answer: Complete Isolation Prevents Cross-Tenant Impact**

- **Hard Boundaries**: Project-level isolation means a breach in one project cannot access data in another project
- **Separate Authentication**: Each project has its own user administration and authentication flows
- **Dedicated Trust Zones**: Each customer environment is in a dedicated trust zone
- **No Shared Credentials**: Projects have separate secrets, API keys, and configuration
- **Audit Logging**: All access is logged and auditable per-project

**For Organization-Level Multi-Tenancy:**
- Access policies enforce organization-level boundaries
- Compartment-based access control prevents unauthorized cross-organization access
- All access attempts are logged and auditable

---

### 5. "How do we manage multiple clinics/organizations?"

**Answer: Flexible Multi-Tenancy Models**

**Option 1: Separate Projects (Maximum Isolation)**
- Each clinic/organization gets its own Project
- Complete data isolation
- Separate user administration
- Separate configuration and secrets
- Best for: Independent healthcare organizations, strict regulatory requirements

**Option 2: Single Project with Organizations (Shared Infrastructure)**
- All clinics within one Project
- Each clinic represented as FHIR `Organization` resource
- Access policies control which users see which organization's data
- Shared resources (ValueSets, CodeSystems) can be linked
- Best for: MSOs, health systems with multiple clinics, shared services

**Project Linking (Hybrid Approach):**
- Shared projects can be linked to multiple target projects
- Read-only access to shared resources (terminology, profiles, bots)
- Common use cases: Shared CodeSystems (ICD-10, RxNorm, LOINC), FHIR profiles, provider directories

---

### 6. "What about disaster recovery and business continuity?"

**Answer: Enterprise-Grade Resilience**

**Infrastructure:**
- **Cloud-Native**: Built on AWS/GCP/Azure with native redundancy
- **Database Backups**: Automated backups with point-in-time recovery
- **High Availability**: Configurable HA options for database and application servers
- **Multi-Region**: Support for multi-region deployments

**Data Protection:**
- Encrypted backups
- Transaction log retention (7+ days)
- Automated backup retention policies
- Project-level backup and restore capabilities

**Operational:**
- 24/7 monitoring
- Status page: status.medplum.com
- Incident response procedures
- Business continuity planning

---

### 7. "How do we audit and demonstrate compliance?"

**Answer: Comprehensive Audit and Logging**

- **Access Logging**: All resource access is logged with project context
- **Audit Trails**: Complete audit trails for all FHIR operations
- **User Activity**: Track user actions across projects
- **Compliance Reports**: SOC 2 audit reports available upon request
- **Data Lineage**: Track data access and modifications

**For Organization-Level Multi-Tenancy:**
- Access policies log all organization-scoped access attempts
- Compartment-based access is fully auditable
- User membership in organizations is tracked

---

### 8. "What are the cost implications?"

**Answer: Efficient Multi-Tenant Architecture**

**Hosted Medplum:**
- Per-project pricing model
- Shared infrastructure costs distributed across tenants
- No per-tenant infrastructure overhead
- Predictable pricing based on usage tiers

**Self-Hosted:**
- Single infrastructure deployment supports unlimited projects
- Cost-effective for organizations with multiple tenants
- No per-tenant licensing fees
- Infrastructure costs scale with total usage, not tenant count

**Operational Efficiency:**
- Shared infrastructure reduces operational overhead
- Automated provisioning reduces manual setup costs
- Centralized monitoring and management

---

## Architecture Diagrams

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
- ✅ Different compliance requirements per tenant
- ✅ B2B2C scenarios with multiple partners

### Use Organization-Level Multi-Tenancy When:
- ✅ Managing multiple clinics within a health system
- ✅ Building an MSO (Managed Service Organization)
- ✅ Need to share common resources (terminology, profiles)
- ✅ Want centralized administration with clinic-level access control
- ✅ Cost optimization through shared infrastructure

---

## Key Differentiators

1. **FHIR-Native**: Tenanting built on FHIR standards (Projects, Organizations, AccessPolicies)
2. **Flexible Models**: Support both project-level and organization-level tenanting
3. **Healthcare-Focused**: Designed specifically for healthcare compliance requirements
4. **Open Source**: Full visibility into tenanting implementation
5. **Self-Hostable**: Deploy your own multi-tenant instance with full control
6. **Proven Scale**: Used by Medplum's own hosted offering serving multiple customers

---

## Next Steps

1. **Architecture Review**: Schedule a technical architecture review to discuss your specific tenanting needs
2. **Compliance Documentation**: Request SOC 2, HIPAA, and other compliance documentation
3. **Proof of Concept**: Set up a pilot project to validate tenanting model
4. **Security Assessment**: Review security controls and isolation mechanisms
5. **Cost Analysis**: Evaluate total cost of ownership for your tenanting model

---

## References

- [Projects Documentation](/docs/access/projects)
- [Multi-Tenant Access Control](/docs/access/multi-tenant-access-policy)
- [Security Overview](/security)
- [Compliance Overview](/docs/compliance)
- [MSO Demo Application](https://github.com/medplum/medplum-mso-demo)

---

*This document provides an executive-level overview. For technical implementation details, please refer to the technical documentation or schedule a consultation with our solutions engineering team.*