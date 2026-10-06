---
title: Worked Referral Example
---

# Worked Referral Example

Let's follow a referral from release to review of the returned note. A clinician requests a consultation, a coordinator sends the package, and the receiving team schedules the patient. After the visit, the referring team reviews the specialist's note.

Both teams use one Medplum project in this example. The package is shared through an in-app conversation, and each team works with the same ServiceRequest. For an external recipient, the integration exchanges these records and maps identifiers as described in [Referrals](/docs/careplans/referrals#decide-whether-the-teams-share-a-project).

The examples use fictional IDs and text labels. Configure validated terminology and local workflow CodeSystems, and use your server's returned IDs for later references.

<span id="servicerequest-example" />

## 1. Create the Request and Initial Work

Assume `Patient/example`, `PractitionerRole/referring-clinician`, `Organization/referral-coordination`, and `Organization/receiving-clinic` already exist. The transaction creates an active order and a Task to coordinate it. The Task's `focus` uses the request's `urn:uuid` fullUrl so the server can resolve the new reference.

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:2bcb56d0-993c-4e86-9ae2-3ca0c5dfa093",
      "resource": {
        "resourceType": "ServiceRequest",
        "identifier": [{ "system": "https://example.org/referrals", "value": "REF-2026-001" }],
        "status": "active",
        "intent": "order",
        "code": { "text": "Specialist consultation" },
        "subject": { "reference": "Patient/example" },
        "requester": { "reference": "PractitionerRole/referring-clinician" },
        "performer": [{ "reference": "Organization/receiving-clinic" }],
        "authoredOn": "2026-10-06T16:00:00Z",
        "reasonCode": [{ "text": "Clinical reason documented by the referring clinician" }]
      },
      "request": {
        "method": "POST",
        "url": "ServiceRequest",
        "ifNoneExist": "identifier=https%3A%2F%2Fexample.org%2Freferrals%7CREF-2026-001"
      }
    },
    {
      "fullUrl": "urn:uuid:74418b81-843b-4763-8b30-90782d85f290",
      "resource": {
        "resourceType": "Task",
        "identifier": [{ "system": "https://example.org/referral-work", "value": "REF-2026-001-coordinate" }],
        "status": "ready",
        "intent": "order",
        "code": { "text": "Coordinate referral through returned-note review" },
        "focus": { "reference": "urn:uuid:2bcb56d0-993c-4e86-9ae2-3ca0c5dfa093" },
        "for": { "reference": "Patient/example" },
        "owner": { "reference": "Organization/referral-coordination" }
      },
      "request": {
        "method": "POST",
        "url": "Task",
        "ifNoneExist": "identifier=https%3A%2F%2Fexample.org%2Freferral-work%7CREF-2026-001-coordinate"
      }
    }
  ]
}
```

Submit with `medplum.executeBatch` using the transaction Bundle, and read the resulting resource locations from the transaction response. The SDK method name does not change the Bundle's transaction semantics. See [FHIR Batch and Transaction Requests](/docs/fhir-datastore/fhir-batch-requests).

Conditional creates make replaying this initial submission safe for FHIR resource creation. A match leaves the existing resource unchanged. Handle a multiple-match error as a data-quality issue rather than silently picking a request.

For the remaining snapshots, assume the transaction returned `ServiceRequest/referral-001` and `Task/coordinate-001`. Each snapshot shows a later persisted state in the workflow.

<span id="documentreference-example" />

## 2. Store the Referral Package

Upload the reviewed PDF bytes with `createBinary` or `createAttachment`, setting `securityContext` to the DocumentReference that controls access. You can also use `createDocumentReference` to perform the document creation, upload, and attachment update. See [Recipients and Referral Packages](/docs/careplans/referrals/recipients-and-packages).

After uploading, the DocumentReference looks like this. `Binary/package-pdf-001` is the ID returned by the upload; no base64 is embedded in the attachment.

```json
{
  "resourceType": "DocumentReference",
  "id": "package-001",
  "status": "current",
  "docStatus": "final",
  "type": { "text": "Referral package" },
  "subject": { "reference": "Patient/example" },
  "author": [{ "reference": "PractitionerRole/referring-clinician" }],
  "content": [{
    "attachment": {
      "contentType": "application/pdf",
      "url": "Binary/package-pdf-001",
      "title": "Referral package REF-2026-001"
    }
  }],
  "context": {
    "related": [{ "reference": "ServiceRequest/referral-001" }]
  }
}
```

The upload may use the DocumentReference as security context before the final attachment URL is populated. Establish the document's access rules first and recover incomplete uploads explicitly. A document's `final` status describes the document; it does not complete the referral.

<span id="communication-example" />

## 3. Record the Thread and Sent Message

The selected destination is `Organization/receiving-clinic`. The Communication header below groups the exchange and contains all participants, including its creator.

```json
{
  "resourceType": "Communication",
  "id": "referral-thread",
  "status": "in-progress",
  "subject": { "reference": "Patient/example" },
  "topic": { "text": "Referral REF-2026-001" },
  "about": [{ "reference": "ServiceRequest/referral-001" }],
  "sender": { "reference": "Organization/referral-coordination" },
  "recipient": [
    { "reference": "Organization/referral-coordination" },
    { "reference": "Organization/receiving-clinic" }
  ]
}
```

The sent child message carries the package. Record `sent` after the send event and retain a stable message identifier.

```json
{
  "resourceType": "Communication",
  "id": "send-001",
  "identifier": [{ "system": "https://example.org/referral-messages", "value": "TX-001" }],
  "status": "in-progress",
  "subject": { "reference": "Patient/example" },
  "partOf": [{ "reference": "Communication/referral-thread" }],
  "about": [{ "reference": "ServiceRequest/referral-001" }],
  "sender": { "reference": "Organization/referral-coordination" },
  "recipient": [
    { "reference": "Organization/receiving-clinic" }
  ],
  "sent": "2026-10-06T17:00:00Z",
  "payload": [{
    "contentReference": { "reference": "DocumentReference/package-001" }
  }]
}
```

:::note[Thread participants and delivery destinations serve different purposes]

Here, both teams participate in an in-app conversation. For external delivery, the integration resolves the intended destination separately from the complete local participant list and retains the provider's transmission identifier.

:::

<span id="task-example" />

## 4. Accept the Work and Assign Scheduling

Conditionally create the receiving team's fulfillment Task with `status: requested`, using the stable identifier below. When the team agrees to perform the work, version-check the update to `accepted`. The snapshot after that acknowledgment is:

```json
{
  "resourceType": "Task",
  "id": "fulfill-001",
  "identifier": [{ "system": "https://example.org/referral-work", "value": "REF-2026-001-fulfill" }],
  "status": "accepted",
  "intent": "order",
  "code": { "text": "Fulfill specialist consultation" },
  "focus": { "reference": "ServiceRequest/referral-001" },
  "for": { "reference": "Patient/example" },
  "requester": { "reference": "Organization/referral-coordination" },
  "owner": { "reference": "Organization/receiving-clinic" }
}
```

Once acceptance and required authorization checks are recorded, conditionally create a separate scheduling Task. Its completion criterion is a confirmed booking:

```json
{
  "resourceType": "Task",
  "id": "schedule-001",
  "identifier": [{ "system": "https://example.org/referral-work", "value": "REF-2026-001-schedule" }],
  "status": "ready",
  "intent": "order",
  "code": { "text": "Schedule specialist consultation" },
  "focus": { "reference": "ServiceRequest/referral-001" },
  "for": { "reference": "Patient/example" },
  "owner": { "reference": "Organization/receiving-clinic" }
}
```

The referring team's `coordinate-001` Task owns follow-through and returned-note review. The receiving team's fulfillment and scheduling Tasks are independent obligations linked through the same ServiceRequest, outside that coordination tree. Different owners can share a Task hierarchy when the workflow calls for it; this example keeps the two teams' obligations separate.

The shared view can now show receiving-team acceptance independently of the message's sent time. See [status updates](/docs/careplans/referrals/processing-and-coordination#keep-the-referring-team-in-the-loop) for notifying the referrer.

## 5. Link the Booking {/* #link-the-booking */}

The receiving team's booking workflow creates an Appointment. This snapshot omits scheduling extensions and Slot details; use the [Scheduling operations](/docs/scheduling) to create the booking for your configured service.

```json
{
  "resourceType": "Appointment",
  "id": "consultation-001",
  "status": "booked",
  "basedOn": [{ "reference": "ServiceRequest/referral-001" }],
  "start": "2026-10-13T16:00:00Z",
  "end": "2026-10-13T16:30:00Z",
  "participant": [
    { "actor": { "reference": "Patient/example" }, "status": "accepted" },
    { "actor": { "reference": "PractitionerRole/receiving-clinician" }, "status": "accepted" }
  ]
}
```

Version-check the update to `Task/schedule-001`, setting `status: completed` and `output` to a typed Appointment reference: `type.text = "Confirmed booking"` and `valueReference.reference = "Appointment/consultation-001"`. Notify the referring team of the booking. The overall coordination Task stays open because its scope includes the returned-note review.

## 6. Retain and Review the Returned Note {/* #review-the-returned-note */}

The receiving team moves its fulfillment Task to `in-progress` when that work begins, then to `completed` when its consultation criteria are met. After the service, upload the returned note using the same Binary pattern. Preserve the author and match the source referral identifier before linking it.

```json
{
  "resourceType": "DocumentReference",
  "id": "consultation-note-001",
  "status": "current",
  "docStatus": "final",
  "type": { "text": "Consultation note" },
  "subject": { "reference": "Patient/example" },
  "author": [{ "reference": "PractitionerRole/receiving-clinician" }],
  "content": [{
    "attachment": {
      "contentType": "application/pdf",
      "url": "Binary/consultation-note-pdf-001",
      "title": "Consultation note REF-2026-001"
    }
  }],
  "context": {
    "related": [{ "reference": "ServiceRequest/referral-001" }]
  }
}
```

Create the review Task once for the relevant note/version. The referring clinician reviews the specialist's note here. The review annotation is signed by `Practitioner/referring-clinician`, the Practitioner behind the Task owner's PractitionerRole; the consultation document retains the specialist as its author. This example shows it after the reviewer has completed their work:

```json
{
  "resourceType": "Task",
  "id": "review-note-001",
  "identifier": [{ "system": "https://example.org/referral-work", "value": "REF-2026-001-review-note-v1" }],
  "status": "completed",
  "intent": "order",
  "code": { "text": "Review consultation note" },
  "partOf": [{ "reference": "Task/coordinate-001" }],
  "focus": { "reference": "ServiceRequest/referral-001" },
  "for": { "reference": "Patient/example" },
  "owner": { "reference": "PractitionerRole/referring-clinician" },
  "input": [{
    "type": { "text": "Returned consultation note" },
    "valueReference": { "reference": "DocumentReference/consultation-note-001" }
  }],
  "businessStatus": { "text": "Reviewed; no additional coordination needed" },
  "output": [{
    "type": { "text": "Review disposition" },
    "valueCodeableConcept": { "text": "No additional coordination needed" }
  }],
  "note": [{
    "authorReference": { "reference": "Practitioner/referring-clinician" },
    "time": "2026-10-14T17:00:00Z",
    "text": "Reviewed the returned note and recorded the disposition."
  }]
}
```

The responsible party reconciles the ServiceRequest's status from evidence that the requested service occurred. The coordinator completes the parent Task after the required note review and follow-up decisions are recorded.

## Show the Coordinator the Whole Referral {/* #queries-for-the-referral-view */}

```http
GET /fhir/R4/Task?focus=ServiceRequest/referral-001
GET /fhir/R4/Communication?part-of=Communication/referral-thread
GET /fhir/R4/Appointment?based-on=ServiceRequest/referral-001
GET /fhir/R4/DocumentReference?related=ServiceRequest/referral-001
```

These queries bring the work items, conversation, booking, and documents into one referral view. The Communication query uses the known thread ID to retrieve its messages. Use `part-of` for these messages; R4 defines `about` as a reference field without a corresponding standard search parameter. Follow pagination and run each query under the appropriate AccessPolicy. These are separate resource searches; a ServiceRequest search does not automatically return everything linked to the referral. When the receiving clinic uses another server, exchange identifiers and map references through the integration instead of assuming these local queries reach its records.
