# Family Relationships

## Introduction



* Healthcare can often involve family members
  * Tracking health outcomes for multiple family members
  * Tracking the participation of family members
  * Consolidating information across members to avoid redundant contact

* Use Cases
  * Pediatric Health
  * Family Medicine / Group therapy
  * Maternal Health
  * Clinical Trials
* However, using FHIR can be a be a bit intimidating when you first get started
  * The spec covers a variety of use cases, but it can be a bit of a design exercise to tailor it to your needs
  * This guide will help you make the decisions on how to model patient families for your implementation
  * In this guide we will use the term "family member"  throughout, as the most common use case is to model families. However, this same model can be used to model legal guardians, non-family caregivers, and any other individual.

## Key Resources

Before we get started, there are a few resources you will have to familiarize yourself with some key resources

|                    |                                                              |
| ------------------ | ------------------------------------------------------------ |
| **Patient**        | This is the resource that models a human who receives clinical services, such as diagnostic labs, medications, and procedures. |
| **Related Person** | This weirdly named Resource models the **relationship between two people**.  For simple use cases, you can store demographic and contact information on the RelatedPerson resource itself (see below) For more complex family models, you might want to store that information in a  Person or Patient resource, and use the RelatedPerson purely to model the relationship between the two resources. |
| **Person**         |                                                              |
| **Group**          |                                                              |



## Decision Guide

Below we've outlined a few different configurations that you can use to model families, depending on your answers to these questions. Note that these are just starting points - you can mix and match these stategies to model your data according to your use case

|                                    | Do family members participate in clinical activiites? | How often will Patients share family members? | Which family members will get need clinical information (test results, clinical notes, lab specimens), if any? | Is the focus of the treatment an indivdual patient, or a family unit? |
| :--------------------------------- | :---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | :----------------------------------------------------------- |
| Patient w/ Contact Information     | No                                                    | Rarely                                        | Only Patient                                                 | Individual                                                   |
| Patient + RelatedPerson            | Yes                                                   | Rarely                                        | Only Patient                                                 | Individual                                                   |
| Patient / RelatedPerson / Person   | Yes                                                   | Frequently                                    | Only Patient                                                 | Individual                                                   |
| Patient / RelatedPerson /  Patient | Yes                                                   | Frequently                                    | All Members                                                  | Individual                                                   |
| Group of Patients                  | Yes                                                   | Frequently                                    | All Members                                                  | Family Unit                                                  |





* First, you'll have to ask yourself a few questions
  1. Do family members participate in clinical activiites?
  2. Is the focus of the treatment an indivdual patient, or a family unit?
  3. Which family members will get need clinical information (test results, clinical notes, lab specimens), if any?
  4. How often will Patients share family members?





### Do family members participate in clinical activiites?

