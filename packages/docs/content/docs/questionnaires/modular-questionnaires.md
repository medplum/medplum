---
title: Modular and Composite Questionnaires
description: Reuse questionnaire sections, combine them into a complete form, and understand Medplum's current assembly support.
---

A clinic might use the same visit questions across several intake forms, then add a section specific to each service. Maintaining the shared questions once makes changes easier to review and keeps the forms consistent. A **composite questionnaire** brings those reusable pieces together into the form a patient or practitioner completes.

Combine reusable definitions before publishing a complete `Questionnaire`. On servers that advertise `$assemble`, Medplum can resolve SDC modules for you; application code can also combine a small set of known definitions. Medplum stores that definition, and `QuestionnaireForm` renders its questions and collects a single `QuestionnaireResponse`.

This guide follows assembly, review, publication, and response processing. It also includes a small manual composition example for two known modules. Start with [Modeling Questionnaires and Responses](/docs/questionnaires/questionnaires-and-responses) for item types and basic conditions.

## Choose between groups, modules, and separate forms

The word "nested" often describes the appearance of a form. Decide separately how its content is maintained and how responses should be saved.

| Need                                                                | Approach                                                               | Result                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Organize questions into sections or show a follow-up conditionally  | Nested `item` groups and `enableWhen` within one Questionnaire         | One definition with its questions inline                   |
| Maintain shared content independently and reuse it in several forms | Compose reusable modules before publishing each complete Questionnaire | One complete definition and one response per assigned form |
| Assign assessments that need separate completion or review          | Keep separate Questionnaires; coordinate them in the visit workflow    | Separate responses with their own lifecycles               |

A module can contain nested groups, and the complete form can preserve them. The difference is **reuse during authoring**: a nested group already contains its questions, while modular authoring lets several forms draw from the same maintained source. For coordinating separate forms, see [Visit Templates and the SOAP Approach](/docs/charting/visit-templates).

## Follow the composition flow

Compose and review the definition before assigning it to a respondent:

```mermaid
flowchart TD
    A["Shared visit section"] --> C["Application combines,<br/>checks, and publishes<br/>one Questionnaire"]
    B["Clinic preparation section"] --> C
    C --> D["Complete the form<br/>and save one response"]
```

Keep the published definition available for its responses. When a module changes, review and publish a new complete form for new assignments. Existing assignments continue using their original definition when they reference its resource ID and that resource remains unchanged.

### What Medplum supports

Medplum's React renderer uses the complete Questionnaire's inline items. On servers that advertise it in their CapabilityStatement, [`$assemble`](/docs/api/fhir/operations/assemble) resolves locally stored SDC modules before rendering. It supports whole-questionnaire imports, prefixes, contained resources, and SDC metadata checks. Remote retrieval, `item.definition` generation, and individual item imports are outside the first release.

`QuestionnaireForm` does not expand module references or evaluate SDC `variable` declarations. Assembly preserves those declarations for compatible tools, but expressions depending on them need a compatible evaluator. The example below uses prefixes during assembly and basic `enableWhen` during rendering. Check [renderer compatibility](/docs/questionnaires/advanced-authoring#supported-features-and-imported-forms) for other features in your modules.

## Assemble SDC modules

This example collects a visit reason and contact names. It reuses one contact module twice, producing one response and two extracted `RelatedPerson` resources when both contacts are supplied.

```mermaid
flowchart LR
    V[Visit module] --> A[Assemble and review]
    C[Contact module, used twice] --> A
    A --> P[Publish one definition]
    P --> R[Assign, save, and resume one response]
    R --> E[Extract using the assigned definition]
```

### 1. Define and reference the modules

The contact module keeps its extraction annotation on a root **group inside the module**, an allowed location. Its contained template reads the answer from that group's response context, so it does not depend on runtime `linkIdPrefix` evaluation.

<details>
<summary>Visit and contact modules</summary>

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="modules" >}}

</details>

The root uses `display` placeholders to include the modules. Each surviving group declares its prefix. Medplum rejects prefix declarations on an imported Questionnaire root; use the parent or a group inside the module so the declaration keeps its intended scope. The second contact's condition belongs on its group because assembly removes the placeholder entirely.

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="include, root" >}}

