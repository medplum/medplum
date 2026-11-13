---
id: patient-records
title: Patient Records and Clinical Sharing
description: Implement shared or tenant-specific Patient records independently of clinical-resource access and patient login.
weight: 10
toc_max_heading_level: 3
---

A care company may maintain common patient information across services, while independent practices may each maintain their own record for the same person. This page explains the two Patient models within one project. Start with [shared Patient records](#shared-patient-records) or [tenant-specific Patient records](#tenant-specific-patient-records), then configure [clinical access](#clinical-record-isolation) and [accounts and sessions](/docs/access/tenant-selector). For a separate project per tenant, see [Projects](/docs/access/projects#project-per-customer-tenancy).

{{< tip title="Choosing your Patient model?" >}}
The [Tenancy Design Decision Guide](/docs/decision-guides/tenancy-design#choose-the-tenancy-model) compares shared and independently maintained Patient information, clinical sharing, and project boundaries.
{{< /tip >}}

## One shared Patient record per person {#shared-patient-records}

Both tenants reference the same Patient. Updates to that resource change the information available to all authorized readers, including names, addresses, telecom, identifiers, contacts, and extensions. Decide which roles can update those fields and which source resolves conflicts. [Field permissions and write constraints](/docs/access/access-policies) enforce those permissions; independently maintained values require a separate data model.

**Patient information can itself be PHI.** Demographics associated with receiving care can be protected health information under HIPAA even when visits and results remain separate. See the [decision guide’s PII and PHI explanation](/docs/decision-guides/tenancy-design#choose-the-tenancy-model) and [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html).

For example, two services use `Patient/shared`, while each service's Encounters have separate access restrictions. Correcting `Patient/shared.telecom` changes the common patient information even when the services cannot read each other's Encounters.

![Encounters in practices A and B reference the same Patient. Their clinical audiences can remain separate.](/img/tenancy-design/patients-shared.svg)

_Arrows show FHIR references. The service boxes show the intended clinical audiences; access policies enforce those audiences. Both services use the same Patient information._

## A separate Patient record per tenant {#tenant-specific-patient-records}

Create a Patient for each tenant's relationship with the person. Each tenant's clinical resources reference its corresponding Patient. Updating one Patient leaves the other unchanged unless an explicit synchronization workflow updates it.

![Each practice’s Encounter references its own Patient. Both Patients may represent the same person.](/img/tenancy-design/patients-separate.svg)

_Both Patients can represent the same person. Arrows show FHIR references; each practice's records are independently maintained and protected by its access policies._

These Patients are intentional independent records. Preserve that distinction during matching, imports, and [deduplication](/docs/fhir-datastore/patient-deduplication). A platform identity mapping can connect the person to both records when authorized; it should not make either practice's data visible to the other.

Within each practice, use [care-team access criteria](/docs/access/multi-tenant-access-policy#layering-tenant-and-care-team-access) if the API must limit clinicians to their assigned patients. A focused care-team view can use UI filters within broader permitted access, without compartment assignments.

### Provision the data before access

The steps below use compartment-based tenant assignment within one project. First [choose the tenant resource](/docs/access/multi-tenant-access-policy#step-1-modeling-your-tenants), such as Organization for a practice or HealthcareService for a service. `$set-accounts` sets its reference in `meta.accounts`; Medplum computes `meta.compartment`. The same mechanism applies to each tenant resource choice.

1. Assign stable, tenant-specific identifier namespaces. A matching key must distinguish the tenant's record; email alone is insufficient.
2. Use an [identifier-based conditional create](/docs/fhir-datastore/working-with-fhir#creating-patient) for each Patient, so retries reuse the intended record.
3. Assign the Patient to its tenant using `$set-accounts`, and confirm success before creating dependent resources or enabling tenant access. For a newly created Patient with no dependents, a propagation sweep is unnecessary. Keep provisioning credentials on a trusted backend; `$set-accounts` requires project-admin or super-admin authority. Check the resulting compartment before granting ordinary tenant users access.
4. Reference that Patient from the tenant's clinical resources and enforce the corresponding tenant criteria in its staff policies.
5. If the person needs portal access, provision the intended Patient profile explicitly using [Identity, Memberships, and Sessions](/docs/access/tenant-selector#option-1-one-tenant-per-session).

`Patient.managingOrganization` can represent the organization responsible for maintaining the record. Setting it alone does not apply the compartment assignments used by the [multi-tenant access pattern](/docs/access/multi-tenant-access-policy).

## Clinical-record isolation

Sharing a Patient and sharing clinical records are separate choices. Define access for each clinical resource type, including resources with no patient-compartment reference.

### Shared clinical records

If the tenants intentionally share the Patient and its patient-compartment resources, use [tenant enrollment with propagation](/docs/access/multi-tenant-access-policy#why-is-patient-a-special-case). `$set-accounts` with `propagate: true` updates existing patient-compartment resources. Ordinary writes of resources referring to the Patient can inherit its tenant accounts.

### Separate clinical records with a shared Patient

Use resource-specific criteria that distinguish the clinical records, while granting access to the common Patient. Where a clinical field accurately represents the boundary, use its supported search parameter. The following example specifically models tenants as **Organizations** that are the Encounter's service provider. This read-only policy limits Encounters by both the authorized patient and service provider:

{{< code-example file="packages/examples/src/access/tenant-patient-records.ts" language="ts" blocks="shared-patient-encounters" >}}

Supply `patient` as a Patient reference and `organization` as the service-provider reference through `ProjectMembership.access.parameter`. The `%patient.id` placeholder uses the ID from that reference. For example, after storing the policy, use its returned ID and the actual Patient and Organization IDs in this grant:

{{< code-example file="packages/examples/src/access/tenant-patient-records.ts" language="ts" blocks="shared-patient-grant" >}}

Verify that the member is authorized for that Patient and organization before assigning the grant. Assign it to an ordinary non-admin membership without broader overlapping grants. This example grants only Patient and Encounter reads. Define the corresponding rules for every other resource type your workflow needs. An Observation's reference to an Encounter does not inherit that Encounter's policy; the Observation needs its own enforceable rule.

`Encounter.serviceProvider` references an Organization. A HealthcareService tenant or CareTeam access group needs its own supported resource criteria or account-assignment workflow; changing the reference type in this example does not implement that model.

Where clinical fields do not express the intended boundary, design a controlled resource-assignment workflow using [`$set-accounts`](/docs/api/fhir/operations/set-accounts) and compartment-based policies. Cover both creation and later updates: ordinary clinical-resource writes can derive account assignments from the referenced Patient again. Keep all write paths consistent, including Bots and imports. Initial writes must obey the intended boundary; an asynchronous correction after a resource becomes readable can expose it to the wrong tenant.

**Patient-wide tenant assignment is a sharing operation.** Adding both organizations to a Patient and filtering all clinical resources only by those inherited compartments grants both organizations access. Setting `propagate: false` only skips the existing-resource sweep; it does not disable inheritance on later writes. Test the intended separation after creation, editing, and reassignment.

For files, choose a `Binary.securityContext` whose access matches the file's intended audience. A tenant-specific file linked to a shared Patient as its security context may become accessible to both tenants. See [Binary Security Context](/docs/access/binary-security-context).

## Accounts and sessions {#patient-login-and-memberships}

<div id="one-user-with-separate-patient-memberships"></div>
<div id="one-membership-with-a-combined-portal"></div>
<div id="independent-user-identities"></div>

Your Patient model does not determine whether people need one account or several. Implement [one account with separate practice sessions](/docs/access/tenant-selector#option-1-one-tenant-per-session), [one account with access across practices](/docs/access/tenant-selector#option-2-combined-access-with-a-tenant-selector), or [independent practice accounts](/docs/access/tenant-selector#independent-user-identities) in **Identity, Memberships, and Sessions**, which contains the resource diagrams and provisioning steps.

## Enrollment and transfers

Assign tenants with `$set-accounts`, providing the complete intended account list. Choose propagation according to the agreed historical-record behavior:

| Intended result | Implementation |
| :--- | :--- |
| Share a Patient and its chart with another tenant | Include the additional tenant and propagate to existing patient-compartment resources. |
| Transfer patient-compartment records to another tenant | Replace the tenant assignment and propagate; verify completion and any other grants before treating old access as revoked. |
| Share Patient information while keeping historical clinical records separate | Maintain resource-specific clinical rules; a patient-wide propagation sweep does not distinguish historical and future records. |
| Enroll the person in another practice with an independent Patient | Provision the second tenant's Patient and membership. Retain the original record and its access according to the agreed lifecycle. |

For tenant-specific Patients, share selected records through an explicitly authorized workflow. Replacing the Patient on existing clinical resources or merging Patients can change their compartment membership and access.

## Verify the boundary

Exercise the design with ordinary tenant and patient credentials:

- Update a Patient field and verify the agreed shared or independent behavior.
- Read and search another tenant's clinical resources directly, including after an allowed update or import.
- Check file access against the file's security context.
- Enroll the same person in a second tenant and verify the intended Patient and membership are selected.
- Check which records remain accessible after a transfer or membership revocation, including existing sessions.

**Next:** Configure [Tenant Assignment and Access](/docs/access/multi-tenant-access-policy), [Access Policies](/docs/access/access-policies), and [Identity, Memberships, and Sessions](/docs/access/tenant-selector) for the selected model.
