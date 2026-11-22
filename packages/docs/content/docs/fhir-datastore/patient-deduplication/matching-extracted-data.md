---
id: matching-extracted-data
title: Matching Patients from Extracted Data
sidebar_label: Matching Extracted Data
description: How to combine AI or OCR extraction confidence with Patient $match to file documents to the right patient safely.
keywords:
  - patient matching
  - fax intake
  - OCR
  - confidence score
  - document filing
---

Inbound faxes, scanned forms, and referrals carry patient demographics as text, not structured data. To file one of these documents to the right chart automatically, you first extract the demographics from the document, then look up the patient with [Patient $match](/docs/api/fhir/operations/patient-match).

Both steps can go wrong. This guide explains how to combine them so that automation files the clear-cut documents and people review the rest. Filing a document to the wrong patient's chart is a PHI incident: one patient's information is shown to another patient's care team, and the right patient's chart is missing it. A document that goes to a review queue instead is only slower. Design for that asymmetry: send a document to review whenever you are unsure.

This guide doesn't repeat the [`$match` reference](/docs/api/fhir/operations/patient-match), which covers the matching modes, match grades, CMS combinations, and normalization rules.

## Two kinds of confidence

Every automated filing decision depends on two different measures of confidence:

|                  | Extraction confidence                            | Match grade                                                                     |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Question         | Was this value read correctly from the document? | Do these values identify exactly one patient?                                   |
| Applies to       | Each extracted value                             | Each candidate patient                                                          |
| Where it's found | The extraction tool's output                     | The `match-grade` and `cms-match-combination` extensions in the `$match` result |

Neither is a calibrated probability. An extraction confidence of 95 doesn't mean the value is wrong 5% of the time, and the `$match` score is a ranking value, not a probability. A `certain` match means that an approved CMS combination of fields agreed with exactly one patient. It doesn't mean that those fields were read correctly. You need both measures: a `certain` match on a misread value is a confident wrong answer, and correctly read values may still not identify anyone.

### Extraction confidence scores

Most OCR and data extraction tools, including AI models, report a confidence score for each value they extract. Use these scores to decide which values to trust, but don't take their meaning from the tool's documentation alone:

- **Scores aren't comparable across tools.** Tools use different scales, such as 0 to 100 or 0 to 1, and a score of 90 from one tool, or one version of a model, doesn't mean the same as 90 from another.
- **Cutoffs come from your own data.** Which scores are reliable depends on your documents, senders, and scan quality, as well as the tool. Run your pipeline on real documents, compare the scores of values that were extracted correctly with those that weren't, and choose the cutoffs from those results. Expect different cutoffs for different fields, and different scores for the cutoff at which a value counts as low confidence and the cutoff at which it can be trusted for automatic filing. See [Tune the cutoffs](#tune-the-cutoffs).
- **Tune again when things change.** Check your cutoffs again when you switch tools or model versions, or start receiving documents from new senders or templates.
- **Check what the score measures.** A score may only say that the characters were read correctly, not that the value belongs to the patient. A fax often also names the sender, the referring provider, and the recipient.
- **Handle values without a score.** Some tools, including many LLMs, don't report a confidence. A confidence that you ask a model to report about itself is not reliable, and a model can return a plausible value that isn't in the document. Check that each value appears in the document's text, and treat values that don't as low confidence. If you run two extractors, agreement between them is another useful signal.

## Why `onlyCertainMatches` is the main safeguard

Call `$match` with `onlyCertainMatches: true` for automated filing. In this mode, `$match` returns a patient only if exactly one candidate satisfies an approved CMS combination, and otherwise returns an empty bundle. Several properties of this mode protect against extraction errors:

- **Most combinations need several fields to agree.** Combinations 01 to 16, 29, and 30 each need three or four fields, such as first name, last name, date of birth, and phone. For a misread value to produce a wrong match, it would have to equal another patient's value exactly, and the other fields would have to agree with that same patient. Much more often, a misread value matches no one, and the document goes to review.
- **Fuzzy comparison is limited.** A one-character error in a name or street line of at least 5 characters, or a date of birth off by one day, can still match, but at most one field per match can be fuzzy. The `cms-match-type` extension tells you when the match was fuzzy.
- **The uniqueness gate.** If two or more patients satisfy a combination, the result is empty rather than a guess. The twin guardrail requires an exact first name when more than one candidate shares the date of birth.
- **Truncation suppression.** If a candidate search hits its result cap, `$match` can't prove the match is unique, so the result is empty.
- **Generational suffixes.** A conflicting suffix, such as `Jr` and `Sr`, blocks the match.

