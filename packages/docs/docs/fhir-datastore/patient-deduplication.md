# Patient Deduplication

De-duplicating patient records from multiple sources is a nuanced workflow that can take on different forms. This guide will go over the basics of linking and merging patient records and review the most important considerations when architecting a patient de-duplication pipeline. 

We have a simple example of a patient deduplication Bot [here]().

## Linking Patient Records in FHIR

The FHIR [Patient]() has features to help with deduplication workflows

* The `Patient.active` element is used to indicate the master record for the patient. When a patient has multiple `Patient` resources in the system, all but one should be marked as "inactive."

* The `Patient.link` element is used to connect duplicate patient records via reference. In a deduplication pipeline, all the `Patients` will be linked directly to the merged record.

  * `Patient.link.type` indicates the type of relationship between the patient records. In this use case, the type will take the value `"replaced-by"`.
  * `Patient.link.other` is a reference to the merged record

  

## Architecture Overview

While de-duplication pipelines can take many forms, there two primary operations in every pipeline: 

1. **Matching:** For each patient record, find all other records that could are potential matches.
2. **Merging:** Merge all the information into a single record to serve as the source of truth. 

There are many different ways to implement this pipeline. Some of the most common decisions to be made in choosing an archtecture are:

* Whether you are building a batch vs. incremental deduplication pipeline
* What matching rules to use
* Merge rules
  * Whether to create a new "master record", or promote an existing record
  * Whether to re-write pointers to clinical data
  * Ids



When making your architectural decisions, the most important factors to consider are:

* **Prevalence of duplicates:** Making an *a priori* estimate of your duplication rate will help you determine the complexity needed in your deduplication pipeline. This includes duplicates *across* source systems as well as *within* each system. Some clincal settings have rare duplication rates (e.g. < 1%) while others have frequent duplicates (10-50%). Still others have very bi-modal duplication patterns (e.g 99% of records have 0 duplicates, 1% of records have 5+ duplicates).

* **Longevity of source systems:** Some pipelines are built to ingest patient data from short-lived/one-time sources, with Medplum quickly serving as a source of truth. In contrast, some pipelines read from their source systems for a long time/indefinitely. This is true in the case of large, production data migrations, or when building pipelines from Health Information Exchanges (HIEs).

* **Frequency of unmerging patients:** No deduplication system will be 100% perfect. Certain architectural choices make it easier or harder to un-merge patient records once merged, and the right choice for you will depend on the cost of an incorrect merge and the frequency with which you expect do unmerge records.

* **Downstream usage:** The right deduplication architecture will ultimately depend on how the de-duplicated data will be used. Records that service a provider portal will have different considerations than a system that will also support patient authentication. This will be different still from an application that acts as an API-based data aggregator.

  

## Batch vs. Incremental Pipelines

Your deduplication pipeline can be implemented in either *batch* or *incremental* versions. This is not a mutually exclusive choice, and many organizations will end up buildng both. 

We recommend starting with a batch pipeline. If your source systems are short-lived or changing infrequently, a batch pipeline may be sufficient. Regardless, batch pipelines are typically easier to get started with because they work offline and can often run on a local machine. 

### Batch Pipelines

Batch pipelines run as offline jobs that considers all records at once to produce pairs of patient matches. As this is an N^2 problem, they are primarily constrained by memory rather than latency.

Typically, these pipelines compute matches in a data warehouse or compute engine outside of the Medplum data store. A typical workflow is:

1. Export patient data from Medplum into the appropriate data warehouse or compute engine (e.g. [Spark]()). Note that even large patient datasets should be able to fit into local memory (1M patients < 10GB), so often computation on a local laptop can be suffient. See our [analytics guide]() for more info.
2. Use [matching rules]() to detect pairs of records. Because this is an N^2 operation, we recommend using some form of exact matching rules to reduce the cardinality of the problem, before applying "fuzzy matching."
3. Use [merging rules]() to determine the master patient record.
4. Use the Medplum API to update the `Patient.active` and `Patient.link` elements for all records.



