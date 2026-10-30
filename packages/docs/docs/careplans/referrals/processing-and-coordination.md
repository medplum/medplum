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

You can also use a parent Task to track an overall coordination obligation, with step Tasks linked through `partOf`. Add this only when someone owns that broader obligation. Define how its state is derived so staff do not have to maintain two competing versions of referral progress. Use the [handoff pattern](/docs/careplans/handoffs-and-escalation#release-the-next-step) to start each next step.

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

### Carry Referral and Authorization Details into Billing

When required by the payer, link the claim's `referral` to the ServiceRequest and put the issued authorization number in `Claim.insurance.preAuthRef`. The latter is a string, not a resource reference. See the [R4 Claim definitions](https://hl7.org/fhir/R4/claim-definitions.html#Claim.insurance.preAuthRef).

Retain the authorization's effective period (`ClaimResponse.preAuthPeriod` when supplied), approved services, and any visit or unit limits under the payer's exchange contract. Check authorization dates and remaining authorized visits or units for each booking and claim. Keep payer authorization limits distinct from the clinician's requested service timing; an authorization expiring may require renewal while the clinical referral remains active.

## Book the Visit and Keep the Referral Linked {/* #connect-scheduling-to-the-request */}

Reference the ServiceRequest from `Appointment.basedOn` and, when the service occurs, `Encounter.basedOn`. Scheduling the appointment completes the scheduling work item; the clinical service still has to happen.

Use the [Scheduling guides](/docs/scheduling) for availability and booking. Create Slots only for booked or blocked time, and validate practitioner eligibility through the controlled booking path. For patient outreach, use Communications linked to the request and a Task when a response needs tracking.

The [UnityAI scheduling case study](/blog/scheduling-agents-unity-ai) shows how referral data can support outreach and scheduling. Automation still needs a route back to staff when a patient cannot be reached or a booking cannot proceed.

## Follow Through When Scheduling Does Not Succeed

Before the first outreach attempt, agree on the contact channels, spacing and number of attempts, urgency exceptions, and who can decide to stop. Keep a coordinator accountable until the work is rescheduled, transferred, or explicitly closed.

Record outreach attempts as Communications with `subject` for the patient and `about` for the ServiceRequest. Retain the channel, sender, time of the actual attempt, and its outcome. Use a stable attempt identifier so a retried integration event records the same attempt once. Link the records from the coordination Task as needed, and keep its local `businessStatus` current for the queue.

The table below uses a scheduling Task whose completion criterion is a booking. Local stage and reason labels are examples to define in your workflow CodeSystem.

| Outcome | Next action and owner | Status and notice to the referring team |
| --- | --- | --- |
| Patient cannot be reached | Coordinator records attempts and the next contact date. An authorized staff member reviews the attempt limit and any urgency exception before stopping. | Keep work open while outreach continues. If stopped without a booking, cancel the scheduling Task with an unable-to-reach reason and report the attempts and disposition. |
| Patient declines | Record the patient's decision and route any required clinical discussion to its own review Task. | Cancel outstanding scheduling work with a patient-declined reason. Notify the referrer so the responsible clinician can decide what happens to the order. |
| Patient misses the visit | Record `Appointment.status: noshow`; assign a new rescheduling Task linked to the same referral if follow-up is required. | Preserve the completed original booking Task. Report the missed visit and the rescheduling or stop decision. |
| Referral reaches a local validity limit | Coordinator routes the request for renewal or closure review under the practice's policy. Distinguish the order's validity from an expired payer authorization. | Record expiration as a local disposition. Cancel outstanding booking work if the authorized decision is to stop, and notify the referrer of the reason and renewal path. |

Use `statusReason` and an authored note to explain cancellation. Reserve `completed` for the work the Task actually promised to finish; a separate review Task may complete even when its decision is to stop scheduling. R4 Task and ServiceRequest have no `expired` status. Reconcile the clinical request through the responsible order authority, using `revoked` when the request is withdrawn. See [Task statuses](https://hl7.org/fhir/R4/codesystem-task-status.html).

## Keep the Referring Team in the Loop

Agree on which events warrant an update: accepted, scheduled, declined, unable to schedule, missed visit, and closure are useful starting points. Include the referral identifier, event time, disposition or reason, and next owner or action. This lets the referring team help before a referral goes quiet.

Within one project, expose the shared workflow state through authorized views and [notifications](/docs/careplans/automating-workflows#let-the-assignee-know). Across systems, exchange a correlated status message through the [transmission workflow](/docs/careplans/referrals/transmition-and-tracking), retaining the Communication and delivery history. A failed status notification leaves follow-up work for the integration owner; it should not erase the scheduling outcome.

## Change the Destination Without Losing the History {/* #cancel-or-reroute-deliberately */}

If only the destination changes and the clinical order remains valid, the authorized workflow can update `ServiceRequest.performer`, resolve the old work items, and create work for the new destination. Preserve prior messages and notify affected parties through the integration.

If a new clinical order replaces the old one, create a new ServiceRequest with `replaces` referencing the prior request and end the old request appropriately, such as `revoked` when withdrawn. A receiver declining work does not automatically revoke the referring clinician's order. Use `Task.status: cancelled` only for the work being cancelled, with a reason.

:::note[Choose the rerouting boundary]

Whether a change of recipient is an amendment or a replacement depends on order authority and partner requirements. Agree on that rule with your clinical and integration teams, then apply it consistently. Both paths preserve the original transmission history.

:::

Continue with [Results and Closing the Loop](/docs/careplans/referrals/results-and-closure).