Don't file documents automatically from discovery mode (the default, `onlyCertainMatches: false`). Its `probable` and `possible` grades don't meet the bar for unattended filing. Discovery mode is useful later, to suggest candidates to the person reviewing a document.

## Where one misread value can cause a wrong match

A few combinations need only one or two fields, which removes most of the protection described above:

- **Combination 22**: a namespace-bound identifier, such as your MRN, matches on its own. MRNs are often assigned in sequence, so a single misread digit can easily belong to another real patient, and the result is a `certain` match to that patient.
- **Combinations 17 to 21**: pairs of identifiers and contact details, such as phone + MBI, phone + Legal ID, or Legal ID + MBI. Only two fields have to agree. If a misread identifier belongs to someone in the same household, the shared phone number completes the match.

For these fields:

- **Use higher extraction cutoffs.** Require more confidence for an identifier that can match on its own, or in a pair, than for a name or date of birth, which need other fields to agree.
- **Cross-check the matched patient.** When the match relied only on identifiers (combinations 17 to 22), compare the matched patient's name and date of birth with the values extracted from the document. If they disagree, or the document has neither, send the document to review instead of filing it.
- **Only label an identifier with your system when you know it's yours.** `$match` compares identifiers by `system` and value. A referral from another practice usually shows that practice's MRN. If you send it with your own MRN system, it's compared against your patients' MRNs. Only set your MRN system for values you know your organization issued, for example from a barcode on your own requisition form. An identifier sent without a `system` can find candidates, but it never satisfies combination 22.
- **Leave out phone numbers that aren't the patient's.** Fax headers and cover sheets show the sender's phone and fax numbers. Patients in the same facility, such as a nursing home, may all have the facility's number on file.

## Patterns

### Set cutoffs for each field

Give each field its own cutoffs, based on how much a misread value of that field can do. A useful scheme has two cutoffs per field:

- A **use** cutoff: values below it are not sent to `$match` at all.
- An **auto-file** cutoff: a match that relies on a value below it needs a person to confirm it.

