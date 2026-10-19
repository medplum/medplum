---
title: Diagnostic Orders Decision Guide
sidebar_label: Diagnostic Orders
sidebar_position: 9
download_slug: diagnostic-orders
---

# Diagnostic Orders Decision Guide

Use this guide to choose how your application orders diagnostic services, receives results, and coordinates follow-up. Each decision connects your requirements to a data model, integration approach, and operational responsibility, with links to implementation details.

_Companion to [Labs and Imaging](/docs/labs-imaging), [Order Labs and Imaging](/docs/labs-imaging/ordering-labs-imaging), and [Results and Review](/docs/labs-imaging/results-and-review)._

The review queues and follow-up rules are application patterns to implement with Medplum resources. Confirm each facility's supported operations before committing to a workflow.

---

## Section 1: Use Case and Participants

### 1.1 Which diagnostic services are in scope?

- Laboratory tests sent to external labs
- Tests performed in your own facility or at the point of care
- Imaging studies performed externally or internally
- A combination

*Why it matters: laboratory workflows coordinate specimens; imaging workflows usually coordinate appointments and access to reports or images. An internal laboratory also needs catalog and laboratory operations design beyond sending orders.*

### 1.2 Which parts of the workflow will your application own?

- Ordering and receiving results
- Receiving and reviewing results ordered elsewhere
- Coordinating fulfillment of orders created elsewhere
- Performing tests and producing results

*Why it matters: a results-only application needs patient matching and review routing even when it has no original order. An ordering application also needs transmission, cancellation, and outstanding-order tracking.*

### 1.3 Who participates, and who is accountable?

Identify who can prepare and authorize orders, collect specimens or arrange appointments, resolve integration exceptions, review results, cover absent clinicians, and communicate with patients. Decide whether those responsibilities vary by organization, location, or service line.

*Why it matters: the ordering clinician, performing organization, result reviewer, and follow-up owner may be different people. Unassigned work needs an explicit fallback.*

### 1.4 Which systems are already involved?

List the performing labs and imaging facilities, existing interfaces, vendor accounts, scheduling systems, and image archives. For each, identify what it can send and receive: orders, acknowledgments, cancellations, status updates, structured results, documents, or image access.

*Why it matters: the application's workflow must reflect the capabilities of each connected facility. Connectivity to one laboratory does not establish imaging support or identical behavior across every facility.*

## Section 2: Approach-Defining Decisions

Choose the path that matches your application's responsibilities:

- **Ordering externally:** Cover all nine decisions; skip imaging details if you only order labs.
- **Receiving results only:** Start with connectivity (3.1), then matching, display, review, and access (3.6–3.9). Skip 3.2–3.5 unless you also coordinate fulfillment.
- **Performing tests internally:** Cover all nine decisions, including catalog ownership and specimen or appointment tracking. Separately scope the system that performs the tests.
- **Displaying diagnostic images:** Include the storage/viewer and context-synchronization choices in 3.7, whichever path you use.

