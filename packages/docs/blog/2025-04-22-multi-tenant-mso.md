---
slug: multi-tenant-mso
title: Multi-Tenant MSO with Medplum
authors: finnbergquist
tags: [mso, tenant, access-control]
---

# A step by step guide to building a Multi-Tenant Managed Service Organization with Medplum

In the Medplum community of implementors, a common use case is building an application that **serves multiple clinics** in the form of a Managed Service Organization (MSO). An MSO is a separate business entity that provides non-clinical services—e.g., revenue-cycle management, HR, IT, compliance, facilities, and purchasing—to physician groups or other provider organizations.

<!-- truncate -->

In this post, we'll focus on some key features of an MSO application using Medplum: [multi-tenancy](#tenant-management-with-organizations), [access control](#access-control), [patient consent management](#additional-access-control-patient-consent), and [project-scoped users](#user-management-strategy). The application also supports FHIR, C-CDA and HL7v2 interfacing making it well suited to interface with record-keeping solutions across multiple practices.

If you haven't checked out the **MSO Demo App** yet, you can view the code [here](https://github.com/medplum/medplum-mso-demo) or watch our demo video below. The demo app is an example implementation for how to build the enrollment workflows and user management console for clinicians and patients across different clinics of an MSO provider network.

<div className="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/FJIZTI9_fBc?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## Understanding the MSO Architectural Needs

At its core, an MSO usually needs to handle the following requirements:

- Multiple clinics (tenants) sharing the same platform
- [Enrollment workflows](https://github.com/medplum/medplum-mso-demo/blob/main/src/operations/enrollment.ts) that allow Practitioners and Patients to be added and removed from one or more clinics
- Customizable access control which Users have access to which resources. This can built with varying levels of sophistication depending on how restrictive the MSO wants to be.
- [Provider directory](/docs/administration/provider-directory) to group and display clinicians from across the MSO.

## Core Implementation

### Tenant Management with Organizations

To achieve multi-tenancy with Medplum while allowing for some level of coordination between tenants, the recommended pattern is to represent each healthcare clinic as an [Organization](/docs/api/fhir/resources/organization) resource, all within a single Medplum [Project](/docs/api/fhir/medplum/project).

```ts
const clinic = await medplum.createResource<Organization>({
  resourceType: 'Organization',
  name: 'Kings Landing Health Center',
  active: true,
});
```

## Access Control

### Organizationally Contained Access Restrictions

:::info
To see reference implementation of each enrollment operation, see the [MSO Demo App Enrollment Operations](https://github.com/medplum/medplum-mso-demo/blob/main/src/utils/enrollment.ts).
:::

The most basic MSO access control model is to **restrict access to resources that share a common Organization assignment**.

Imposing these restrictions on Practitioner users is done via Medplum's [AccessPolicies](/docs/access/access-policies), which are applied to each Practitioner user's [ProjectMembership](/docs/api/fhir/medplum/projectmembership).

**Enrollment of a Practitioner into an Organization** is done by adding a Organization reference to the Practitioner ProjectMembership's **access** field. Here is an example for a Practitioner enrolled in one Organization:

```ts
{
 "resourceType": "ProjectMembership",
 //...
 "access": [
   {
     "parameter": [
       {
         "name": "organization",
         "valueReference": {
           "reference": "Organization/0195b4a4-0ed7-71ed-80cf-c6fff1e31152",
           "display": "Kings Landing Health Center"
         }
       }
     ],
     "policy": {
       "reference": "AccessPolicy/0195b4a3-374e-75cf-a6f0-0bcee7c754c5"
     }
   }
 ]
}
```

**Enrollment of a Patient into an Organization** uses [Compartments](/docs/access/access-policies#compartments), which provide a way to tag Patient resources with the Organization references that it belongs to. So for example, a Patient enrolled in two Organizations might look like this:

```ts
{
 "resourceType": "Patient",
 //...
 "meta": {
   "project": "019571c0-035b-72fe-a5fa-75d13a09589c",
   "compartment": [
     {
       "reference": "Organization/019571c0-035b-72fe-a5fa-75d13a09589c",
       "display": "King's Landing Center for Medicine"
     },
     {
       "reference": "Organization/0195b4a3-e637-77e2-ab0c-7ec36b68932d",
       "display": "Winterfell Pediatrics Center"
     },
   ]
 }
}

```

Because of the Patient's [compartment definition](https://build.fhir.org/compartmentdefinition-patient.html), which is essentially a way to link related resource types to the Patient resource, we can set the **compartment** array on the Patient resource and have that same **compartment** propogate to all the other resources related to the Patient. These are resources like Appointments, Observations, and DiagnosticReports that should all inherit the same access restrictions. This is done using the Patient [$set-accounts](/docs/api/fhir/operations/patient-set-accounts) FHIR operation.

For example, say you want to enroll _Patient/123_ into two Organizations, _Organization/789_ and _Organization/456_. You can do this by making the following request:

```ts
const response = await medplum.post('/fhir/R4/Patient/123/$set-accounts', {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: {
        reference: 'Organization/789',
      },
    },
    {
      name: 'accounts',
      valueReference: {
        reference: 'Organization/456',
      },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
```

Then, the [AccessPolicy](/docs/access/access-policies) can be configured to restrict access to all of the resources based on the Organization references in each resource's **compartment**. Here is what the Practitioner AccessPolicy might look like:

:::info
The `%organization` value is replaced at runtime with one or more of the Organization references from the Practitioner's ProjectMembership.access array
:::

```ts
{
 "resourceType": "AccessPolicy",
 "name": "Managed Service Organization Access Policy",
 "compartment": {
   "reference": "%organization"
 },
 "resource": [
   {
     "resourceType": "Patient",
     "criteria": "Patient?_compartment=%organization"
   },
   {
     "resourceType": "Observation",
     "criteria": "Observation?_compartment=%organization"
   },
   {
     "resourceType": "DiagnosticReport",
     "criteria": "DiagnosticReport?_compartment=%organization"
   },
   {
     "resourceType": "Encounter",
     "criteria": "Encounter?_compartment=%organization"
   },
   {
     "resourceType": "Communication",
     "criteria": "Communication?_compartment=%organization"
   },
   //...
 ]
}
```

### Additional Access Control: Patient Consent

What if we want to do everything discussed above but also restrict any access until the Patient has given consent?

To do this, we can create a universal [Consent](/docs/api/fhir/resources/consent) resource with its _status_ set to _active_ that can also be added to the Patient's compartment and extended to all resources related to the Patient using the [$set-accounts](/docs/api/fhir/operations/patient-set-accounts) operation. Then to revoke Patient consent, you can simply remove the Consent resource from the Patient's compartment.

Then, your access policy will look like this:

```ts
{
  "resourceType": "AccessPolicy",
  "name": "Managed Service Organization Access Policy with Patient Consent",
  "compartment": {
    "reference": "%organization"
  },
  "resource": [
    {
      "resourceType": "Patient",
      "criteria": "Patient?_compartment=%organization&_compartment=Consent/<your-universal-consent-id>"
    },
    {
      "resourceType": "Observation",
      "criteria": "Observation?_compartment=%organization&_compartment=Consent/<your-universal-consent-id>"
    },
    {
      "resourceType": "DiagnosticReport",
      "criteria": "DiagnosticReport?_compartment=%organization&_compartment=Consent/<your-universal-consent-id>"
    },
    {
      "resourceType": "Encounter",
      "criteria": "Encounter?_compartment=%organization&_compartment=Consent/<your-universal-consent-id>"
    },
    {
      "resourceType": "Communication",
      "criteria": "Communication?_compartment=%organization&_compartment=Consent/<your-universal-consent-id>"
    },
    //...
  ]
}
```

### Additional Access Control: Assigning Practitioner Access to Specific Patients

If allowing Practitioners to access all Patients enrolled in a shared Organization is not restrictive enough, you can also configure the AccessPolicy to only allow access to specifically assigned Patients. This can be done using a similar pattern to the Organizational access by not just adding Organization references to the Patient's compartment, but also adding Practitioner references to the Patient's compartment that represent the Practitioners that are allowed to access the Patient. Again, this is done using the [$set-accounts](/docs/api/fhir/operations/patient-set-accounts) FHIR operation.

For example, say you want to give _Practitioner/456_ in _Organization/789_ access to _Patient/123_. You can do this by making the following request:

```typescript
const response = await medplum.post('/fhir/R4/Patient/123/$set-accounts', {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'accounts',
      valueReference: {
        reference: 'Organization/456',
      },
    },
    {
      name: 'accounts',
      valueReference: {
        reference: 'Practitioner/789',
      },
    },
    {
      name: 'propagate',
      valueBoolean: true,
    },
  ],
});
```

along with this AccessPolicy:

:::note
The `%profile` value does not need to be explicitly added to the Practitioner's ProjectMembership like the Organization references are. `%profile` is a special variable that, in this case, is replaced with a reference to the Practitioner.
:::

```ts
{
 "resourceType": "AccessPolicy",
 "name": "Managed Service Organization Access Policy with Patient Consent",
 "compartment": {
   "reference": "%organization"
 },
 "resource": [
   {
     "resourceType": "Patient",
     "criteria": "Patient?_compartment=%organization&_compartment=%profile"
   },
   {
     "resourceType": "Observation",
     "criteria": "Observation?_compartment=%organization&_compartment=%profile"
   },
   {
     "resourceType": "DiagnosticReport",
     "criteria": "DiagnosticReport?_compartment=%organization&_compartment=%profile"
   },
   {
     "resourceType": "Encounter",
     "criteria": "Encounter?_compartment=%organization&_compartment=%profile"
   },
   {
     "resourceType": "Communication",
     "criteria": "Communication?_compartment=%organization&_compartment=%profile"
   },
   //...
 ]
}
```

## User Management Strategy

### Project vs Server Scoped Users

When building an MSO, it is recommended to follow the best practices for [project-scoped and server-scoped users](/docs/auth/project-vs-server-scoped-users):

- **Project-scoped users**: Ideal for clinicians and patients who primarily interact with a single production project
- **Server-scoped users**: Best for administrators and developers who need access across multiple projects

As you can see in the [MSO Demo App](https://github.com/medplum/medplum-mso-demo), we use project-scoped users for clinicians that are actually enrolled across different Organizations and server-scoped users for the administrators and developers who are provisioning clinician and patient access with the different [enrollment operations](https://github.com/medplum/medplum-mso-demo/blob/main/src/utils/enrollment.ts).

For reference, [here](https://github.com/medplum/medplum/blob/4e7955ffc9daba354ee2fe502b8f8c919916b0c7/examples/medplum-mso-demo/src/pages/NewClinicianPage.tsx#L96) is the code that the MSO Demo App uses to invite clinicians as project-scoped users.

## MSO Demo Links

- [MSO Demo App Video](https://www.youtube.com/watch?v=FJIZTI9_fBc)
- [MSO Demo App Code](https://github.com/medplum/medplum-mso-demo)