Set both higher for identifiers that can match alone or in pairs. Start strict, then [tune the cutoffs](#tune-the-cutoffs) against your own documents. The right values depend on your extraction tool and documents, so don't reuse cutoffs from another tool or project.

### Drop low-confidence values

Leave a low-confidence value out of the query rather than sending it to `$match`. A value you don't send can't cause a wrong match. Fewer fields only make a match less likely, and a document without a match goes to review, which is the safe outcome.

Filter placeholders yourself, too. `$match` doesn't skip placeholder values, so values such as `N/A`, `Unknown`, `000-000-0000`, or `1900-01-01` are compared like any other value.

Convert dates to `YYYY-MM-DD` before sending them. `$match` ignores a partial or differently formatted date of birth. A date such as `01/02/1980` is January 2 in the U.S. and February 1 in many other countries. If your documents come from senders with different conventions, treat a date where both the day and month are 12 or less as ambiguous.

### Include every phone number for the patient

`$match` compares sets of values: a field agrees if any value in the query equals any value on the patient. When a document lists a home and a cell number for the patient, send both in `telecom`. Each one is also used to search for candidates. Only include numbers that belong to the patient (see [above](#where-one-misread-value-can-cause-a-wrong-match)).

### Choose one of three outcomes

Route each document to one of three outcomes:

| Outcome       | When                                                                                                         | Action                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Auto-file** | A `certain` match, every field the match relied on is above its auto-file cutoff, and any cross-check passes | Set the document's `subject` to the patient and notify the care team.                                                    |
| **Suggest**   | A `certain` match, but a field it relied on is below its auto-file cutoff, or a cross-check failed           | Create a `Task` for a person to confirm the suggested patient. Don't set the `subject` until they do.                    |
| **Triage**    | No match, or no values above their use cutoffs                                                               | Create a `Task` for a person to file the document. Optionally, list discovery-mode `$match` candidates to speed this up. |

To tell which fields a match relied on, read the `cms-match-combination` extension on the result and look up that combination's fields in the [CMS combination table](/docs/api/fhir/operations/patient-match#approved-cms-matching-combinations). The extension reports a single combination, so treat its fields as the ones the match relied on. If you get a combination you didn't plan for, send the document to review.

You can also send fuzzy matches (`cms-match-type` of `fuzzy`) to review. With extracted data, the fuzzy field is often the one that was misread.

## Record what was extracted

For every document, record what was extracted, how confident the extractor was, what was sent to `$match`, the combination that matched, and the outcome. This record supports:

- **Review**: the person working a `Task` can see why the document needs them, next to the document.
- **Audit**: if a document is ever filed to the wrong patient, you can see why.
- **Tuning**: when a reviewer confirms or corrects a patient, that `Task` becomes a labeled example.

One approach is to create a `Task` for every document, with the document as the `focus` and the extracted values and confidences in `Task.input`. Create the `Task` for an auto-filed document with a status of `completed`, so it doesn't appear in work queues but still has the same record as the documents people review. You can also create a `Provenance` that links the filed document to the bot and to the extractor's raw output. For example, `$aws-textract` saves the raw Textract output as a `Media` resource whose `subject` is the document.

Avoid logging demographics to the console from a bot, since bot logs are stored with each execution.

## Tune the cutoffs

The goal is for auto-filed documents to almost never be wrong. To choose cutoffs:

1. **Collect a labeled sample.** Gather at least 300 documents that represent your senders, document types, and scan quality, with the correct patient for each confirmed by a person. Over time, resolved suggest and triage `Task`s give you more.
2. **Run in shadow mode first.** Make the decision for each document, but send everything to review. Compare what the bot would have done with what reviewers did.
3. **Set cutoffs from the errors.** For each field, compare the confidence of values that were read correctly with values that weren't, and set the auto-file cutoff above where errors occur. Raise cutoffs until there are no wrong auto-filings in the sample. Then look at how many documents still auto-file.
4. **Know what the sample shows.** If there are no wrong filings among `n` auto-filed documents, you can be 95% confident the true error rate is below about `3 / n`. With 300 auto-filed documents, that's about 1%. You need more data to show a lower rate.
5. **Keep checking.** Spot-check a random sample of auto-filed documents on a regular schedule. Tune again when you add senders or document templates, or when the extraction model changes. Error rates can differ a lot between senders, so consider separate cutoffs for your highest-volume senders.

## Example

The following bot handles a `DocumentReference` for an inbound fax. It extracts demographics with Textract Queries, calls `$match` with `onlyCertainMatches: true`, and routes the document to auto-file, suggest, or triage. It uses the [`queries` option of `$aws-textract`](/docs/ai/aws#queries), but the same approach works with any extraction tool that reports a confidence for each value.

The cutoffs are placeholders to replace with values from your own testing, the MRN system is an example, and the date parsing assumes U.S. dates. Adapt all three to your documents. `$aws-textract` waits for Textract to finish, which can take a while for long documents, so give the bot enough time to run.

{{< code-example file="packages/examples/src/fhir-datastore/patient-deduplication/matching-extracted-data.ts" language="ts" blocks="setup" >}}

The handler extracts, matches, and decides. If the bot runs from a `Subscription` on `DocumentReference`, it runs again when it sets the `subject`, so it skips documents that are already filed.

{{< code-example file="packages/examples/src/fhir-datastore/patient-deduplication/matching-extracted-data.ts" language="ts" blocks="handler" >}}

Extraction follows each `QUERY` block's `ANSWER` relationships to its `QUERY_RESULT` blocks, keeps the highest-confidence answer, normalizes it, and drops placeholders and values that can't be parsed. Only values above their use cutoff are sent to `$match`:

{{< code-example file="packages/examples/src/fhir-datastore/patient-deduplication/matching-extracted-data.ts" language="ts" blocks="extract" >}}

An MRN-only match (combination 22) is only filed automatically if the name and birth date on the document agree with the matched patient:

{{< code-example file="packages/examples/src/fhir-datastore/patient-deduplication/matching-extracted-data.ts" language="ts" blocks="crossCheck" >}}

Every outcome creates a `Task` that records what was extracted:

{{< code-example file="packages/examples/src/fhir-datastore/patient-deduplication/matching-extracted-data.ts" language="ts" blocks="createTask" >}}

## See also

- [Patient $match](/docs/api/fhir/operations/patient-match)
- [AWS Textract/Comprehend](/docs/ai/aws)
- [Medplum $ai Operation](/docs/ai/ai-operation)
- [Matching](/docs/fhir-datastore/patient-deduplication/matching)
