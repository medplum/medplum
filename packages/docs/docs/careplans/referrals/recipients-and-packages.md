---
title: Recipients and Referral Packages
---

# Recipients and Referral Packages

"Send it to cardiology" might mean a named clinician, a clinic, or an intake team that decides who will see the patient. Model the destination at the level your workflow actually knows. You can assign the person who processes the referral separately.

## Choose Where the Referral Is Going {/* #choose-the-recipient-model */}

| Destination | Recommended representation |
| --- | --- |
| A clinician in a particular practice or service | `ServiceRequest.performer` references PractitionerRole |
| A named clinician without role-specific context | `ServiceRequest.performer` references Practitioner |
| A clinic or organization | `ServiceRequest.performer` references Organization |
| A service that assigns its own clinicians | `ServiceRequest.performer` references HealthcareService |
| A requested physical site | `ServiceRequest.locationReference` references Location |
| The person or team coordinating the next step | `Task.owner`, independently of the clinical performer |

Use structured references in the recipient picker. When a directory comes from another system, preserve its identifiers and resolve the selected entry to the appropriate local resource. Do not assume an external resource ID is valid on your Medplum server.

:::note[Preferred does not necessarily mean in network]

A preferred-provider list expresses your practice's preference. Payer network participation and the patient's covered benefits need their own authoritative sources. Record the source and effective date of network information, and handle unknown or stale results explicitly. An eligibility response alone may not establish that a particular provider, location, and service are in network.

:::

## Send What the Receiving Team Needs {/* #build-the-clinical-package */}

Start with the receiving team's requirements, then let the sender review the material before release. Typical context includes the clinical reason, relevant results, current treatment, and coverage information. Select the records needed for the service instead of exporting the entire chart by default.

Give the reviewer a path back to the evidence. Use `reasonReference` for the clinical reason and `supportingInfo` for additional context such as Observations, QuestionnaireResponses, and DocumentReferences. A request can reference structured evidence while also carrying a readable summary.

`ServiceRequest.note` can carry narrative for the receiving team, and `patientInstruction` can carry instructions written for the patient. These fields do not create different access permissions within the resource. Keep internal-only material in separately protected resources and exclude it from the outbound package.

## Upload the File and Keep Its Metadata {/* #store-documents-with-binary */}

Store file bytes in Binary and metadata in [DocumentReference](/docs/fhir-datastore/external-documents). The attachment's `url` points to `Binary/{id}`. Use `createBinary` or `createAttachment` with a `securityContext` appropriate to the document's access policy; see [Binary Data](/docs/fhir-datastore/binary-data).

Medplum also provides `createDocumentReference`, which creates the document record, uploads the Binary, and links the attachment. By default, it uses the DocumentReference as the Binary's security context. Supply the document's patient and other access-relevant fields when creating it. The helper performs multiple writes, so recover incomplete uploads before retrying the whole operation.

:::caution[Keep file bytes out of the attachment]

Use the Binary URL in `DocumentReference.content.attachment.url`. Do not embed base64 in `Attachment.data`. For outbound exchange, deliver the actual file or an authorized URL the receiving system can resolve; a relative Binary URL from your server is not sufficient on its own.

:::

## Keep a Copy of What the Recipient Saw {/* #preserve-what-was-sent */}

A patient's chart can change after the referral is sent. Retain the generated package as a DocumentReference and link that exact document from the outbound Communication. For structured exchanges, retain the transmitted payload and correlation metadata according to your retention policy, including the resource versions represented.

If staff correct and resend a package, preserve the first transmission and record the new one. A mutable `supportingInfo` list alone cannot tell you what the receiving clinic saw last Tuesday.

Next, [send the referral and track delivery](/docs/careplans/referrals/transmition-and-tracking).