The assembled contact questions have linkIds `primary.name` and `secondary.name`. Their template references become `#primary.contact-template` and `#secondary.contact-template`. The modules remain independently maintained source definitions.

### 2. Assemble, review, and publish

Store the pinned module versions, then call the instance operation for the root:

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="assemble" >}}

Review any returned warnings and correct validation problems before publishing. Assembly can return a definition with warnings when its final FHIR R4 check finds a conformance problem. Preview the complete Questionnaire with `QuestionnaireForm`, try both states of **Add another contact?**, save a draft, and verify extraction:

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="publish" >}}

The [complete example source](https://github.com/medplum/medplum/blob/main/packages/examples/src/questionnaires/assembled-questionnaires.ts) includes `storeDefinition`, which uses identifier-based conditional creation. Replace its example URLs and identifier system with values you own.

Source and assembly share the same canonical URL and business version, but have different storage IDs and identifiers. Sources declare `computable`; the output also declares `executable`. Publish **one reviewed build per root URL/version**. A changed module requires a new module version and a new root version before another assembly is published. Keep existing published definitions unchanged.

### 3. Assign, save, and reopen the complete form

Use the published definition's ID with the [assignment and save helpers](/docs/questionnaires/saving-and-resuming). Load that Questionnaire and pass it, together with the assigned response, to `QuestionnaireForm`. The callbacks contain one response spanning the modules.

The form initializer prefers the canonical URL, so save with the existing `saveResponse` helper. It restores the assignment's `Questionnaire/{id}` reference, subject, and concurrency metadata. Reopen using the saved assignment rather than looking up the newest canonical:

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="reopen" >}}

### 4. Extract with the assigned definition

After validating completion and saving the response as `completed`, pass its matching assembled Questionnaire explicitly:

{{< code-example file="packages/examples/src/questionnaires/assembled-questionnaires.ts" language="ts" blocks="extract" >}}

`$extract` returns a Bundle for a separate review and persistence step. Automatic canonical lookup cannot choose between the source and assembly when they share a URL/version, and returns an ambiguity error. Passing the assigned definition also keeps older responses aligned with their original extraction rules.

## Build a visit-preparation form in application code

The example uses two small, known modules:

- **Shared visit section:** asks what the patient would like to discuss.
- **Clinic preparation section:** asks whether the patient would like help preparing, then shows a follow-up when they answer yes.

