---
id: seeding-from-an-existing-ehr
title: Seeding a Formulary from an Existing EHR
sidebar_label: Seeding from an Existing EHR
keywords:
  - formulary
  - migration
  - medication
  - rxnorm
  - ndc
docs_tags:
  - medication
  - migration
---

When you move to Medplum from another EHR, your clinicians already have a working set of medications: the ones they order every day. This guide shows how to turn that order history into a formulary of [`MedicationKnowledge`](/docs/api/fhir/resources/medicationknowledge) resources that you can load repeatedly, search from your application, and order from.

It builds on [Modeling a Formulary](/docs/medications/formulary), which describes the resource itself. Read that guide first.

The steps are:

1. [Export the order history](#export-the-order-history)
2. [Map each drug to a prescribable RxNorm code](#map-each-drug-to-a-prescribable-rxnorm-code)
3. [Keep the NDC alongside RxNorm](#keep-the-ndc-alongside-rxnorm)
4. [Load the formulary so reruns are safe](#load-the-formulary-so-reruns-are-safe)
5. [Search the formulary from your application](#search-the-formulary-from-your-application)
6. [Create a MedicationRequest from an entry](#create-a-medicationrequest-from-an-entry)
7. [Check every entry with your e-prescribing vendor](#check-every-entry-with-your-e-prescribing-vendor)

## Before you start

A formulary here means your organization's own list of medications that clinicians choose from. It is not a payer or pharmacy benefit formulary. It also does not, by itself, stop a clinician from prescribing a different drug in your e-prescribing vendor's screen.

Confirm that RxNorm is available in the project you will load into. On Medplum's hosted service, RxNorm comes from a shared terminology project that Medplum [links](/docs/access/projects#project-linking) to your project. The link is per project, so a new staging project does not have it until Medplum adds it. To check, run a [`CodeSystem/$lookup`](/docs/api/fhir/operations/codesystem-lookup) for a long-established RxNorm code. Every project has a placeholder RxNorm `CodeSystem` with no codes in it, so a `404 Not Found` means the terminology your project can see does not contain the code. On the hosted service, either RxNorm is not linked or the linked release does not include that code. On a self-hosted server, either RxNorm has not been imported or the imported release does not include it. If an established code returns `404` on the hosted service, contact Medplum support before you map anything. If the lookup fails with `403 Forbidden` or a `CodeSystem ... not found` error instead, check the system URL you sent and that your client's access policy allows it to search `CodeSystem` resources.

RxNorm is released in versions. If the lookup works for an established code but returns `404 Not Found` for a newer code that [RxNav](https://mor.nlm.nih.gov/RxNav/) lists as active, your project's release may be older than the drug. A project's release can be months behind the current NLM release, and `$lookup` does not report which release it is. On the hosted service, ask Medplum support which release your project has, and plan how clinicians will order drugs released after it.

## Export the order history

Start from what your clinicians ordered in the existing EHR over a recent period, and remove the duplicates. This gives you a list that already matches how the practice prescribes. You can also start from a list that your clinicians write by hand. Either way, a clinician decides what stays in the formulary. How often a drug was ordered tells you what to review first. It does not tell you whether the drug belongs.

Expect the export to mix several kinds of row:

- Rows with an RxNorm code, an NDC, or both
- Rows with only a drug name, with strength and dose form in separate fields
- Rows that carry only the previous e-prescribing vendor's own drug identifier
- Rows for over-the-counter or patient-reported medications that were never prescribed

Keep the original code and text from every row. You will need them to trace each formulary entry back to its source. See [Converting Data to FHIR](/docs/migration/convert-to-fhir) and [Governing Data Mappings](/docs/migration/mapping-governance) for how to record mapping decisions. Decide separately what to do with over-the-counter and patient-reported rows, which are not always something your clinicians order.

## Map each drug to a prescribable RxNorm code

Map each distinct drug to one RxNorm concept that names an ingredient, a strength, and a dose form. These are the term types that [Modeling a Formulary](/docs/medications/formulary#medication-code) recommends for formulary entries:

| Term type | Meaning |
| --- | --- |
| `SCD` | Semantic Clinical Drug: generic ingredient, strength, and dose form |
| `SBD` | Semantic Branded Drug: the same, for one brand |
| `GPCK` | Generic Pack |
| `BPCK` | Branded Pack |

Order history often carries codes at other levels. An ingredient code (`IN`, `PIN`, `MIN`) or a brand name code (`BN`) does not say which strength or dose form the clinician meant, so it cannot identify a product to prescribe. Replace these with the `SCD`, `SBD`, `GPCK`, or `BPCK` the clinician ordered. The [RxNorm term type table](/docs/medications/medication-codes#rxnorm) describes the other levels.

Do not build the formulary around NDCs. An NDC identifies one package from one labeler, so a single prescribable drug has many of them. A formulary keyed on NDC, or on drug plus instructions, grows into many near-identical entries for one drug.

{{< warning title="Do not derive codes from drug names" >}}

Never choose an RxNorm code from the display name alone. Look each drug up in [RxNav](https://mor.nlm.nih.gov/RxNav/) or in your project's terminology, and have a person review every mapping. A code from an old export may also have been retired since it was recorded, so check that each code still resolves.

{{< /warning >}}

Medplum's terminology operations do most of this work. Start by saving a `ValueSet` that contains only the four term types above. [Filtering Large Code Systems](/docs/terminology/filtering-large-code-systems) explains how property filters work. In the RxNorm that Medplum's hosted service provides, the property code is lowercase `tty`. On a self-hosted server, the properties depend on how RxNorm was imported, so check them with `$lookup` first.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="prescribableValueSet" >}}

Test the `ValueSet` against one code you know before you trust it. A filter on a property name that the `CodeSystem` does not define, such as `TTY`, matches nothing and raises no error.

For a row that has only a drug name, use [`ValueSet/$expand`](/docs/api/fhir/operations/valueset-expand) with a `filter` to list candidate codes at the right level. A person then picks the one the clinician meant. The candidates for one name can include combination products and several brands.

For a filter of at least three characters, it returns names that contain every word you send, ignoring case, anywhere in the name. A partial word also matches, so `sinopril` returns both lisinopril and fosinopril. The filter accepts up to 10 words, and the closest matches come first. It does not understand the shorthand that order histories often use, so clean up the source text first:

- Separate the number from the unit: `10 MG`, not `10mg`.
- Write out abbreviations the way RxNorm spells them: `hydrochloride`, not `HCl`.
- Use the ingredient or brand name, not a synonym such as `APAP`. On a `ValueSet` filtered by a property, like this one, the filter matches the main name of each code and not its synonyms, so `APAP 325` finds only brands whose name happens to contain those letters.
- Include the strength and dose form. Results stop at `count`, which is 10 by default when you send a filter, so a search on the ingredient alone can fill the page before it reaches the strength you want.

A filter that returns nothing does not mean the drug has no code. Check the text before you treat the row as unmapped.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="findCandidates" >}}

To check every mapped code, call [`ValueSet/$validate-code`](/docs/api/fhir/operations/valueset-validate-code) against the same `ValueSet`. It returns `false` for an ingredient, a brand name, or a code that does not exist. Do not load a row that fails. Hold it for review.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="validateMapping" >}}

Validate against your own `ValueSet`, not only the US Core medication value set (Medication Clinical Drug). That value set also accepts group and component codes, such as `lisinopril 10 MG` with no dose form, so a code can pass it and still not identify a product to prescribe.

To see why a code fails, call [`CodeSystem/$lookup`](/docs/api/fhir/operations/codesystem-lookup) and read its `tty` properties. The response can include more than one `tty` for a code, such as `SBD` together with the synonym types `SY` and `PSN`.

## Keep the NDC alongside RxNorm

When a source row has an NDC, keep it as a second coding in `MedicationKnowledge.code`.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="formularyEntry" >}}

There are three reasons to keep it:

- Some products have an NDC and no RxNorm code. Kits and supplies are common examples. These entries carry only the NDC of the finished package.
- One RxNorm code can match several packages. Where package size matters, as with vials, kits, and starter packs, the NDC records which package you mean. Confirm that the NDC identifies that package before you store it.
- Some e-prescribing integrations look a drug up by NDC before they try RxNorm.

When an entry has both codes, check that the NDC belongs to the RxNorm code. On the hosted service, `CodeSystem/$lookup` on the RxNorm code returns the NDCs that your project's RxNorm release links to it, as `NDC` properties. The list covers that release only. An NDC that is missing from it may be newer than the release, so treat it as unconfirmed and check it in [RxNav](https://mor.nlm.nih.gov/RxNav/) before you reject the row.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="checkNdc" >}}

Do not use `CodeSystem/$validate-code` to check an NDC unless your project has a `CodeSystem` with the NDC codes in it. If no `CodeSystem` with that URL exists, the operation can only compare the system URL, so it returns `true` for any code you send with that URL.

RxNorm lists NDCs as 11 digits with no hyphens, which is the form in the example. Compare in that form. If your e-prescribing vendor expects another format, convert after the check and store the vendor's format consistently.

Keep stored NDCs current. An integration that tries the NDC first can fail the order on a discontinued NDC even when the entry also has a valid RxNorm code.

Set `code.text` to the name your clinicians should see, and set `status` on every entry.

## Load the formulary so reruns are safe

You will load the formulary more than once: into staging, again after each round of clinician review, and then into production. A rerun must update the entries that exist and must not create duplicates.

`MedicationKnowledge` has no `identifier` element in FHIR R4, so you cannot key a conditional write on an identifier as you would for a `Patient`. Key it on `code`.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="upsertEntry" >}}

The query must match at most one entry. If it matches more than one, the server rejects the write: a single conditional update returns `412 Precondition Failed`, and the same entry inside a batch returns `400 Bad Request` while the other entries still run. Choose the key by how the entry is coded:

| Entry | Key on |
| --- | --- |
| One entry per `SCD`, `SBD`, or pack code | The RxNorm code |
| Several entries for different packages of the same drug | The NDC |
| A product with no RxNorm code | The NDC |

If any entry for a drug is keyed on an NDC, key every entry for that drug on its NDC. A row keyed on the shared RxNorm code matches all of them and fails.

The key must be one of the entry's own codings, written exactly the same way. If no stored entry matches the key, Medplum creates a new entry, and that entry does not match the key on the next run either. A key with a typo, such as a system URL with an extra `/`, therefore creates one more entry on every run, and nothing reports an error. Build each key from the entry's coding, as the examples here do, rather than writing it separately.

The `code` search matches any coding on an entry. If you add a group-level code such as `SCDG` to several entries, do not key on it. Each row in a load must also resolve to a different entry, so remove duplicate rows from the seed file before you send it. Two rows that key on different codings of the same stored entry both write to it, and the later row wins. Two rows with the same key are also a mistake: on a first load the second row fails with `400 Bad Request`, and on later loads the later row wins. Run one load at a time in a project, so that two loads cannot overwrite each other or collide on a new entry with `400 Bad Request`.

For the full load, send the entries as a `batch` Bundle of conditional updates. This example uses `formularyKey` from the example above.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="upsertBundle" >}}

