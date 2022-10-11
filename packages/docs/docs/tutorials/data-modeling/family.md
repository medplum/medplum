# Family Relationships



# Outline

* Story

  * Healthcare can often involve family members
    * Tracking health outcomes for multiple family members
    * Tracking the participation of family members
    * Consolidating information across members to avoid redundant contact
  * Use Cases
    * Pediatric Health
    * Family Medicine / Group therapy
  * However, using FHIR can be a be a bit intimidating when you first get started
    * The spec covers a variety of use cases, but it can be a bit of a design exercise to tailor it to your needs
    * This guide will help you make the decisions on how to model patient families for your implementation
    * In this guide we will use the term "family member"  throughout, as the most common use case is to model families. However, this same model can be used to model legal guardians, non-family caregivers, and any other individual.
  * Key Resources
    * Before we get started, there are a few resources you will have to familiarize yourself with some key resources
    * Patient
      * This is the resource that models a human who receives clinical services, such as diagnostic labs, medications, and procedures.
      * 
    * Related Person
      * This weirdly named Resource models the **relationship between two people**. 
      * For simple use cases, you can store demographic and contact information on the RelatedPerson resource itself (see below)
      * For more complex family models, you might want to store that information in a  Person or Patient resource, and use the RelatedPerson purely to model the relationship between the two resources.
    * Person
    * Group
  * Data Modeling Questions
    * First, you'll have to ask yourself a few questions
      1. Do family members participate in clinical activiites?
      2. Is the focus of the treatment an indivdual patient, or a family unit?
      3. Which family members will get need clinical information (test results, clinical notes, lab specimens), if any?
      4. How often will Patients share family members?

  

  * Below we've outlined a few different configurations that you can use to model families, depending on your answers to these questions. Note that these are just starting points - you can mix and match these stategies to model your data according to your use case

  |                                    | Do family members participate in clinical activiites? | How often will Patients share family members? | Which family members will get need clinical information (test results, clinical notes, lab specimens), if any? | Is the focus of the treatment an indivdual patient, or a family unit? |
  | :--------------------------------- | :---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | :----------------------------------------------------------- |
  | Patient w/ Contact Information     | No                                                    | Rarely                                        | Only Patient                                                 | Individual                                                   |
  | Patient + RelatedPerson            | Yes                                                   | Rarely                                        | Only Patient                                                 | Individual                                                   |
  | Patient / RelatedPerson / Person   | Yes                                                   | Frequently                                    | Only Patient                                                 | Individual                                                   |
  | Patient / RelatedPerson /  Patient | Yes                                                   | Frequently                                    | All Members                                                  | Individual                                                   |
  | Group of Patients                  | Yes                                                   | Frequently                                    | All Members                                                  | Family Unit                                                  |

  

 1. Do family members participate in clinical activiites?

    * If the only reason you need to keep track of family members is for their contact information, and your patients generally don't share family members, then you can use the Patient.contact field (see below). This allows you to 
    * However, if family members participate in clinical or billing activities, you can reference their participation by creating a RelatedPerson resource for them (see below). 
    * Some examples of how a family member may participate in clinical / billing activities:
      * Child/dependent is the subject of a clinical office visit, parents / family are in attendance
      * Family member is the insurance subscriber / payor, patient is a spouse or dependent
      * A Newborn (patient) is administered a medication by a parent

 2. How often will Patients share family members?

    - Depending on your practice setting, you may have mulitple patients who share family members. 
    - For example, two siblings might be enrolled as separate patients in a pediatric clinic, but they share the same mother and father. 
    - In these situations, it is desireable to store demographic and contact information in single resource, to make it easier to update. 
    - For example, you would want a single resource representing both siblings' father, to make sure his information was always up to date. 
    - However, because a RelatedPerson resource models the relationship between a person and a patient, each sibling would need it's own RelatedPerson resource linking them to the father
    - Therefore, you will need to model the father as either a Person or a Patient, and use either the Patient/RelatedPerson/Person or Patient/RelatedPerson/Patient schemes below to model the family.

 3. Is the focus of the treatment an indivdual patient, or a family unit?

    - 

 4. Which family members will get need clinical information (test results, clinical notes, lab specimens), if any?

    







* Data Models
  * Patient w/ Contact Information
  * Patient + RelatedPerson
  * Patient / RelatedPerson / Person
  * Patient / RelatedPerson /  Patient
* Examples
  * Adolescent Behavioral Therapy (look up keywords)
  * Siblings treated separately
  * Family goup therapy ()
  * Maternal Health (mother child)