Both are ordinary FHIR R4 Questionnaire definitions. We keep them in source code so their versions can be reviewed together. The composition function copies their item trees into a new definition. It is specific to these modules; importing arbitrary SDC forms requires the additional handling described [below](#using-sdc-modular-forms).

### 1. Define the reusable content

Save the following imports and definitions in `modular-questionnaires.ts`. Each module owns a distinct set of `linkId` values: `basics` and `basics-*` for the shared content, `clinic` and `clinic-*` for the clinic content. The condition refers to a question within its own module.

<details>
<summary>Two reusable Questionnaire definitions</summary>

{{< code-example file="packages/examples/src/questionnaires/modular-questionnaires.ts" language="ts" blocks="imports, modules" >}}

</details>

The module URLs identify the source definitions. This example uses the imported constants directly, so it performs no canonical URL lookup. Replace the example URLs with ones you control if you publish these modules.

### 2. Combine the modules into one definition

Add this function and its duplicate-ID check to the same file:

{{< code-example file="packages/examples/src/questionnaires/modular-questionnaires.ts" language="ts" blocks="compose" >}}

<details>
<summary>Check linkIds across every group</summary>

{{< code-example file="packages/examples/src/questionnaires/modular-questionnaires.ts" language="ts" blocks="checkIds" >}}

</details>

The result has two top-level groups. Copying each entire item tree preserves its nested questions and `enableWhen` references. `deepClone` keeps edits to the composed form from changing the source modules. The ID check rejects collisions across the entire result, including within nested groups.

This function deliberately selects only the items from the two definitions above. Its output sets its own title, status, subject type, and version. If you add root-level extensions, contained resources, profiles, or other dependencies to a module, update the composition process to handle them before using that module. Copying `item` alone would leave those dependencies behind.

### 3. Try the complete form

In an existing [Medplum React application](/docs/react), save this as `composite-preview.tsx` beside the definition file. Render `<CompositePreview />` inside your Medplum and Mantine providers:

{{< code-example file="packages/examples/src/questionnaires/composite-preview.tsx" language="tsx" blocks="preview" >}}

Try the following:

1. Enter "Discuss my upcoming visit" in **What would you like to discuss?**
2. Select **Would you like help preparing for your visit?** The question **What help would be useful?** appears.
3. Enter "Instructions for joining the video visit" and submit. Expand **Submitted response** to see the answers under both `basics` and `clinic` groups.
4. Clear the help checkbox and submit again. The follow-up question is hidden and its answer is omitted from the submitted response.

The preview keeps the definition and response in browser memory. Submission produces one response to the complete form; it does not produce a response for each module. The next step connects the definition to storage.

### 4. Publish and assign the complete form

After reviewing the form, add this helper to `modular-questionnaires.ts` and call `await publishVisitPreparation(medplum)` from your application's setup workflow:

{{< code-example file="packages/examples/src/questionnaires/modular-questionnaires.ts" language="ts" blocks="publish" >}}

Keep the returned Questionnaire ID in configuration. This identifier-based conditional create makes a retry reuse the existing definition. Replace the identifier system with one owned by your application. The helper derives the identifier from the composed Questionnaire's `version`. Bump that version for each new published revision; keeping it unchanged returns the previous definition even if the code has changed.

The final definition uses the resource-ID strategy from [Saving and Resuming Responses](/docs/questionnaires/saving-and-resuming): load the stored Questionnaire by ID and assign a response that points to `Questionnaire/{id}`. This manual example intentionally gives its composed definition no canonical `url`; the source module URLs identify the modules only. `$assemble` output keeps its root canonical URL/version, as shown above. Keep a published resource unchanged while responses depend on it.

Continue with that guide for assignment identifiers, subject and encounter context, saving drafts, completion validation, and resuming the same response. Apply those steps to the complete definition returned here.

## Keep revisions and processing together

Treat the composed form as a release of a particular set of module versions. Record that set in source control or your publishing configuration. An update to a source module should lead to a reviewed release, with a new complete Questionnaire resource, rather than changing the form beneath an existing response.

Before publishing a revised form:

- Check all `linkId` values for uniqueness and confirm every `enableWhen.question` still identifies the intended question. Prefixing IDs during composition also requires updating references and any expressions that use them; this example authors distinct IDs in advance.
- Test conditions, calculations, and prefilled answers against the complete response structure. Adding or removing a wrapper group changes paths used by FHIRPath expressions and processing code.
- Keep extraction or Bot logic aligned with the final definition. The manual visit-preparation example collects answers only. Add and test extraction templates if you use `$extract`; when following this resource-ID strategy, supply the loaded Questionnaire explicitly to that operation. Its automatic lookup uses `Questionnaire.url`.
- Verify that a saved response reopens against its original complete definition after you publish a newer revision.

See [Parsing Questionnaire Responses](/docs/questionnaires/parsing-questionnaire-responses) for choosing template extraction or a Bot and handling downstream writes. Form submission alone does not run that processing.

## Using SDC modular forms

For interoperability with other form-authoring tools, [SDC Modular Forms](https://hl7.org/fhir/uv/sdc/STU4/en/modular.html) describes referencing a child Questionnaire from a parent `display` item with `subQuestionnaire`. An assembler replaces that placeholder with the child's items before population and rendering. Version-specific references keep the selected content predictable.

An SDC assembler also handles dependencies such as contained resources, extension propagation, expression context, and ID collisions. The small composition function above implements the needs of its two known modules; it does not implement the SDC assembly algorithm or claim conformance to its Modular Questionnaire profile.

If your authoring tool produces SDC modular definitions, check their features against the [supported assembly subset](/docs/api/fhir/operations/assemble#supported-assembly-rules), then inspect and test the complete output with Medplum's renderer. Successful assembly still needs the feature compatibility checks in [Advanced Questionnaire Authoring](/docs/questionnaires/advanced-authoring#supported-features-and-imported-forms).