Then read the response for every entry. In a batch, one entry can fail while the rest succeed.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="loadBundle" >}}

After each run, count the entries that your seed file loaded with `_summary=count`, and compare the total with the number of rows. If the project holds other `MedicationKnowledge` resources, add a search that selects only yours. A higher total usually means a key did not match its entry. An equal total is not proof. On a rerun, also look for rows that returned `201 Created` when you expected `200 OK`: each one is a new entry, and its `location` tells you which. Count retired entries too, since they stay stored.

Medplum checks coded values such as `status` against their allowed codes only when your project has the `validate-terminology` feature. Without it, a row with a misspelled `status` can load without an error and then drop out of searches for `status=active`. Check `status` in your seed file before you load it.

Because each write is conditional, running the load again does not create duplicates. A rerun writes the rows that were never written. Rows that failed validation or matched more than one entry fail again until you correct them.

A rerun also replaces every entry that is still in the Bundle with the Bundle's version. If someone has since edited an entry in Medplum, or retired it, the rerun overwrites that change. Keep the seed file as the one place where entries are edited. To retire a drug, send its entry with `status` `inactive`. This removes it from a search for active entries and keeps its details on record. Orders already saved are not affected, because each order carries its own copy of the code. An entry that you leave out of the Bundle stays as it was last stored, so an active entry stays active.

