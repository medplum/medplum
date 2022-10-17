import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Family Relationships

## Introduction

Delivering healthcare can often involve more people than a single patient. Spouses, parents, children, and siblings can be involved in delivering care, participating in clinical activities, and providing insurance coverage or other financial support.

The FHIR spec provides a number of Resources for modeling a patient's relationship to other individuals, but how you use these tools will depend on your specific clinical setting and workflow.

This guide provides a framework to help you decide which resources to use to model your patients' family relationships, and recommends a few approaches that our users have found useful.

:::info Note

In this guide we will use the term "family member" throughout, as the most common use case is to model families. However, this similar data models can be used to model legal guardians, non-family caregivers, and any other individual related to the patient.
:::

## Use Cases

- Pediatric Health
- Family Medicine
- Group Therapy
- Maternal Health
- Clinical Trials and Population Health

## This guide will show you

1. The key FHIR Resources used to model relationships.
2. A decision guide for how to choose the right data modeling approach.
3. A set recommended approaches for modeling family relationships in FHIR.
4. Example use cases and queries for each approach.

## Key Resources

|                                                             |                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Patient**](/docs/api/fhir/resources/patient)             | This is the resource that models a human who receives clinical services, such as diagnostic labs, medications, and procedures.                                                                                                  |
| [**RelatedPerson**](/docs/api/fhir/resources/relatedperson) | This models the _relationship between two people_. For simple use cases, you can store demographic and contact information directly in the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource itself (see below). |
| [**Person**](/docs/api/fhir/resources/person)               | This resources can servce as a store for a common set of biographical and contact information about an individual person who is not the subject of any clinical activities.                                                     |
| [**Group**](/docs/api/fhir/resources/group)                 | The [Group](/docs/api/fhir/resources/group) resource provides a single resource to reference a collection of individuals. It can be used to model the family unit as a whole instead of a collection of individual resources.   |

## Decision Guide

How you decide to model family relationships will depend on your clinical setting, your processes, and your patient population. Below, we provide a few best-practice modeling approaches, as well as some questions you can answer to figure out which approach fits your use case the best.

Note that these are just starting points - you can mix and match these stategies to model your data according to your use case