* If the only reason you need to keep track of family members is for their contact information, and your patients generally don't share family members, then you can use the Patient.contact field (see below). This allows you to 
* However, if family members participate in clinical or billing activities, you can reference their participation by creating a RelatedPerson resource for them (see below). 
* Some examples of how a family member may participate in clinical / billing activities:
  * Child/dependent is the subject of a clinical office visit, parents / family are in attendance
  * Family member is the insurance subscriber / payor, patient is a spouse or dependent
  * A Newborn (patient) is administered a medication by a parent

 1. How often will Patients share family members?

    - Depending on your practice setting, you may have mulitple patients who share family members. 
    - For example, two siblings might be enrolled as separate patients in a pediatric clinic, but they share the same mother and father. 
    - In these situations, it is desireable to store demographic and contact information in single resource, to make it easier to update. 
    - For example, you would want a single resource representing both siblings' father, to make sure his information was always up to date. 
    - However, because a RelatedPerson resource models the relationship between a person and a patient, each sibling would need it's own RelatedPerson resource linking them to the father
    - Therefore, you will need to model the father as either a Person or a Patient, and use either the Patient/RelatedPerson/Person or Patient/RelatedPerson/Patient schemes below to model the family.

 2. Which family members will get need clinical information (test results, clinical notes, lab specimens), if any?

    - Next, we should try to estimate which family members will be the "focus" of clinical activities and will be the subject of clinical information.
    - Some examples of clinical activities are:
      - Office / Telehealth visit with a physician
      - Receipt of a medication or prescription
      - Performance of imaging or labwork
      - Receipt of a clinical procedure or operation
    - Each individual who is the focus of a clinical activity should be modeled as a Patient resource.
    - For example:
      - In pediatric virtual therapy, a single child may be the focus, even if parents are attending sessions
      - In a maternal care situation, some medications and treatments may be prescribed for the mother, who is the focus of those activities. Additonal therapies might be prescribed for the child, who would be the focus of those activities.

 3. Is the subject of the treatment an indivdual patient, or a family unit?

    - In most cases, the focus of each clinical activity will be a single patient, even if an overall care plan involves multiple related patients

    - However, in some cases, the beneficiary of the treatment is the family unit as a whole, not the individual members. 

    - This is most common in Family Counseling scenarios, where the clinical objective is to help treat the interpersonal relationships between family members, rather than any individual

    - In these instances, you can create a Group resource with all the Patients who are the focus of the activity, and treat the Group as a single clinical unit (see below)

    - In practice, you will typically use the Group to set the Encounter.subject or Appointment.subject resources

      

