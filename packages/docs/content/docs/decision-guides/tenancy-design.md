---
id: tenancy-design
title: Tenancy Design Decision Guide
sidebar_label: Tenancy Design
weight: 95
download_slug: tenancy-design
toc_max_heading_level: 3
---

Design tenancy for your application built on Medplum.

A **tenant** is a customer organization or organizational unit that your application treats as a distinct operating context, with defined rules for its data, users, and administration. Tenants can still share selected information and centralized administration.

_Companion to the [Tenancy Design](/docs/tenancy-design) technical docs._

Work through four questions:

1. **[Do you need a multi-tenant application design?](#do-you-need-tenant-boundaries)** Decide whether this guide applies to you.
2. **[What does a tenant represent?](#start-with-the-customers-operating-model)** Identify the organization or unit you need to serve separately.
3. **[What must remain independent?](#choose-the-tenancy-model)** Choose how Patient information, clinical records, and administration are shared or separated.
4. **[How should people work across tenants?](#staff-workflows-and-patient-accounts)** Choose the sign-in and switching experience for staff and patients.

## 1. Do you need a multi-tenant application design? {#do-you-need-tenant-boundaries}

| Your situation | Example | Next step |
| :--- | :--- | :--- |
| **No:** One care operation with shared or role-specific access. | Your practice has clinicians, billing staff, and several care teams. | Use one project; choose UI filtering or API restrictions in the [Access Control Decision Guide](/docs/decision-guides/access-control). You can stop here. |
| **Yes:** Distinct organizations or units need separately governed records or administration. | Your platform serves independent practices. | Continue below to define what stays within each tenant and what may be shared. |

One practice can have several locations, specialties, and care teams while remaining one care operation. Choose multi-tenancy when you need to govern distinct organizations or units separately.

## 2. What does a tenant represent in your application? {#start-with-the-customers-operating-model}

| Tenant represents | Example | Main consequence |
| :--- | :--- | :--- |
| **A customer organization** | Each independent practice using your software. | Define practice-level sharing, membership, and departure rules. |
| **An organizational unit you operate separately** | Service lines with distinct data-governance requirements. | Agree which responsibilities and information are independent or shared. |

With or without tenants, a care team may need a focused view or restricted access. **UI filtering does not require compartments:** use existing resource fields and relationships to organize work within the user's permitted access. Add care-team policy restrictions when users must be prevented from accessing other patients through the API.

![Example of API-enforced care-team restrictions within Practice A and Practice B.](/img/tenancy-design/access-levels.png)

_Example with API-enforced care-team restrictions within each practice. A practice can also enforce its tenant boundary while using UI filters for care-team views._

**Compartments** group resources for queries and access-policy criteria. A group can represent a tenant or a finer grouping, such as a care team. The [technical guide](/docs/access/multi-tenant-access-policy#step-1-modeling-your-tenants) explains how to represent these groups and enforce their permissions.

## 3. What data and administration must remain independent? {#choose-the-tenancy-model}

### Choose the Patient and project model {#the-three-models-at-a-glance}

A **project** is a Medplum container for resources, user access, and configuration. Within it, the **Patient resource** holds demographics, contact details, identifiers, and other patient information. Choose whether tenants maintain that Patient information together or independently; choose access to visits, results, and other clinical resources next.

| Option | Example | Functional consequence |
| :--- | :--- | :--- |
| **A. One shared Patient record per person, within one project** | Your services use centralized registration. | An address correction updates the common Patient record. Clinical records can remain isolated with their own access rules. |
| **B. A separate Patient record per tenant, within one project** | Each practice maintains its own information about the same person. | An address correction in Practice A leaves Practice B's record unchanged. Project administration remains shared. |
| **C. A separate project per tenant** | You need separate resource containers and project administration for each customer. | Each project holds its own Patient and clinical resources, memberships, and configuration. **Requires self-hosting.** |

![Compare one shared Patient in one project, separate Patients in one project, and separate Patients in separate projects. Project-per-tenant design requires self-hosting.](/img/tenancy-design/model-selection.png)

_Each option shows the same person receiving care from practices A and B. Choose access to their clinical records separately._

<div id="option-a-shared-patient-records"></div>
<div id="option-b-tenant-specific-patient-records"></div>
<div id="option-c-separate-projects"></div>

For A, agree who maintains the common Patient information. For B, preserve each tenant’s record when matching patients or importing data. A and B share project administration: project administrators can manage access across tenants. C separates project administration and requires setup for each project.

{{< note title="Patient information can itself be PHI" >}}
**Personally identifiable information (PII)** can identify a person. Under HIPAA, **protected health information (PHI)** generally includes identifiable health, care, or payment information held or transmitted by a covered entity or business associate. Demographics associated with receiving care can be PHI even without diagnoses or clinical notes. Sharing a Patient record can therefore be a PHI-sharing decision while other clinical records remain isolated. See [NIST's PII definition](https://csrc.nist.gov/glossary/term/personally_identifiable_information) and [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html).
{{< /note >}}

Implementation: [Patient Records and Clinical Sharing](/docs/tenancy-design/patient-records), or [Projects](/docs/access/projects#project-per-customer-tenancy) for Model C.

### Choose clinical sharing separately {#clinical-sharing-and-record-lifecycle}

| Choice | Example | Main consequence |
| :--- | :--- | :--- |
| **Separate records** | Services share contact details but keep visits and results separate. | Limit visits and results to the intended tenant, even when Patient information is shared. |
| **Selected sharing** | A referral package crosses practices. | Define the records, recipients, and duration or exchange rules. |
| **Shared chart** | Services coordinate around a common chart. | Agree who participates, what they can update, and whether sharing includes historical records. |

With separate projects, your application must coordinate any sharing between them. See [Clinical-record isolation](/docs/tenancy-design/patient-records#clinical-record-isolation).

## 4. How should people work across tenants? {#staff-workflows-and-patient-accounts}

Choose the experience separately for **providers and staff**, and **patients if a portal is in scope**. An account is the identity someone signs in with; a session is their signed-in access to the application. The examples below use practices as tenants.

| Approach | Sign-in and switching experience | Main consequence |
| :--- | :--- | :--- |
| **1. One account, separate practice sessions** | Sign in, choose Practice A, and switch to Practice B when needed. Switching need not require another password. | Shared account recovery; each session has its own practice permissions. |
| **2. One account, access across practices** | Sign in once and use a practice selector or a combined workspace. | The selector changes the view while the session retains its approved access. Each action needs a clear practice destination. |
| **3. Independent practice accounts** | Activate and use a separate account for each practice. | Separate account lifecycles, with more sign-in and account-management work. Password and recovery independence depend on your identity-provider setup. |

For example, providers might switch between practice schedules or work through a combined queue. Patients might select a practice before completing forms or see appointments from both practices in one portal. Choose which experience your users need.

![Compare one account with two practice sessions, one account with combined access in a single session, and independent practice accounts with their own sessions.](/img/tenancy-design/account-choices.png)

<div id="approach-1-shared-sign-in-separate-contexts"></div>
<div id="approach-2-shared-sign-in-combined-access"></div>
<div id="approach-3-independent-accounts"></div>

Password prompts and recovery depend on your sign-in provider. If separate practice accounts use the same **single sign-on (SSO)** account, that SSO password and recovery remain shared.

### How the data model affects sign-in {#what-your-data-model-makes-possible}

All three approaches can use separate Patient records for the same person: one login can reach independently maintained records. With a shared Patient, each practice’s session can still have its own clinical permissions. With separate projects, sign-in and switching must also select the appropriate project; a combined workspace requires additional application work.

Implementation: [Identity, Memberships, and Sessions](/docs/access/tenant-selector). Choose credential providers and authentication methods in the [Authentication Decision Guide](/docs/decision-guides/authentication).

<div id="record-the-decisions"></div>
<div id="transfers-and-departure"></div>

## Before you implement

Record whether you need tenancy, what each tenant represents, the data model, clinical sharing, and account approach for each audience. Also decide what happens to records and access when someone joins another tenant or leaves. See [Enrollment and transfers](/docs/tenancy-design/patient-records#enrollment-and-transfers).

**Next:** Define role permissions in the [Access Control Decision Guide](/docs/decision-guides/access-control), then follow the three implementation paths in [Tenancy Design](/docs/tenancy-design).