|                                                              | [Family members participate in clinical activities?](#family-member-participation) | [Patients share family members?](#are-family-members-shared) | [Family members considered patients?](#are-family-members-patients) | [Focus of treatment](#family-unit-vs-individual-patient) |
| :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: | :----------------------------------------------------------: | :------------------------------------------------------: |
|     [**Patient** with Contact Information](#approach-1)      |                              No                              |                            Rarely                            |                              No                              |                    Individual Patient                    |
|        [**RelatedPerson**➡ **Patient**](#approach-2)         |                             Yes                              |                            Rarely                            |                              No                              |                    Individual Patient                    |
|  [**Person** ➡ **RelatedPerson**➡ **Patient**](#approach-3)  |                             Yes                              |                          Frequently                          |                              No                              |                    Individual Patient                    |
| [**Patient** ➡ **RelatedPerson** ➡ **Patient**](#approach-4) |                             Yes                              |                          Frequently                          |                             Yes                              |                    Individual Patient                    |
|           [**Group** of **Patients**](#approach-5)           |                             Yes                              |                          Frequently                          |                             Yes                              |                       Family Unit                        |

### Do family members participate in clinical or financial activities? {#family-member-participation}

The first question you should ask yourself is whether you need to keep track of family members' participation in **clinical or financial activities**.

Some examples of such participation include:

- Family members attend office visits with the patient
- A family member is the primary policyholder on the patient's insurance
- A family member is responsible for administering care or medication to the patient
- Family members undergo diagnostic testing or medical imaging to help diagnose and treat the patient

In many use cases, family members _do not_ participate in clinical and financial activities, but rather serve as only points of contact. In those situations, [Approach #1](#approach-1) provides a simple modeling approach that avoids the use of many different resource types.

### How often will Patients share family members? {#are-family-members-shared}

If your patients' family members _do_ participate in clinical/billing activities, the next question is how often patients share family members. This tends to happen more frequently in pediatric and family medicine settings. For example, two siblings might be enrolled as separate patients in a pediatric clinic, but they share the same mother and father.

In these situations, it is desireable to "factor out" store demographic and contact information for each family member into a single resource, to make it easier to maintain, as outlined in [Approach #3](#approach-3) and [Approach #4](#approach-4). However, these approaches have some additional complexity since they another resource type to the model.

### Are family members also considered patients? {#are-family-members-patients}

The next step is to define who is considered a "patient" in your clinical setting.

In some settings, family members _particpate_ in clinical activities, but they are not patients themselves because they never receive any clinical data about themselves, and they are never treated by any medication or clinical procedures. For example, in an pediatric behavioral therapy, parents may _attend_ counseling sessions, but they are not the beneficiaries of the treatment. In this situations, they would not be considered "patients."

However, in other settings, multiple family members may be the beneficiaries of clinical information or procedures, so they would all be considered "patients." In maternal care settigns, some medications and treatments may be prescribed for the mother, while additional therapies might be prescribed for the child. In this case, both mother and child would be considered "patients."

Approaches [#2](#approach-2) and [#3](#approach-3) are applicable for non-patient family members, while [Approach #4](#approach-4) describes how to model relationships between family members who are also patients. If your setting involves some patient and some non-patient family members, you can also combine approaches [#2](#approach-2), [#3](#approach-3), and [#4](#approach-4).

### Is the subject of the treatment an indivdual patient, or a family unit? {#family-unit-vs-individual-patient}

In most cases, the focus of each clinical activity will be a single patient, even if an overall care plan involves multiple related patients. However, in some cases, the beneficiary of the treatment is the family unit as a whole, not the individual members. This is most common in family or group counseling scenarios (such as Alcoholics Anonymous), where the clinical objective is to help treat the interpersonal relationships between family members, rather than any specific individual.

In these instances, you can create a [Group](/docs/api/fhir/resources/group) resource with all the Patients who are the focus of the activity, and treat the [Group](/docs/api/fhir/resources/group) as a single clinical  unit, as detailed in [Approach #5](#approach-5).

## Data Models

After you've answered these questions about your use case, you're ready to make some decisions on how to model your family relationships. Below, we've outlined a few data modeling schemes, but these are not mutually exclusive. You may choose to mix and match the schemes to better suit your needs.

### Approach #1: [Patient](/docs/api/fhir/resources/patient) with Contact Information {#approach-1}

<Tabs>
<TabItem value="diagram" label="Diagram" default>

:::warning
:::

</TabItem>
<TabItem value="data" label="JSON" >

```json

```

</TabItem>
<TabItem value="query" label="GraphQL" >

```ts

```

</TabItem>
</Tabs>

If your family members do not participate in clinical/billing activities and patients rarely share family members, the simplest approach is just to store information about family members directly on the [Patient](/docs/api/fhir/resources/patient) resource.

The `Patient.contact` property can store a list the following information about each family member:

| Information       | Property                          |
| ----------------- | --------------------------------- |
| Name              | `Patient.contact[i].name`         |
| Gender            | `Patient.contact[i].gender`       |
| Address           | `Patient.contact[i].address`      |
| Phone Number      | `Patient.contact[i].telecom`      |
| Email             | `Patient.contact[i].telecom`      |
| Relationship Type | `Patient.contact[i].relationship` |

The benefits of this approach is that you only have to manage one resource type, the [Patient](/docs/api/fhir/resources/patient), which makes your API calls very simple.

The tradeoff is that if patients share family members (e.g. siblings share the same parents), you'll have to duplicate that family's contact information on each [Patient](/docs/api/fhir/resources/patient)

| Pros                                                                         | Cons                                                            | Use If                                                                                                                                       | Example Use Cases                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| <ul><li>Simplest data model</li><li>Single resource type to manage</li></ul> | <ul><li>Duplication of data for shared family members</li></ul> | <ul><li>Family members **do not** participate in clinical or billing activities</li><li>Patients share family members infrequently</li></ul> | <ul><li>At-home lab testing</li><li>Adult mental health therapy</li></ul> |

### Approach #2: [RelatedPerson](/docs/api/fhir/resources/relatedperson) ➡ [Patient](/docs/api/fhir/resources/patient) {#approach-2}

<Tabs>
<TabItem value="diagram" label="Diagram" default>

:::warning
:::

</TabItem>
<TabItem value="data" label="JSON" >

```json

```

</TabItem>
<TabItem value="query" label="GraphQL" >

```ts

```

</TabItem>
</Tabs>

If family memebers _do_ participate in clinical/billing activities, then it might make sense to model them explicitly as a separate resource to track their individual participation.

You can model a family member explicitly as a [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource. The [RelatedPerson](/docs/api/fhir/resources/relatedperson) has one required field, `RelatedPerson.patient`, which is a reference to the target patient. The `RelatedPerson.relationship` property is a [CodeableConcept](/docs/fhir-basics#codeable-concepts-standarding-data) that can be used to specify the relationship type. In simple use cases where patients rarely share family members, then you can store basic demographic information and contact information directly in the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource.

The benefit of this approach is that you can track the family member's role in clinical and billing activities independently of the patient.

The tradeoff is that is that you need to maintain the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource in addition the [Patient](/docs/api/fhir/resources/patient) Resource.

:::info Note

Each [RelatedPerson](/docs/api/fhir/resources/relatedperson) can only have **one** patient assiocated with them it. This is because [RelatedPerson](/docs/api/fhir/resources/relatedperson) is meant to model the _relationship_ between a family member and a patient. Even if two patients the same family member, you'll have to create a new [RelatedPerson](/docs/api/fhir/resources/relatedperson) for each (patient, family member) pair to model each relationship.

:::

| Pros                                                                                                                                                   | Cons                                                                                                                                                                                                                 | Use If                                                                                                                                                                        | Example Use Cases                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| <ul><li>Simplest data model _that explicitly models family members_</li><li>Track the participation of family members in clinical activities</li></ul> | <ul><li>Requires maintaining links between [RelatedPersons](/docs/api/fhir/resources/relatedperson) and [Patients](/docs/api/fhir/resources/patient)</li><li>Duplication of data for shared family members</li></ul> | <ul><li>Family members **do** participate in clinical or billing activities</li><li> [Patients](/docs/api/fhir/resources/patient) share family members infrequently</li></ul> | <ul><li>Insurance coverage where the _beneficiary_ ([Patient](/docs/api/fhir/resources/patient)) is not the insurance _subscriber_ ([RelatedPerson](/docs/api/fhir/resources/relatedperson))</li></ul> |

### Approach #3:[Person](/docs/api/fhir/resources/person) ➡ [RelatedPerson](/docs/api/fhir/resources/relatedperson) ➡ [Patient](/docs/api/fhir/resources/patient) {#approach-3}

<Tabs>
<TabItem value="diagram" label="Diagram" default>

:::warning
:::

</TabItem>
<TabItem value="data" label="JSON" >

```json

```

</TabItem>
<TabItem value="query" label="GraphQL" >

```ts

```

</TabItem>
</Tabs>

If your practice begins to have patients who share family members, duplicating their contact information across mulitple [RelatedPerson](/docs/api/fhir/resources/relatedperson) resources can quickly become error prone.

For example, consider two Patients who are siblings and share the same mother. Because a [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource models the relationship between a person and a [Patient](/docs/api/fhir/resources/patient), each sibling would need it's own [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource linking them to the mother (as shown the the diagram). However, [Approach #2](#approach-2) duplicates the mother's contact information on each [RelatedPerson](/docs/api/fhir/resources/relatedperson). If the family moves, you will have to ensure that this address information is updated in both places.

To avoid this duplication, we can "factor out" the mother's demographic and contact information into a separate [Person](/docs/api/fhir/resources/person) resource. The [Person](/docs/api/fhir/resources/person) is then connected to the [RelatedPerson](/docs/api/fhir/resources/relatedperson) using the `Person.link.target` property. This avoids the data duplication, at the expense of adding one more layer of indirection.

In this model, the [RelatedPerson](/docs/api/fhir/resources/relatedperson) does not store information about the mother, other than how she is related to each sibling.

| Pros                                                                                                                                        | Cons                                                                                       | Use If                                                                                                                                                                                                                           | Example Use Cases                        |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| <ul><li>Avoid data duplication for shared family members</li><li>Track the participation of family members in clinical activities</li></ul> | <ul><li>Adds another layer of indirection compared to [Approach #2](#approach-2)</li></ul> | <ul><li>Family members **do** participate in clinical or billing activities</li><li> [Patients](/docs/api/fhir/resources/patient) often share family members </li><li> Family members **are not** considered Patients </li></ul> | <ul><li>Pediatric Virtual Care</li></ul> |

### Approach #4: [Patient](/docs/api/fhir/resources/patient) ➡ [RelatedPerson](/docs/api/fhir/resources/relatedperson) ➡ [Patient](/docs/api/fhir/resources/patient) {#approach-4}

<Tabs>
<TabItem value="diagram" label="Diagram" default>

:::warning
:::

</TabItem>
<TabItem value="data" label="JSON" >

```json

```

</TabItem>
<TabItem value="query" label="GraphQL" >

```ts

```

</TabItem>
</Tabs>

This modeling approach is very similar to [Approach #3](#approach-3), except that instead of using the [Person](/docs/api/fhir/resources/person) resource to model the family member, you use a [Patient](/docs/api/fhir/resources/patient) resource. This approach makes sense if family members should also be treated as [Patients](/docs/api/fhir/resources/patient) because they also benefit from clinical information or procedures.

For example, in post-natal care, both mother and child will benefit from clinical activities such as physician visits ([Encounters](/docs/api/fhir/resources/encounter)), medication administration ([MedicationDispense](/docs/api/fhir/resources/medicationdispense)), and laboratory tests ([ServiceRequest](/docs/api/fhir/resources/servicerequest), [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport)).

Similarly to [Approach #3](#approach-3), contact and demographic information can be factored out into another [Patient](/docs/api/fhir/resources/patient) resource, and the new [Patient](/docs/api/fhir/resources/patient) can be linked to to the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource using the `Patient.link.other` property.

:::info Note

This approach _can_ be combined with [Approach #3](#approach-3), with some family being members being modeled by a [Person](/docs/api/fhir/resources/person) , where others are modeled as a [Patient](/docs/api/fhir/resources/patient) . However, to simplify your life, if need to model _some_ family members as [Patients](/docs/api/fhir/resources/patient), we recommend just modelling all family members as [Patients](/docs/api/fhir/resources/patient) to avoid having to deal with too many resource types.

:::

| Pros                                                                                                                                        | Cons                                                                                  | Use If                                                                                                                                                                                                                             | Example Use Cases                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| <ul><li>Avoid data duplication for shared family members</li><li>Track the participation of family members in clinical activities</li></ul> | <ul><li>Like [Approach #3](#approach-3), adds a second layer of indirection</li></ul> | <ul><li>Family members **do** participate in clinical or billing activities</li><li> [Patients](/docs/api/fhir/resources/patient) often share family members </li><li> Family members **should be** considered Patients </li></ul> | <ul><li>Maternal Care</li><li>Family Medicine</li></ul> |

### Approach #5: [Group](/docs/api/fhir/resources/group) of Patients {#approach-5}

<Tabs>
<TabItem value="diagram" label="Diagram" default>

:::warning
:::

</TabItem>
<TabItem value="data" label="JSON" >

```json

```

</TabItem>
<TabItem value="query" label="GraphQL" >

```ts

```

</TabItem>
</Tabs>

For some use cases, it is useful to keep track of the family unit as a whole, rather than as a web of connected [Patients](/docs/api/fhir/resources/patient), [RelatedPersons](/docs/api/fhir/resources/relatedperson), and [Persons](/docs/api/fhir/resources/person).

The [Group](/docs/api/fhir/resources/group) resources allows you to specify a single resource that represents the of people as a single unit, and in some places can be used inplace of the [Patient](/docs/api/fhir/resources/patient) resource. Some common examples are:

| Use Case                                                                                                          | [Group](/docs/api/fhir/resources/group) referenced by                            |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Family therapy office visit where the subject of the visit is the entire family, not just the individual members. | `Encounter.subject`                                                              |
| Measuring the effects of a drug administered to a patient population during a clinical trial.                     | `Condition.subject`<br />`MedicationDispense.subject`<br />`Observation.subject` |

For a group of specific individuals, each group member is referenced in the `Group.member.entity` property.

You can also use the [Group](/docs/api/fhir/resources/group) resource to model abstract groups, where the specific members are not clinically or financially relevant. Some examples of abstract groups are:

- A support group like Alcoholics Anonymous.
- A generalized population of patients for a clinical trial.
- A herd of animals for vetinary use cases.

Adding a [Group](/docs/api/fhir/resources/group) resource for your families an orthogonal choice to Approaches #1-4. You may choose to model the individual relationships via [RelatedPersons](/docs/api/fhir/resources/relatedperson) _and_ also consolidate the entire family into a group. If modeling family groups is important, Medplum recommends modeling all the individuals as Patients, as in Approach #4, and then referencing them in the `Group.member.entity` array.

In the case of abstract groups, you can use the `Group.quantity` field to record the size of the group, which may be important for analytics or billing workflows.

| Pros                                                                                                                  | Cons                                                                                                                                                                      | Use If                                                                                           | Example Use Cases                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| <ul><li>Single resource to reference the complete family group</li><li>Can be used to model abstract groups</li></ul> | <ul><li>Doesn't model specific relationships between individuals. Need to supplement with Approaches [#2](#approach-2), [#3](#approach-3), or [#4](#approach-4)</li></ul> | <ul><li>Focus of clinical, billing, or analytic activities is the family unit / group.</li></ul> | <ul><li>Family Counseling</li><li>Group Therapy</li><li>Population Health</li><li>Vetinary Care</li></ul> |
