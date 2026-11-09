## Usage

**This resource is an _event_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Event](https://www.hl7.org/fhir/workflow.html#event).

This resource applies to various circumstances where there is a concern about an existing or proposed set of clinical activity. The issue could relate to single, proposed, or multiple actions. It does not apply to technical issues (e.g. lack of user permissions) but could relate to violation of patient consent limitations. Examples include:

- Drug-drug interactions
- Inappropriate therapy (wrong dose, frequency, body site)
- Duplicate therapy

This resource represents a specific instance of a potential issue for a particular patient. It is **not** intended to represent general patient-independent knowledge. This resource is also **not** intended to be used in defining general prohibitions on actions such as "No NSAIDs", "No solid oral dose forms" or "No MRIs - metallic tattoos". These guidelines can be captured using the [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance), and/or [Flag](/docs/api/fhir/resources/flag) resources. Similarly, this resource is not to be used to capture clinical facts that may imply contraindications such as pregnancy, breast feeding, patient preferences, past procedures, etc. These would be represented using [Condition](/docs/api/fhir/resources/condition), [Procedure](/docs/api/fhir/resources/procedure) or other resources.

## Relationships

This resource only applies to documenting a risk associated with a specific planned or ongoing action, or the lack of an action which should be planned - not a general propensity to risk. The latter would be handled using [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance) for substance-specific issues or [Flag](/docs/api/fhir/resources/flag) for other types of issues. In addition, the resource represents patient-specific and time-bound risk manifestations, not generic knowledge statements about risks that can exist.

This resource is limited to clinical issues associated with a proposed or ongoing action. It does not cover technical issues such as lack of permission, duplicate identifiers, insufficient data, and other business rule violations. Technical issues are conveyed using the [OperationOutcome](/docs/api/fhir/resources/operationoutcome) resource. It is possible to have both [OperationOutcome](/docs/api/fhir/resources/operationoutcome) and `DetectedIssue` together, where the [OperationOutcome](/docs/api/fhir/resources/operationoutcome) might indicate that a requested action was rejected due to a clinical issue and the [DetectedIssue](/docs/api/fhir/resources/detectedissue) provides the details of the issue.

## Background and Context

Detected issues are typically identified by decision support systems. However, they may also be captured directly by clinicians. The latter typically happens for one of two reasons:

1.  A clinician wishes to communicate an issue to another clinician whose responsibility would be to resolve it (e.g. a pharmacist identifying an issue with a prescription prior to putting it on hold)
2.  A clinician wishes to pre-emptively identify that an issue is known and is being managed (to avoid red flags being raised as part of downstream workflow); e.g. Submitting a new order and including a link to a "duplicate therapy" issue with mitigation indicating that the therapy is not considered to be duplicate.

Decision-support generated issues can result from calling a decision-support engine directly (e.g. via a custom [OperationDefinition](/docs/api/fhir/resources/operationdefinition)) or as part of an attempt to perform some other function (creating an order, submitting an insurance claim, capturing a medication list). When the issues are generated as a by-product of performing some other sort of action, they may be included in the "response" to the requested action in the same manner as an [OperationOutcome](/docs/api/fhir/resources/operationoutcome). In fact, both may be present - the [OperationOutcome](/docs/api/fhir/resources/operationoutcome) indicating that there was a warning or error associated with the request and a **DetectedIssue** providing the clinical details. (The [OperationOutcome](/docs/api/fhir/resources/operationoutcome) could point to the **DetectedIssue** via an extension.)

In those circumstances where requested operations are rejected as a result of a detected issue, the workflow may support allowing the operation to be re-tried, provided that the identified issue is included as part of the submission (possibly also including a mitigation). In doing so, the sender acknowledges the issue and takes responsibility for it, thus allowing the requested operation to proceed. See [Linking to Detected Issues](https://www.hl7.org/fhir/#linking) for guidance on how a **DetectedIssue** instance might be included as part of another operation.

Systems that require such workflows should document expected behavior as part of their [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) declarations.