Keep the key of each row the same from one run to the next. If you correct the code that a row is keyed on, the next run creates a second entry and leaves the first one active. Retire the old entry in the same run.

The example above is synchronous, and each row in it counts against your [FHIR interaction quota](/docs/rate-limits#fhir-interaction-load-rate-limit). Inside a batch, a conditional update costs 120 points when it updates an entry and 140 when it creates one. Once a synchronous batch uses up the quota for that minute, its remaining rows return `429 Too Many Requests`, while the response as a whole still returns `200 OK`. A first load of 350 to 400 entries can reach that point at the default quota. Do not send the whole Bundle again, because the rows that already succeeded would use the quota a second time. Wait for the quota to reset, then send only the rows that returned `429`, in smaller batches.

For anything larger than a small test load, use an [asynchronous batch](/docs/fhir-datastore/processing-async-bundles). The writes inside it do not count against the quota. It needs the `async-batch` feature on your project and a separate submit and poll flow. [FHIR Batch Requests](/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions) explains why a `batch` is the right Bundle type for an import.

The client that runs the load needs an [`AccessPolicy`](/docs/access/access-policies) that allows it to search, create, and update `MedicationKnowledge`. An asynchronous batch also needs to create and read both `AsyncJob` and `Binary`, because the job saves its results to a `Binary` as your client. Without `Binary` create, the job fails with `Forbidden`. To run the terminology checks above, the client also needs to read and search `CodeSystem` and `ValueSet`, and to create and update `ValueSet` if it saves the term type `ValueSet` itself.

## Search the formulary from your application

`MedicationKnowledge` has no `name` search parameter. To search by drug name, use the `:text` modifier on `code`. It matches `code.text` and the `display` of each coding, ignores case, and matches anywhere in the string.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="searchEntries" >}}