| Decision | What your choice determines |
| --- | --- |
| [3.1 Integration path](#31-how-will-orders-and-results-cross-system-boundaries) | Interfaces, write authority, and integration operations |
| [3.2 Catalog and order grouping](#32-what-can-clinicians-order-and-who-maintains-the-menu) | Definitions, codes, order boundaries, and maintenance |
| [3.3 Order release](#33-what-must-happen-before-an-order-can-be-released) | Required information, authorization, and transmission |
| [3.4 Fulfillment](#34-how-will-the-patient-or-specimen-reach-the-performing-facility) | Specimens, appointments, and assigned work |
| [3.5 Changes and exceptions](#35-what-happens-when-an-order-changes-or-never-completes) | Replacement, cancellation, and recurring-order tracking |
| [3.6 Result matching](#36-how-will-incoming-results-find-the-correct-patient-and-order) | Identifiers, reconciliation, and exception queues |
| [3.7 Result formats and imaging](#37-what-result-detail-must-the-application-display-and-use) | Observations, documents, images, and viewer integration |
| [3.8 Review and follow-up](#38-what-closes-the-loop-after-results-arrive) | Ownership, escalation, and completion evidence |
| [3.9 Access and operations](#39-who-can-access-the-data-and-resolve-operational-failures) | Policies and responsibility for unresolved work |

## Section 3: Key Decisions

### 3.1 How will orders and results cross system boundaries?

Choose an integration path for each facility. Confirm ordering, acknowledgments, cancellations, status updates, and result delivery separately; capabilities vary by destination.

| Situation | Approach and downstream implications |
| --- | --- |
| Medplum Health Gorilla integration | Adopt its order profiles, send/receive Bots, and account requirements. Confirm facility coverage and assign integration exception ownership. See [Health Gorilla](/docs/integration/health-gorilla). |
| Direct lab or imaging interface | Own the HL7v2 or API mapping, identifiers, acknowledgments, corrections, and recovery in each supported direction. See [HL7 interfacing](/docs/integration/hl7-interfacing). |
| Internal testing | Create operational orders and results in your application; define which laboratory or imaging system owns performance and reporting. |
| Requisition or manual handoff | Track handoff and acceptance separately, with an owner to reconcile completion. A generated requisition does not establish acceptance. |
| Results only | Preserve source identifiers and support reports without local originating orders. Build patient matching and review routing (3.6–3.8). |

#### Do you need an on-site protocol bridge?

- **Local HL7/MLLP, ASTM, or DICOM equipment:** Use the [Medplum Agent](/docs/agent) for supported protocols. Your team operates the local host and connectivity, and implements workflow mapping and reconciliation. For imaging, follow the [DICOM channel setup](/docs/dicom/agent-dimse).
- **HTTPS API or DICOMweb source:** Connect directly without an Agent. Your integration still owns mapping, reconciliation, and recovery. See the [DICOMweb API](/docs/dicom/dicomweb-api) for image ingestion.

Name the authoritative system for the order, fulfillment status, and report, and define which updates may flow back.

### 3.2 What can clinicians order, and who maintains the menu?

First choose who owns the catalog, then decide how selections become patient-specific orders.

#### Who owns the catalog?

| Choice | Data model and maintenance implications |
| --- | --- |
| Performing lab's menu | Preserve its orderable codes and required questions; assign someone to maintain vendor changes. A standardized observation code alone may not identify an orderable test. |
| Internally maintained catalog | Define measurements with `ObservationDefinition`, specimen requirements with `SpecimenDefinition`, orderable services/panels with `PlanDefinition`, and procedures with `ActivityDefinition`. Your team owns those definitions. See [Diagnostic Catalog](/docs/careplans/diagnostic-catalog). |

If clinicians also need reusable order sets, keep those definitions separate from the patient-specific `ServiceRequest` instances they generate and assign an owner for changes.

#### How will selections become orders?

| Choice | Order structure |
| --- | --- |
| One orderable panel | Can be one requested service with multiple result observations. Follow the destination's panel definition. |
| Several independent services | Create separate `ServiceRequest` resources; group them with a shared `requisition` when appropriate. `basedOn` identifies a request being fulfilled, rather than an arbitrary selection group. |
| Health Gorilla ordering | Use its parent order and individual test `ServiceRequest` structure, linked through `basedOn`. Some labs require separate requisitions. See [Health Gorilla order structure](/docs/integration/health-gorilla/sending-orders#order-structure). |

Preserve source codes and use verified terminology mappings. Flag unresolved mappings for review.

### 3.3 What must happen before an order can be released?

**Questions:** Can staff prepare orders for a clinician? Are orders placed within an encounter or independently? Which demographics, indications, Ask on Order Entry (AOE) answers, billing details, and supporting documents does the destination require?

Represent the request with `ServiceRequest`, including patient, requester, service, and performer when known. Link the encounter when applicable. If preparation precedes authorization, use `status = draft` with `intent = order`, and define who can release it.

| Requirement | Design consequence |
| --- | --- |
| Staff prepare; clinician authorizes | Give those roles distinct permissions and actions. Define the authorization record and who can trigger transmission. |
| Test-specific AOE | Capture the destination's required answers. The Health Gorilla pattern stores `QuestionnaireResponse` resources in the individual test's `supportingInfo`. |
| Insurance, patient, or account billing | Capture the billing route and required supporting information before sending. For Health Gorilla, check practitioner and practice lab account requirements. |
| Imaging requires authorization or scheduling coordination | Assign that work explicitly and decide whether it must finish before transmission, scheduling, or performance. |

Track saving, authorization, and transmission separately. Follow the chosen integration's lifecycle rather than treating a saved order as successfully sent.

References: [Order Labs and Imaging](/docs/labs-imaging/ordering-labs-imaging), [Health Gorilla Sending Orders](/docs/integration/health-gorilla/sending-orders).

### 3.4 How will the patient or specimen reach the performing facility?

**Questions:** Who collects the specimen? Who schedules imaging? Are home kits involved? How will staff identify missing collections, missed appointments, rejected specimens, or incomplete kits?

| Situation | Recommended approach |
| --- | --- |
| Specimen collected on site | Record the actual `Specimen`, collection details, and order linkage. Include requisition and label handling in the workflow. |
| Collection at an external draw station | Give the patient the destination and preparation instructions; define what evidence confirms collection and who follows up when it is missing. |
| Home collection | Track kit fulfillment, return, receipt, and rejection as operational work. A shipped kit does not establish specimen collection or completed testing. |
| Imaging at another facility | Track the appointment handoff and expected completion. Use `Appointment` if your application manages scheduling; otherwise reconcile the external appointment status. |
| Multiple specimens or collection times | Preserve the individual specimen relationships and independent progress. Use the integration's order-splitting behavior when required. |

**If you only display clinical order state,** use `ServiceRequest`. **If staff need assignments, deadlines, or escalation,** add `Task`, with `focus` on the order and `for` referencing the patient. Track that work separately from order status. See [Tasks and Work Queues](/docs/careplans/tasks).

### 3.5 What happens when an order changes or never completes?

**Questions:** Can orders be edited after transmission? How is cancellation acknowledged? What happens after a rejected specimen, missed appointment, or overdue result? Are recurring orders in scope?

| Situation | Recommended approach |
| --- | --- |
| Draft changes | Edit before release and revalidate destination requirements. |
| Change after transmission | Follow the destination's amendment rules. If replacement is required, coordinate cancellation and link the replacement with `ServiceRequest.replaces`. |
| Cancellation | Use `revoked` for the cancelled clinical order, while separately tracking whether the external destination acknowledged the cancellation. |
| Order entered by mistake | Use `entered-in-error`; preserve the history needed to understand what happened. |
| Overdue or failed fulfillment | Create an assigned exception with a next action. Define when staff retry, contact the patient or facility, cancel, or request a new order. |
| Destination supports a standing order | Capture the authorized timing and validity, and track each performance and report independently. Agree how results identify the standing order and occurrence. |
| Each occurrence requires a new order or requisition | Create separately authorized requests for the individual occurrences. Do not reuse a completed one-time order as a recurring work queue. |

**Integration constraint:** Updating an active Health Gorilla order in Medplum does not modify it in the performing lab's system. Do not offer an edit action that implies an external change the integration cannot perform.

After a send timeout, reconcile the destination's order identifier before resending. Preventing duplicate FHIR resources does not prevent duplicate external orders.

References: [Order lifecycle](/docs/integration/health-gorilla/sending-orders#order-lifecycle), [Cancelling and Amending Orders](/docs/labs-imaging/ordering-labs-imaging#cancelling-and-amending-orders).

### 3.6 How will incoming results find the correct patient and order?

Choose the identifiers used to match patients, orders, and report revisions. Preserve their source namespaces; one order may produce multiple reports or deliveries.

| Situation | Data model and workflow implications |
| --- | --- |
| Known patient and order | Match on agreed identifiers and link known orders through `DiagnosticReport.basedOn`, which can reference multiple orders. Retain source identifiers for reconciliation. |
| Known patient, no local order | Store the report without inventing an order relationship; `basedOn` is optional. Assign review ownership. |
| Unknown or ambiguous patient | Route for identity resolution. Check whether the connector creates patients automatically and define how those records are reconciled. |
| Duplicate delivery or replay | Use conditional create/update keyed on stable source identifiers. Distinguish repeated deliveries from report revisions and prevent older results from overwriting newer ones. See [Working with FHIR](/docs/fhir-datastore/working-with-fhir). |
| Missed delivery | Provide reconciliation and backfill, with an owner for unresolved exceptions. |

**Health Gorilla implication:** Its receiver flags unsolicited reports with `DetectedIssue`. An unmatched patient causes it to create a patient from the supplied demographics and flag an `unknown-patient` issue. Plan a resolution queue; see [Receiving Results](/docs/integration/health-gorilla/receiving-results#resolving-orders-with-results).

### 3.7 What result detail must the application display and use?

Choose the formats your users need. Structured values, original reports, and images can coexist; each adds different modeling and integration work.

| Need | Data model and downstream implications |
| --- | --- |
| Discrete values, trends, or rules | Store `Observation` values with units, source reference ranges, interpretation, and timing. Validate comparability across sources. |
| Report summary and lifecycle | Use `DiagnosticReport`, link observations through `result`, and preserve partial, preliminary, final, amended, and corrected states. See [Results and Review](/docs/labs-imaging/results-and-review). |
| Original PDF or narrative is sufficient | Preserve it through `presentedForm` or the integration's `DocumentReference` relationship. Discrete observations are unnecessary unless the application needs them. See [Binary Data](/docs/fhir-datastore/binary-data) for file storage and access. |
| PDF-only source, but discrete results are required | Add extraction, verification, and source provenance before using extracted values for trends or rules. |
| Imaging interpretation only | Display the narrative or attached radiology report; image storage and viewer integration can remain out of scope. |
| Diagnostic images | Choose archive/viewer ownership below, then decide whether applications need synchronized context. |

#### Where will images live, and how will clinicians view them?

- **Medplum DICOM storage and hosted OHIF viewer**
  - **Choose when:** You need image storage and viewing without deploying a separate image server and viewer.
  - **Implications:** Implement ingestion, patient/order reconciliation, and image-access policies. Medplum's custom DICOM resources are distinct from R4 `ImagingStudy`; ingestion does not automatically link a FHIR patient or create an `ImagingStudy`. Create those relationships when required by your workflow.
  - **Tradeoffs:** DICOM support is beta and implements a subset of DICOMweb. Validate modality and viewer compatibility. Self-hosted OHIF deployment is an enterprise feature.
  - **Implementation:** [DICOM](/docs/dicom), [Data Model](/docs/dicom/data-model), [OHIF Viewer](/docs/dicom/ohif-viewer).
- **Existing PACS or external viewer**
  - **Choose when:** A facility already owns image storage and interpretation.
  - **Implications:** Agree viewer launch, authentication, study identifiers, and image availability. Link reports through `DiagnosticReport.imagingStudy` when using R4 `ImagingStudy`.
  - **Tradeoffs:** Avoids a second archive, but a FHIR reference alone does not retrieve images or launch the viewer; integration with the facility is still required.

#### Should the chart and viewer switch context together?

**If clinicians need synchronized patient or study selection,** evaluate [FHIRcast](/docs/fhircast). Medplum supports FHIRcast STU3 and OHIF context synchronization. Define participating applications, a shared session/topic, and supported events. This can accompany either storage choice when the applications support it.

**If independent navigation is sufficient,** skip context synchronization. FHIRcast does not replace image retrieval, authentication, or persisted order/result records.

### 3.8 What closes the loop after results arrive?

**Questions:** Who reviews routine and critical results? Who covers absences? When are patients notified? How are follow-up actions tracked? Does a correction require another review?

**Recommended baseline:** Keep report finality, clinician review, patient communication, and follow-up completion distinct. `DiagnosticReport.status = final` describes the report; it does not mean a clinician has reviewed it or contacted the patient.

| Requirement | Suggested application pattern |
| --- | --- |
| One reviewer, no separate queue required | Record acknowledgment and the report version reviewed in your clinical workflow, for example with `Provenance`. Do not change the report's clinical status to mean reviewed. |
| Assigned work, coverage, or overdue review | Create a `Task` focused on the report, with the patient in `Task.for`. Record ownership, deadlines, reviewer, review time, and report version. See [Tasks and Work Queues](/docs/careplans/tasks). |
| Covering clinician or unassigned result | Route through a defined coverage rule and fallback queue. Avoid leaving ownership implicit in the ordering clinician field. |
| Critical-result escalation | Implement the clinical team's escalation and acknowledgment policy, including coverage and unresolved alerts. An abnormal flag is input to that workflow. |
| Patient communication | Define release and communication rules with the responsible team. Track communication separately from reviewing the result. |
| Follow-up testing, visit, or referral | Create the appropriate follow-up resource and assigned work; define whether it must complete before the original review work closes. |
| Amended or corrected report | Reopen or create review work according to the correction policy, retaining which earlier version was reviewed and communicated. |

If routing is automated, use narrowly scoped Subscriptions and Bots. Handle report creation and meaningful updates, even when status is unchanged; conditionally create review work so repeated deliveries do not duplicate tasks. See [Subscription Extensions](/docs/subscriptions/subscription-extensions).

### 3.9 Who can access the data and resolve operational failures?

**Questions:** Which organizations share patients? Can ordering and covering clinicians see the same results? What can collection staff, integration services, and patients read or change? Who owns failed sends and unresolved matches?

Use `AccessPolicy` and `ProjectMembership` to enforce the chosen access boundaries; see [Access Policies](/docs/access/access-policies). Give each patient-specific resource its own applicable patient reference; access does not propagate merely because a resource links to an order or report. Include documents and their Binary security context in that design.

For Medplum DICOM storage, explicitly design and test access to the DICOM resources and image binaries. Matching a DICOM patient ID or creating an `ImagingStudy` link does not automatically establish patient-compartment access for the stored images.

Define separate operational ownership for transmission failures, identity exceptions, overdue fulfillment, and unreviewed results. Each queue needs an owner and a resolution action.

Reference: [Access Control Decision Guide](/docs/decision-guides/access-control).

## Before You Implement

Record these decisions in the implementation plan:

- Services, facilities, integration paths, and supported message types.
- Catalog owner, order grouping, ordering permissions, required information, and release rules.
- Collection or scheduling responsibilities and completion evidence.
- Identifier mapping, result formats, matching, amendment/cancellation rules, recurring orders, and recovery.
- Image storage, viewer, context synchronization, and image-access boundaries when in scope.
- Review, coverage, patient communication, and follow-up ownership.
- Access boundaries and the definition of a closed diagnostic workflow.

Walk through a routine lab order, an imaging order, a rejected or cancelled order, an unmatched result, a corrected report after review, and an absent reviewer. The design should make the next action and its owner clear in each case.