### Incremental Pipelines

Each invocation of an incremental pipeline considers a single record and finds all matches. As these pipelines are typically used to  manage high-frequency, event-driven updates, latency is more of a concern than memory. 

Incremental pipelines can often be implemented using [Medplum Bots](), and a typical workflow is: 

1. Set up a Bot to listen for updates to patient records.
2. Use [matching rules]() to detect matching records. Because incremental pipelines only consider matches for a single record, we are less memory constrained and can apply more "fuzzy matching" rules. 

* Use [merging rules]() to update the master patient record.

* Update the `Patient.active` and `Patient.link` elements for all relevant records.

  

##  Matching Rules

The best deduplication systems use a library of matching rules with different strengths and weaknesses. While the effectiveness of different patient matching rules will vary depending on the clinical context, here we suggest some rules to get you started. 

These have been trialed in previous deduplication projects, and are rated by their false positive (incorrect match) and false negative (missed matches) rates.

1. **Exact match on name, gender, email address or phone number: ** We recommend starting here. Email and phone act as "pseudo-unique" identifiers, and have a very low false positive rate, though they are most likely to have false negatives. Using name and gender help eliminate false positives caused by family members sharing the same contact info. Note that phone numbers should be normalized.
2. **Exact match on first name, last name, date of birth, and postal code:** These matches have a high probability of being true positives, and can be used without email or phone number. Not that false positives can still occur - we recommend human review of these matches.
3. **Phonetic match first match on first and last name, date of birth, and postal code:** Phonetic matching algorithms such as [Soundex](https://en.wikipedia.org/wiki/Soundex) or [Metaphone](https://en.wikipedia.org/wiki/Metaphone) can be used to increase the match rate on names and accounts for transcription error. Alternatively, setting a threshold on the [edit distance](https://en.wikipedia.org/wiki/Levenshtein_distance) between the names.
4. **Phonetic match first name, date of birth: ** This rule excludes last names, to account for patients who change their names (e.g. after getting married). It also exlcudes address information to account for patients who move. While this rule will catch more matches, it has a significantly higher false positive rate, and should definitely be coupled with human review.
5. **Machine Learning:** After you have built up a dataset of (patient, patient) candidate matches that have been reviewed by a human, you are in a good position to train a machine learning model. The most common setup is to treat this as a binary classificaiton problem that outputs a match/no-match decision for a candidate (patient, patient) pair, and then use your [merge rules]() to convert these pairs into a single master record.



## Merge Rules

After you have found a set of matching records, Surprisingly, the merge step of the deduplication pipeline contains the most complexity. The merge operation will depend on yoru clinical and business context, and this section will discuss some of the decisions that need to be made when designing your patient merge operation. 

The HL7 organization (the maintainers of FHIR) are also drafting a [FHIR standard merge operation]() which medplum may implement once the specification has matured.

### Creating a new master record vs. promoting an existing record

You will need to decide which record is considered the "master record." The two most common choices are: 

1. Use some rule to promote one of the existing `Patient` records as the master record. All new updates to the patient are applied directly to this promoted record.
2. Create a new `Patient` resource in the target system that replaces all the `Patients` from the source system. All new updates to a patient are applied to the corresponding "source" record, and merged into the master record as a second step.

The table below summarizes the tradeoffs between the two approaches. The main factors that influence this decision are the frequency of duplicates, and the frequency of un-merging records.

| New Master Record                               | Promote Existing Record |
| ----------------------------------------------- | ----------------------- |
| **Easier to un-merge: ** Because each reference |                         |



### Rewriting references from clinical data

### When to unmerge 

### Assigning master record ids



* Whether to create a new "master record", or promote an existing record
* Whether to re-write pointers to clinical data
* Un merge? 
* Ids