Filter on `status=active` so that retired entries do not appear.

In a React application, [`ResourceInput`](/docs/react/choosing-components) searches `MedicationKnowledge` by `_id` unless you tell it otherwise. With `@medplum/react` 5.2.15 or later, pass `searchParam="code:text"` and `searchCriteria={{ status: 'active' }}`.

If you only need a list of codes to pick from, keep a `ValueSet` of your formulary codes and bind a `CodeableConceptInput` to it. See [Binding an input to a set of codes](/docs/terminology/medplum-terminology-services#binding-an-input-to-a-set-of-codes). Write the `display` of each code into the `ValueSet`. By default, the search on a `ValueSet` that lists its codes matches only the displays written in it, not the names stored in RxNorm, so a code without one cannot be found by name. Search `MedicationKnowledge` when you need the dose form, classification, or other details stored on the entry.

Show the dose form and route next to the name. Drug names alone do not always tell an oral product from a topical one. Store them on the entry in `doseForm` and `intendedRoute`, as described in [Medication Characteristics](/docs/medications/formulary#medication-characteristics).

## Create a MedicationRequest from an entry

A [`MedicationRequest`](/docs/api/fhir/resources/medicationrequest) is linked to a formulary entry by code. In FHIR R4, `MedicationRequest.medicationReference` can only point to a `Medication`, so it cannot reference a `MedicationKnowledge`. A request that saves successfully is not proof that it is valid FHIR R4, because the server may accept such a reference. Copy the codings and text of the entry the clinician selected into `medicationCodeableConcept`.

{{< code-example file="packages/examples/src/medications/formulary-seeding.ts" language="ts" blocks="requestFromEntry" >}}

Copying the code works for a product that the code fully identifies. For a compounded medication, FHIR R4 expects the request to reference a `Medication` that describes what is prepared. See [Compounded Medications](/docs/medications/formulary#compounded-medications) for how to model the formulary entry.

The prescriber then sets the dosage, quantity, refills, and substitution on the request. See [Representing Prescriptions and Medication Orders](/docs/medications/representing-prescriptions-and-medication-orders).

## Check every entry with your e-prescribing vendor

Your e-prescribing vendor resolves each order against its own drug database. A code that is valid in RxNorm can still match no product there, or several. A match in the vendor's own search screen does not show which product your application will order, because the search and the order can resolve a code differently. Before go-live, check every formulary entry through the prescribing workflow you will go live with, using the same codes your application will send. Agree with the vendor how to run the check: in its test environment with test patients, or in a way that stops before a prescription is transmitted. Then sort the results:

| Result | What to do |
| --- | --- |
| One product, and it is the one you meant | Nothing |
| More than one product | Add the identifier your integration uses to tell products apart, often the NDC of the package you mean. Then check in the prescribing workflow that the order selects that package |
| A different product from the one you meant | Correct the mapping |
| No product | Check the code and its term type. If the code is right, agree with the vendor how clinicians will order the drug, for example in the vendor's own prescribing screen. Some drugs that clinicians can prescribe return no product through a code lookup |

Treat an empty result as "not checked" until you have ruled out the other causes. In some integrations, a prescriber account that has not finished onboarding, or a failed lookup, returns an empty result where you would expect an error.

Read your vendor's API terms before you script this check. Some vendors do not allow automated or bulk calls and require each request to follow a user's action.

Two things sit outside the formulary and need their own plan:

- **Vendor setup.** Favorites, order sets, and saved prescription formats may have to be created with the vendor. See [Are favorites, order sets, or pediatric workflows needed?](/docs/decision-guides/e-prescribe#are-favorites-order-sets-or-pediatric-workflows-needed)
- **Open prescriptions.** Loading a formulary does not move pending refills or active prescriptions from the old system. See [How will prescribers transition from an existing e-Rx system?](/docs/decision-guides/e-prescribe#how-will-prescribers-transition-from-an-existing-e-rx-system)

## See Also

- [Modeling a Formulary](/docs/medications/formulary)
- [Medication Code Systems](/docs/medications/medication-codes)
- [Filtering Large Code Systems](/docs/terminology/filtering-large-code-systems)
- [Sequencing Your Migration](/docs/migration/migration-sequence)
- [E-Prescribe Decision Guide](/docs/decision-guides/e-prescribe)
