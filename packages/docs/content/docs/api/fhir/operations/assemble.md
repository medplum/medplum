---
title: Questionnaire $assemble
description: Combine locally stored Questionnaire modules into one complete definition before publishing.
---

`$assemble` combines a root Questionnaire and its reusable modules into one complete Questionnaire. It reads through the caller's access policy and returns a copy for review. It does not save the result or change the source definitions.

Check that the server's [CapabilityStatement](https://hl7.org/fhir/R4/capabilitystatement.html) advertises `assemble` for `Questionnaire` before using it. See [Modular and Composite Questionnaires](/docs/questionnaires/modular-questionnaires#assemble-sdc-modules) for the publishing and response workflow.

## Request

```http
POST [base]/Questionnaire/$assemble
POST [base]/Questionnaire/[id]/$assemble
```

At the type endpoint, supply one `questionnaire` parameter:

| Input | Representation |
| --- | --- |
| Inline definition | `resource` containing a Questionnaire |
| Canonical | `valueUri` containing `url` or `url\|version` |
| Stored resource | `valueReference.reference` containing `Questionnaire/{id}` |

For example:

```json
{
  "resourceType": "Parameters",
  "parameter": [{
    "name": "questionnaire",
    "valueUri": "https://example.org/Questionnaire/contact-intake|1"
  }]
}
```

You can also send an inline Questionnaire directly as the body. At the instance endpoint, the URL identifies the input and the body can be empty. If supplied, a parameter must identify the same resource; an inline definition must match the stored instance. Use the type endpoint to assemble modified inline content.

Canonical lookup searches local Questionnaires, with separate URL and business-version filters. An unversioned canonical must resolve to a single business version and produces a warning recommending a pinned version. If several resources share that URL and version, Medplum prefers a single source marked `computable` without `executable` in `cqf-knowledgeCapability`. Otherwise, supply an explicit resource reference or correct the ambiguous module references. Absolute canonical URLs do not trigger remote HTTP requests. Remote and history resource references are unsupported.

## Result

| Outcome | HTTP status and body |
| --- | --- |
| Clean success | `200`, bare Questionnaire |
| Success with warnings | `200`, Parameters with the Questionnaire in `return` and an OperationOutcome in `outcome` |
| Failure | Error status and OperationOutcome, without a successful Questionnaire result |

Missing `assemble-expectation` metadata produces a warning for an imported child or a root requiring assembly. Assembly continues only if all other assembly checks pass. This does not establish SDC conformance.

After assembly, validation reports duplicate `targetConstraint` keys and final FHIR R4 conformance problems as warnings, following SDC's operation guidance. Constraint keys must be unique across the Questionnaire, including separate groups. Both constraints remain in the output for author review; the warning identifies the duplicate's location. Correct these problems before publishing. Invalid input, unresolved modules, cycles, and other assembly failures still return errors.

The result keeps the root's canonical `url` and business `version`, removes its storage ID and revision metadata, adjusts `assemble-expectation`, and declares `executable` capability. `assembledFrom` records resolved descendant canonicals and their available business versions. Existing valid capability codes are retained. The modular input profile is removed; other profile declarations are retained and should be validated before publication.

Store source and assembled forms under separate IDs. Use one reviewed assembly per root URL/version, pin dependencies, and change the root version when releasing different content. Publishing several builds of one root version requires SDC `package-source` metadata and is outside this workflow. Automatic [`$extract`](/docs/api/fhir/operations/extract) lookup cannot distinguish source and assembled forms with the same URL/version and uses the first match; supply the loaded assembled definition explicitly.

## Supported assembly rules

A `subQuestionnaire` extension belongs on a `display` item. Assembly replaces that item with all child items, preserving their order, groups, conditions, and supported annotations. Put conditions and variable declarations on a containing group that survives assembly.

Medplum supports recursive whole-questionnaire imports, scoped `assembleContext` checks, SDC metadata compatibility and propagation, contained resources, and structural prefixes. For assembly-time `linkIdPrefix`, use a FHIRPath string literal such as `'primary.'` or inherited concatenation such as `%linkIdPrefix + 'name.'`. Prefixing updates the module's own linkIds, `enableWhen.question`, contained IDs, and typed references/canonicals starting with `#`. Variables and runtime expressions remain scoped as authored. `QuestionnaireForm` does not evaluate SDC `variable` declarations; see [renderer compatibility](/docs/questionnaires/advanced-authoring#supported-features-and-imported-forms).

Context checks run after imports have propagated their declarations, so sibling order does not change whether a dependency is available. Launch contexts are available throughout the assembled form; variables remain in their containing scope and descendants. A launch context and variable with the same name at the Questionnaire root fail assembly. A variable in a descendant group may shadow an ancestor's name. See [SDC expression scope and naming](https://hl7.org/fhir/uv/sdc/STU4/en/expressions.html).

When a module contains resources, the prefix plus each contained ID must contain 1 to 64 characters using only letters `A-Z` or `a-z`, digits, hyphens, or periods. For example, use `primary.` instead of `primary_`. Assembly reports the invalid final ID and its source module if these restrictions are violated.

**Medplum policy:** declare any `linkIdPrefix` for an imported module on its parent or on a group inside the module. A declaration on the imported Questionnaire root is rejected because moving it into the parent could change sibling prefixes. A prefix on the top-level Questionnaire being assembled is supported.

[Launch contexts](https://hl7.org/fhir/uv/sdc/STU4/en/StructureDefinition-sdc-questionnaire-launchContext.html) are combined by name code. Equivalent declarations are included once, retaining the first description and display text. Resource-type order does not matter. Conflicting coding systems, coding versions, allowed resource types, or multiplicity declarations fail assembly.

Cycles, duplicate final linkIds, dangling structural references, incompatible metadata or variables, adaptive children, and imported modifier extensions fail assembly. Child-root extraction extensions must move to allowed items, such as a root group inside the child. Work is bounded to 32 levels of item/import nesting, 10,000 visited items, 1,000 module occurrences, and 5 MiB of expanded input or output. Repeated inclusions count toward those limits. Canonical resolution is bounded to fewer than 1,000 matching resources.

Remote retrieval, `item.definition` generation, item-fragment imports, and other assembly-time expressions are outside this first release and return errors.

## Specification baseline

This implementation follows the whole-questionnaire algorithm in [SDC STU4 Modular Forms](https://hl7.org/fhir/uv/sdc/STU4/en/modular.html#modular-questionnaires) on FHIR R4. Two published discrepancies affect the operation contract:

- The [operation page](https://hl7.org/fhir/uv/sdc/STU4/en/OperationDefinition-Questionnaire-assemble.html) says to change `version`. Medplum follows the Modular Forms requirement to preserve URL/version, supported by [HL7's correction](https://github.com/HL7/sdc/commit/972f226c0523b6ea0419d419edb3c2e37dd9b461).
- The narrative names the successful output `response`. Medplum uses the formally defined parameter name `return`.
