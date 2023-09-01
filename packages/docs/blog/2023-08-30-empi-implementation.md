---
slug: empi-implementation
title: EMPI Reference Implementation
authors:
  name: Rahul Agarwal
  title: Medplum Core Team
  url: https://github.com/rahul1
  image_url: https://github.com/rahul1.png
---

# Enterprise Master Patient Index (EMPI) Reference Implementation

Patient record-keeping systems often have duplicate patient records, which can affect patient care and service delivery. One of the Medplum [use cases](/solutions#enterprise-master-patient-index-empi) is the the Enterprise Mater Patient Index (EMPI), database used in healthcare settings to maintain accurate and consistent unique identifiers for patients across various departments and services. A great EMPI implementation will improve patient safety, enhance the quality of care, facilitate data sharing among disparate healthcare systems, AND speed payer contracting.

The Medplum team has had experience with EMPIs across different practices, including telehealth practices, which especially thorny duplication and identity issues as patients may never meet providers in real life.

This video walkthrough summarizes a [reference implementation](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/deduplication) that we have developed based on our experience. It can be used with any identity solutions or matching algorithms.

<iframe width="560" height="315" src="https://www.youtube.com/embed/f1lDK-Af-RI?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

Our overview of [Patient Deduplication Architectures](/docs/fhir-datastore/patient-deduplication) describes the data model and pipelines in detail.

## Outline

The following points are covered in this implementation:

- How to **trigger the deduplication pipeline** by subscribing to changes on the Patient resource, which reduces the maintenance cost of implementation
- **Creating a Task** for humans to review high-risk duplicates
- **Creating the Risk Assessment** - how likely is this to be a duplicate?
- **Numeric scoring and qualitative scoring** for calculating the probability that a record pair is duplicates
- Workflow for **merging two records** driven by FHIR Questionnaires
- Showing **how duplicates are deactivated**, and creation of a bi-directional link between duplicates
- How to **mark records as "Do not merge"**
- Demonstration of traceability how to **audit merges**

[EMPI Deduplication workflow code](https://github.com/medplum/medplum/tree/main/examples/medplum-demo-bots/src/deduplication)

## Transcript

A video describing this implementation and annotated transcript is below.

<iframe width="560" height="315" src="https://www.youtube.com/embed/f1lDK-Af-RI?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

<details>
Today I'll go over a simple patient deduplication workflow in Medplum. [Patient deduplication](https://www.medplum.com/docs/fhir-datastore/patient-deduplication) is an important problem in healthcare, not just for cleaning up your data, but also for enriching your data when you're pulling patient records from multiple sources. Today's administration will show a human-in-the-loop deduplication pipeline that proceeds in two steps.

First, we will [listen for changes](/docs/subscriptions/publish-and-subscribe#setting-up-the-subscription) to a Patient. Create a set of candidate matches for that patient. Next, we'll have a human review those matches and decide whether to merge or block those matches. So let's get started. You'll see here that we have three patient records, all for people named Alex Smith.

The first two are clearly the same person, but the third one is clearly someone else. Even though they're clearly different ages, they all have the same birthdate. 1970, January 1st as a common placeholder, when the birthdate is not known for our deduplication pipeline, we're going to do a match on first name, last name, date of birth, and zip code, which can be a pretty high fidelity matching pipeline.

In addition to these patient records, we have clinical data associated with each one. So for Mr. Alex Smith, you can see that we have encounters that are linked to that patient. However, we've also gotten medication records in the form of medication requests, also known as prescriptions, but they're assigned to the second Alex Smith record from no, Mr.

So, to trigger our pipeline, we'll first make a change to one of the patient records. She'll then kick off a search for any kind of matching records. Okay, so let's go off and go ahead and kick off this [deduplication pipeline](/docs/fhir-datastore/patient-deduplication#incremental-pipelines). So I'll make a change to Mr. Alex Smith and I'll give him a phone number. So let's just add a phone number here.

We'll say, okay, this will kick off one of our bots. That will look through all patients to [find matches](/docs/fhir-datastore/patient-deduplication#matching-rules). Once it finds a match, it will create a task resource to review the potential duplicate.

So let's, let's look at here. There's not much to the task. The real heart of the real resource that represents the candidate match will be the risk assessment resource, which we'll talk about in a second.

But here we'll see that there's the task. Kind of indicates whether or not this task is active and who should be performing this task. This is great for incorporating the deduplication review into your existing [task-based workflow](/blog/task-management-apps). Let's look at the candidate match in the risk assessment.

So we use a risk assessment resource in a couple different ways. First, We use the method field to indicate what kind of matching rule produced this candidate match here. It was a name, date of birth, and zip code. As I mentioned earlier, the subject is who is considered the source record. That is the the person who triggered the matching process, and we use the basis field for the target record, who we think they match to.

We can also have a, if we look at the JSON, we see that we can have a a numeric score on the probability of match as well as a qualitative assessment. Here we're saying it's 90%, it's almost certain, but we can't be a hundred percent sure. So we'll see. After this first step, we have two candid matches.

One is Mr. Alex Smith, two Alex Smith, and another one is Mr. Alex Smith. To Ms. Alex Smith. The woman patient earlier. Now we're ready for the second part of our pipeline, which is to merge these records. So we'll go to our first one. We'll click on the apps tab, which will show a questionnaire. Questionnaire is a type of FHIR resource associated with this [RiskAssessment](/docs/api/fhir/resources/riskassessment).

Again, the risk assessment being the risk of a match. And we think that Mr. Alex Smith and Alex Smith are probably a good match, so we'll decide to merge them. So we will not leave the, we will not check this box and then we'll have a couple choices in terms of how we have merge the data. We're gonna merge the names.

We're not gonna do anything with the address because they're the same. And for right now, we won't delete the source patient.

The reason you might wanna do this is after you've done the deduplication, you might want to clean up the old data. However, right now we want to keep the old data round for posterity, so we'll click okay here. Now, if we go back to our patients, we'll see a couple things. We'll see that within these two records.

The Alex Smith record has now become the [master record](/docs/fhir-datastore/patient-deduplication#master-record-structure). We see this because it is listed as active. True, but it's the original Mr. Alex Smith record no longer is active. We'll also see that there's this link field that says it replaces Mr. Alex Smith and the other way around Mr. Alice Smith is replaced by Alex Smith, so there's a bidirectional link there.

Additionally, we'll see that the [Encounter](/docs/api/fhir/resources/encounter) resources we had before have now been updated. To point from Mr. Alex Smith to Alex, our target resource. So all the clinical data has now been [merged to the target patient](/docs/fhir-datastore/patient-deduplication#combining-and-splitting-master-records). Let's go back to our risk assessments, which are our can matches, and let's look at Alex Smith to Mrs.

Alex Smith. Now for this one, we know that they, a human, decide that they're not. The same patient. So we're gonna say, do not merge these records. Let's talk about this dunks. This will add each record to a list such that on the next time we do a match, we know not to make a candidate out of them. So in this case, we say Alex Smith does not, these are are called our **do not Match lists**.

So in this case, we have Smith. Should not be matched with Mrs. Alex Smith and reciprocally. We have Mrs. Alex Smith and should not be matched with Mr Alex Smith and we can do these. So every patient will have their own do not match list. And when we trigger the first part of our pipeline, again, we will skip over anything on our do not match list.

It can be an arbitrary number of elements on each do not match list. Let's just take a quick look at the bots that perform both of these operations. So we have two bots here. We have our fine matching patients, which is for the first step of the pipeline to generate the tasks and risk assessments, and the second step of our pipeline, which is the merge matching patients.

So as a final step, I'd like to talk about some of the traceability aspects of this deduplication pipeline. So first I'll show you how you can actually see who performed the merge operation. We click on Alex Smith, who was our merged patient. So first off, when we enter the patient page, we'll see in this timeline view that there was a change made to the resource to make this link to the other Alex Smith resource.

And we can see the details here. If we go to the link property, you can say, see that? We are linked to Mr. Alex Smith and vice versa. If we can go to Alex Smith, we can look at their details. Mr. Alex Smith, and you say that they're linked to Alex Smith. You see that they have a reciprocal connection. A Mr.

Alex Smith is replaced by, but Alex Smith replaces Mr. Alex Smith. Next we can look at the history tab to see all the changes that were made. We can actually see that I was the one. If we look here, who added those links? This is a key point I wanna focus on. Even though we use the bot to do it, we actually get the observability that I was the one who triggered the bot.

The way we set that up is that if we go to the bot resource itself, we click on merge match. Patients and go to the details tab. You can see that he has this one flag called Run as users said, to troop for these kind of sensitive deck pipelines. You are gonna wanna turn that on. What that means is that when this bot runs, it keeps track of who triggered it and will show up in the history as that person performing the operations as opposed to the but itself.

So, This is just to give you a quick overview of how even though we performed this merger operation, you can audit when it was done and who it was done by. These bots are stored in our Medplum demo bots repo, and I encourage you to check out that repository to check out the code.

</details>