* Data Models

  * Intro
    * After you've answered these questions about your use case, you're ready to make some decisions on how to model your family relationships
    * Below, we've outlined a few data modeling schemes, but these are not mutually exclusive. You may choose to mix and match the schemes to better suit your needs.
  * Approach #1: Patient w/ Contact Information
    * If your family members **do not** participate in clinical activities, and patients rarely share family members, then the simplest approach is just to store information about family members directly on the Patient resource, using the Patient.contact property.
    * The benefits of this approach is that you only have to deal with one resource type, the Patient, which makes your API calls very simple. 
    * The tradeoff is that if patients share family members (e.g. siblings share the same parents), you'll have to duplicate that family's contact information on each Patient.
    * Pros
      * Simplest data model
      * Single resource type to manage
    * Cons
      * Duplication of data for shared family members
    * Use if
      * Family members **do not** participate in clinical or billing activities
      * Patients share family members infrequently
    * Example Use Cases
      * At-home lab testing
      * Adult mental health therapy

  :::warning Example GraphQL query needed

  :::

  * Approach #2: Patient ⬅ RelatedPerson

    * If family memebers **do** participate in clinical and billing activities, then it might make sense to model them as a separate resource to track their individual participation
    * If the family members are not the focus of the clinical activity themselves, then they can be modeled with a RelatedPerson resource. 
    * The RelatedPerson has one required field, `RelatedPerson.patient`, which is a reference to the target patient
    * The `RelatedPerson.relationship` is a CodeableConcept that allows you to define the relationship type
    * If your patients rarely share family members, then you can store basic demographic information and contact information directly in the RelatedPerson resource, without any more resources
    * The benefit of this approach is that you can track the family member's role in clinical and billing activities independently of the patient
    * The tradeoff is that  is that you need to maintain the RelatedPerson resource in addition the Patient Resource. 
    * Also, you should note that each RelatedPerson can only have **one** patient assiocated with them it. This is because RelatedPerson` is meant to model a specific *relationship* between a family member and a patient. Even if two patients the same family member, you'll have to create a new RelatedePerson for each (patient, family member) pair.
    * Pros
      * Simplest data model that explicitly models family members
      * Track the participation of family members in clinical activities
    * Cons
      * Requires maintaining links between RelatedPersons and Patients
      * Duplication of data for shared family members
    * Use if
      * Family members **do** participate in clinical or billing activities
      * Patients share family members infrequently
    * Example Use Cases
      * Modeling insurance coverage where the  beneficiary (Patient) is not the insurance subscriber (RelatedPerson)

    :::warning Diagram Needed

    :::

    :::warning Example GraphQL query needed

    :::

  * Approach #3: Patient ⬅ RelatedPerson ⬅ Person

    * If your practice starts to have patients who share family members, duplicating their contact across mulitple RelatedPerson resources can quickly become error prone.
    * For example, consider two Patients who are siblings and share the same mother. Each would have a separate RelatedPerson to model their relationship with their mother.
    * However, in approach #2, we duplicate the mother's contact information on each `RelatedPerson`. If the family moves, the information would have to be updated in two places.
    * To avoid this duplication, we can factor the mother's demographic and contact information into a separate `Person` resource. 
    * The `Person` is then connected to the RelatedPerson using the `Person.link.target` property
    * This avoids the data duplication, at the expense of adding one more layer of indirection.
    * In this model, the `RelatedPerson` does not store information about the mother, other than how she is related to each Sibling (child)
    * Pros
      * Avoid data duplication for shared family members
      * Track the participation of family members in clinical activities
    * Cons
      * Adds another layer of indirection compared to Approach #2
    * Use if
      * Family members **do** participate in clinical or billing activities
      * Family members **are not** the focus of clincal activities
      * Patients often share family members.
    * Example Use Cases
      * Pediatric Virtual Care

    :::warning Diagram Needed

    :::

    :::warning Example GraphQL query needed

    :::

  * Approach #4: Patient ⬅ RelatedPerson ⬅  Patient

    * This modeling approach is very similar to Approach #3, except that instead of using the `Person` resource, you use a `Patient` resource. 

    * This patient resource can be connected to the `RelatedPerson` resource using the 

    * This is useful when your family members are themselves the focus of some clinical activities.

    * For example, in post-natal care, both mother and child will participate in clinical activities such as physician visits (Encounters), receiving medication (MedicationDispense), and laboratory tests (ServiceRequest, DiagnosticReport).

    * This approach *can* be combined with Approach #3, with some family being members being modeled by a `Person`, where others are modeled as a `Patient`. 

    * However, to simplify your life, if your use case indicates that family members *may* participate in clinical activities, it will be easier just to model all family members as `Patient`s.

    * Pros

      * Track the clinical activities for all family members
      * Avoid data duplication for shared family members

    * Cons

      * Like Approach #3, adds a second layer of indirection

    * Use if

      * Family members **do** participate in clinical or billing activities
      * Family members **are** the focus of clincal activities

    * Example Use Cases

      * Maternal Care
      * Family Medicine

      :::warning Diagram Needed

      :::

      :::warning Example GraphQL query needed

      :::

  * Approach #5: Group of Patients

    * For some use cases, it is useful to keep track of the family unit as a whole, rather than as a web of connected `Patients`, `RelatedPersons`, and `Persons`. 

    * For example, in family therapy scenarios, the subject of the office visit (`Encounter.subject`) would be the entire family, not just the individual patients

    * The `Group` resources allows you to specify a single resource that represents the of people as a single unit.

    * Each member of the group is referenced in the `Group.member.entity` property

    * Adding a `Group` resource for your families an orthogonal choice to Approaches #1-4. You may choose to model the individual relationships via `RelatedPersons`, AND also consolidate the entire family into a group. 

    * If modeling family groups is important, Medplum recommends modeling all the individuals as Patients, as in Approach #4, and then referencing them in the `Group.member.entity` array.

    * You can also use the `Group` resource to model abstract groups, where the specific members are not clinically or financially relevant. 

    * Some examples of abstract groups are: 

      * A support group like Alcoholics Anonymous
      * A generlized population of patients for a clinical trial
      *  A herd of animals for vetinary use cases

    * In the case of abstract groups, you can use the `Group.quantity` field to record the size of the group, which may be important for analytics or billing workflows.

    * Pros

      * Single resource to reference the complete family group

    * Cons

      * Doesn't model specific relationships between individuals. Need to supplement with Approaches #2-4

    * Use if

      * Focus of clinical, billing, or analytic activities is the family unit / group.

    * Example Use Cases

      * Family Counseling
      * Group Therapy
      * Population Health
      * Vetinary Care

      :::warning Diagram Needed

      :::

      :::warning Example GraphQL query needed

      :::

