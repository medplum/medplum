---
title: Processing and Coordinating Referrals
---

# Processing and Coordinating Referrals

Once a referral is accepted, the next step may belong to a different team. Someone checks authorization, someone contacts the patient, and someone arranges the visit. A single "in progress" label rarely tells the coordinator enough to help.

## Give Each Obligation an Owner

Use Tasks for steps with independent owners or completion criteria. Each patient-related Task has `for` referencing the Patient and `focus` referencing the ServiceRequest. Set `owner` to the accountable person or group; use `performerType` when eligible staff claim work from a role-based pool.

| Work item | Completion evidence |
| --- | --- |
| Gather missing records | Required material linked in `input` or `output`, with review recorded |
| Check authorization | Payer response or documented determination, including scope and validity |
| Schedule the service | Appointment reference in `output` |
| Review the returned note | Review disposition and any follow-up request in `output` |

Every Task input or output needs a `type` and one `value[x]`. Use `valueReference` for linked resources. Define local work-type and stage codes in a governed CodeSystem when automation or search depends on them.

You can also use a parent Task to track an overall coordination obligation, with step Tasks linked through `partOf`. Add this only when someone owns that broader obligation. Define how its state is derived so staff do not have to maintain two competing versions of referral progress. `partOf` does not release the next step automatically.

See [Teams and Delegation](/docs/careplans/teams-and-delegation) for role eligibility and [Handoffs and Escalation](/docs/careplans/handoffs-and-escalation) for claiming, deadlines, and exception handling.

## Find Out What Is Needed Before Booking {/* #track-coverage-and-authorization */}

Before telling the patient they are ready to book, establish which coverage or authorization checks your workflow requires. The payer integration may need to answer several different questions:

| Question | Starting model |
| --- | --- |
| What benefits apply? | CoverageEligibilityRequest with `purpose: benefits`, linked to the patient's Coverage |
| Is authorization required? | CoverageEligibilityRequest with `purpose: auth-requirements`, where supported by the payer |
| Is the specific provider/service in network? | Authoritative payer directory or contract data, supplemented by applicable eligibility evidence |
| What was submitted for authorization? | Claim with `use: preauthorization` when this matches the exchange contract |
| What did the payer decide? | ClaimResponse and its authorization/adjudication details, mapped according to that contract |

:::caution[A processed response is not an authorization approval]

A successful transport response or `ClaimResponse.outcome: complete` is not by itself an approval. Interpret the payer's actual adjudication and authorization details, including the covered services, dates, units, and identifiers. Eligibility is also distinct from authorization approval.

:::

The integration may use a payer API, an implementation guide, or an EDI mapping. Choose and validate that contract before defining the scheduling gate. These resources do not provide a universal clearinghouse connection or guarantee coverage. See the [R4 eligibility response fields](https://hl7.org/fhir/R4/coverageeligibilityresponse-definitions.html) for the information a response can carry.

Keep the coordination Task on hold when required evidence is missing, with a reason and an accountable owner. Record a denial, expiration, or approved exception explicitly so it remains actionable.

## Book the Visit and Keep the Referral Linked {/* #connect-scheduling-to-the-request */}

Reference the ServiceRequest from `Appointment.basedOn` and, when the service occurs, `Encounter.basedOn`. Scheduling the appointment completes the scheduling work item; the clinical service still has to happen.

Use the [Scheduling guides](/docs/scheduling) for availability and booking. Create Slots only for booked or blocked time, and validate practitioner eligibility through the controlled booking path. For patient outreach, use Communications linked to the request and a Task when a response needs tracking.

The [UnityAI scheduling case study](/blog/scheduling-agents-unity-ai) shows how referral data can support outreach and scheduling. Automation still needs a route back to staff when a patient cannot be reached or a booking cannot proceed.

## Change the Destination Without Losing the History {/* #cancel-or-reroute-deliberately */}

If only the destination changes and the clinical order remains valid, the authorized workflow can update `ServiceRequest.performer`, resolve the old work items, and create work for the new destination. Preserve prior messages and notify affected parties through the integration.

If a new clinical order replaces the old one, create a new ServiceRequest with `replaces` referencing the prior request and end the old request appropriately, such as `revoked` when withdrawn. A receiver declining work does not automatically revoke the referring clinician's order. Use `Task.status: cancelled` only for the work being cancelled, with a reason.

:::note[Choose the rerouting boundary]

Whether a change of recipient is an amendment or a replacement depends on order authority and partner requirements. Agree on that rule with your clinical and integration teams, then apply it consistently. Both paths preserve the original transmission history.

:::

Continue with [Results and Closing the Loop](/docs/careplans/referrals/results-and-closure).
