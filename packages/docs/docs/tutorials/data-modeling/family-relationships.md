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

|                                                                                                                                                               | [Family members participate in clinical activities?](#family-member-participation) | [Patients share family members?](#are-family-members-shared) | [Family members considered patients?](#are-family-members-patients) | [Focus of treatment](#family-unit-vs-individual-patient) |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | :------------------------------------------------------- |
| [**Patient**](/docs/api/fhir/resources/patient) with contact information                                                                                      | No                                                                                 | Rarely                                                       | No                                                                  | Individual Patient                                       |
| [**Patient**](/docs/api/fhir/resources/patient) + [**RelatedPerson**](/docs/api/fhir/resources/relatedperson)                                                 | Yes                                                                                | Rarely                                                       | No                                                                  | Individual Patient                                       |
| [**Patient**](/docs/api/fhir/resources/patient)/ [**RelatedPerson**](/docs/api/fhir/resources/relatedperson) /[**Person**](/docs/api/fhir/resources/person)   | Yes                                                                                | Frequently                                                   | No                                                                  | Individual Patient                                       |
| [**Patient**](/docs/api/fhir/resources/patient)/ [**RelatedPerson**](/docs/api/fhir/resources/relatedperson) /[**Patient**](/docs/api/fhir/resources/patient) | Yes                                                                                | Frequently                                                   | Yes                                                                 | Individual Patient                                       |
| [**Group**](/docs/api/fhir/resources/group) of Patients                                                                                                       | Yes                                                                                | Frequently                                                   | Yes                                                                 | Family Unit                                              |

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

- If your family members **do not** participate in clinical activities, and patients rarely share family members, then the simplest approach is just to store information about family members directly on the[Patient](/docs/api/fhir/resources/patient)resource, using the Patient.contact property.
- The benefits of this approach is that you only have to deal with one resource type, the Patient, which makes your API calls very simple.
- The tradeoff is that if patients share family members (e.g. siblings share the same parents), you'll have to duplicate that family's contact information on each Patient.
- Pros
  - Simplest data model
  - Single resource type to manage
- Cons
  - Duplication of data for shared family members
- Use if
  - Family members **do not** participate in clinical or billing activities
  - Patients share family members infrequently
- Example Use Cases
  - At-home lab testing
  - Adult mental health therapy

:::warning Example GraphQL query needed

:::

### Approach #2: [Patient](/docs/api/fhir/resources/patient)⬅ [RelatedPerson](/docs/api/fhir/resources/relatedperson)

- If family memebers **do** participate in clinical and billing activities, then it might make sense to model them as a separate resource to track their individual participation
- If the family members are not the focus of the clinical activity themselves, then they can be modeled with a [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource.
- The [RelatedPerson](/docs/api/fhir/resources/relatedperson) has one required field, `RelatedPerson.patient`, which is a reference to the target patient
- The `RelatedPerson.relationship` is a CodeableConcept that allows you to define the relationship type
- If your patients rarely share family members, then you can store basic demographic information and contact information directly in the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource, without any more resources
- The benefit of this approach is that you can track the family member's role in clinical and billing activities independently of the patient
- The tradeoff is that is that you need to maintain the [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource in addition the[Patient](/docs/api/fhir/resources/patient)Resource.
- Also, you should note that each [RelatedPerson](/docs/api/fhir/resources/relatedperson) can only have **one** patient assiocated with them it. This is because [RelatedPerson](/docs/api/fhir/resources/relatedperson)` is meant to model a specific _relationship_ between a family member and a patient. Even if two patients the same family member, you'll have to create a new RelatedePerson for each (patient, family member) pair.
- Pros
  - Simplest data model that explicitly models family members
  - Track the participation of family members in clinical activities
- Cons
  - Requires maintaining links between [RelatedPerson](/docs/api/fhir/resources/relatedperson)s and Patients
  - Duplication of data for shared family members
- Use if
  - Family members **do** participate in clinical or billing activities
  - Patients share family members infrequently
- Example Use Cases
  - Modeling insurance coverage where the beneficiary (Patient) is not the insurance subscriber ([RelatedPerson](/docs/api/fhir/resources/relatedperson))

:::warning Diagram Needed

:::

:::warning Example GraphQL query needed

:::

### Approach #3: [Patient](/docs/api/fhir/resources/patient)⬅ [RelatedPerson](/docs/api/fhir/resources/relatedperson) ⬅[Person](/docs/api/fhir/resources/person)

- If your practice starts to have patients who share family members, duplicating their contact across mulitple [RelatedPerson](/docs/api/fhir/resources/relatedperson) resources can quickly become error prone.
- For example, consider two Patients who are siblings and share the same mother. Each would have a separate [RelatedPerson](/docs/api/fhir/resources/relatedperson) to model their relationship with their mother.
- However, in approach #2, we duplicate the mother's contact information on each [RelatedPerson](/docs/api/fhir/resources/relatedperson). If the family moves, the information would have to be updated in two places.
- However, because a [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource models the relationship between a person and a patient, each sibling would need it's own [RelatedPerson](/docs/api/fhir/resources/relatedperson) resource linking them to the father
- Therefore, you will need to model the father as either a[Person](/docs/api/fhir/resources/person) or a Patient, and use either the Patient/[RelatedPerson](/docs/api/fhir/resources/relatedperson)/Person or Patient/[RelatedPerson](/docs/api/fhir/resources/relatedperson)/Patient schemes below to model the family.

- To avoid this duplication, we can factor the mother's demographic and contact information into a separate `Person` resource.
- The `Person` is then connected to the [RelatedPerson](/docs/api/fhir/resources/relatedperson) using the `Person.link.target` property
- This avoids the data duplication, at the expense of adding one more layer of indirection.
- In this model, the [RelatedPerson](/docs/api/fhir/resources/relatedperson) does not store information about the mother, other than how she is related to each Sibling (child)
- Pros
  - Avoid data duplication for shared family members
  - Track the participation of family members in clinical activities
- Cons
  - Adds another layer of indirection compared to Approach #2
- Use if
  - Family members **do** participate in clinical or billing activities
  - Family members **are not** the focus of clincal activities
  - Patients often share family members.
- Example Use Cases
  - Pediatric Virtual Care

:::warning Diagram Needed

:::

:::warning Example GraphQL query needed

:::

### Approach #4: [Patient](/docs/api/fhir/resources/patient)⬅ [RelatedPerson](/docs/api/fhir/resources/relatedperson) ⬅ [Patient](/docs/api/fhir/resources/patient)

- This modeling approach is very similar to Approach #3, except that instead of using the `Person` resource, you use a `Patient` resource.

- This patient resource can be connected to the[RelatedPerson](/docs/api/fhir/resources/relatedperson) resource using the

- This is useful when your family members are themselves the focus of some clinical activities.

- For example, in post-natal care, both mother and child will participate in clinical activities such as physician visits (Encounters), receiving medication (MedicationDispense), and laboratory tests (ServiceRequest, DiagnosticReport).

- This approach _can_ be combined with Approach #3, with some family being members being modeled by a `Person`, where others are modeled as a `Patient`.

- However, to simplify your life, if your use case indicates that family members _may_ participate in clinical activities, it will be easier just to model all family members as `Patient`s.

- Pros

  - Track the clinical activities for all family members
  - Avoid data duplication for shared family members

- Cons

  - Like Approach #3, adds a second layer of indirection

- Use if

  - Family members **do** participate in clinical or billing activities
  - Family members **are** the focus of clincal activities

- Example Use Cases

  - Maternal Care
  - Family Medicine

  :::warning Diagram Needed

  :::

  :::warning Example GraphQL query needed

  :::

### Approach #5: [Group](/docs/api/fhir/resources/group) of Patients

- For some use cases, it is useful to keep track of the family unit as a whole, rather than as a web of connected `Patients`, `RelatedPersons`, and `Persons`.

- For example, in family therapy scenarios, the subject of the office visit (`Encounter.subject`) would be the entire family, not just the individual patients
- In practice, you will typically use the [Group](/docs/api/fhir/resources/group) to set the Encounter.subject or Appointment.subject resources

- The [Group](/docs/api/fhir/resources/group) resources allows you to specify a single resource that represents the of people as a single unit.

- Each member of the group is referenced in the `Group.member.entity` property

- Adding a `Group` resource for your families an orthogonal choice to Approaches #1-4. You may choose to model the individual relationships via `RelatedPersons`, AND also consolidate the entire family into a group.

- If modeling family groups is important, Medplum recommends modeling all the individuals as Patients, as in Approach #4, and then referencing them in the `Group.member.entity` array.

- You can also use the [Group](/docs/api/fhir/resources/group) resource to model abstract groups, where the specific members are not clinically or financially relevant.

- Some examples of abstract groups are:

  - A support group like Alcoholics Anonymous
  - A generlized population of patients for a clinical trial
  - A herd of animals for vetinary use cases

- In the case of abstract groups, you can use the `Group.quantity` field to record the size of the group, which may be important for analytics or billing workflows.

- Pros

  - Single resource to reference the complete family group

- Cons

  - Doesn't model specific relationships between individuals. Need to supplement with Approaches #2-4

- Use if

  - Focus of clinical, billing, or analytic activities is the family unit / group.

- Example Use Cases

  - Family Counseling
  - Group Therapy
  - Population Health
  - Vetinary Care

  :::warning Diagram Needed

  :::

  :::warning Example GraphQL query needed

  :::
