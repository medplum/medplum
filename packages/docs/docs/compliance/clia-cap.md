---
sidebar_position: 3
---

# CLIA/CAP Certification

:::caution Note

This section is under construction.

:::

The following materials support a CLIA certified lab that is using Medplum for their primary LIS pass their CLIA/CAP Inspection.

## Materials and Usage

The materials below can help prepare for your inspection.

| Resource Name     | Description                                       | Access                                                                                               |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Checklist         | General Lab checklist                             | [Request Access](https://drive.google.com/file/d/1Km-VLLV4HJ0ZcL51rkQoY4MnxUHlSTKt/view?usp=sharing) |
| Security Overview | General information on Medplum security practices | [medplum.com](https://www.medplum.com/security)                                                      |

## Checklist

Review and refer to the following items in preparation for your inspection.

- GEN.43150 User Authentication Phase II
  - [ ] Users and their access policies are represented as [Project Memberships](https://app.medplum.com/ProjectMembership)
  - [ ] [Access Policies](https://app.medplum.com/AccessPolicy) represent the permissions
- GEN.43325 Public Network Security Phase II
  - [ ] [Logins](/docs/api/fhir/medplum/login) track authentication events and are logged
- GEN.43335 System Vulnerability Testing
  - [ ] Regular penetration tests and security review performed, see the [security page](/security#application-security)
- GEN.43450 Calculated Patient Data Verification Phase II
  - [ ] Implementation typically done through [Bots](https://app.medplum.com/Bot)
  - [ ] All calculations that include reportable results must have [unit tests](/docs/bots/unit-testing-bots)
- GEN.43750 Specimen Quality Comment Phase II
  - [ ] Specimen related queries and reports
    - [ ] All [Specimens](https://app.medplum.com/Specimen)
    - [ ] [Specimen Quality](https://app.medplum.com/Specimen?_count=20&_fields=id,_lastUpdated,status&_offset=0&_sort=-_lastUpdated&status=unsatisfactory)
- GEN.43800 Data Input ID Phase II
  - All data in Medplum is versioned, and [version history](/docs/sdk/classes/MedplumClient#readhistory) for each resource is available
- GEN.43825 Result Verification Phase II
  - [ ] Diagnostic report related queries
    - [ ] All [Diagnostic Reports](https://app.medplum.com/DiagnosticReport)
    - [ ] [Corrected reports](https://app.medplum.com/DiagnosticReport?_count=20&_fields=id,_lastUpdated,subject,code,status&_offset=0&_sort=-_lastUpdated&status=corrected)
  - Automatic validation on Medplum is often implemented via Bot
  - [ ] In most implementations [Bots](https://app.medplum.com/Bot) perform validation or pre-validation calculations
  - [ ] Panel Management is done via [PlanDefinition](https://app.medplum.com/PlanDefinition) resources
  - [ ] Call logs for patient contact are often implemented as [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse)
- GEN.43837 Downtime Result Reporting Phase II
  - Refer to documentation on [availability](/security#availability)
