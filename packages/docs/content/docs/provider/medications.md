---
title: Medications
weight: 5300
description: Review medication orders and use the configured ScriptSure or DoseSpot prescribing workflow in Provider.
---

The **Meds** area in a patient's chart displays medication orders and their status. With an e-prescribing integration configured, it also connects preparation and review in Medplum Provider to the prescribing service.

{{< info title="Before you start" >}}
Prescribing actions depend on your organization's integration and your practitioner account. Complete [ScriptSure](/docs/integration/scriptsure) or [DoseSpot](/docs/integration/dosespot) enrollment and setup before prescribing.
{{< /info >}}

## Review medication orders

Open a patient's chart and select **Meds**. Select an order to review its full details, and use pagination to move through the list.

| View          | Medication order statuses included                  |
| ------------- | --------------------------------------------------- |
| **Active**    | Active, on-hold, and unknown                        |
| **Draft**     | Draft                                               |
| **Completed** | Completed, stopped, cancelled, and entered-in-error |

The view groups several statuses for navigation. Read the individual order's status when deciding what action is needed. This list is based on `MedicationRequest` records; medication statements, administrations, and dispensing records have different meanings in FHIR. See [Representing Prescriptions and Medication Orders](/docs/medications/representing-prescriptions-and-medication-orders).

## Prescribe with ScriptSure

For a practitioner with ScriptSure configured, the Meds page provides an **Order medication** action.

1. Select **Order medication**, the plus button above the list.
2. Search for the medication and complete the prescription details. Review the patient, pharmacy, and other applicable context.
3. Follow the prescribing workflow presented by the form. You can prepare draft orders for the cart and review them together.
4. In **Draft**, review all orders intended for submission. Use the remove action for an individual draft or **Clear cart** to remove the cart's drafts.
5. Choose **Checkout** to queue the cart for review, then complete the approval workflow in ScriptSure.

{{< warning title="Checkout includes the whole cart" >}}
Review all draft orders, including additional pages, before choosing **Checkout**. The action queues the whole cart. If some orders fail to queue, review the errors and prescribing queue before retrying.
{{< /warning >}}

Provider opens the prescribing interface for the final review and approval steps. After that workflow, confirm that the order status has synchronized back into the patient's chart. A draft or queued order still needs the applicable prescribing steps to be completed.

You can also open an existing order in ScriptSure from its details. Pending orders reopen in the patient prescriptions interface so that they can be reviewed in the appropriate queue.

## Work with DoseSpot

When the signed-in practitioner has DoseSpot configured, opening the Meds page synchronizes the patient, prescriptions, and medication history through the integration. Watch for the synchronization notification and resolve any reported error before relying on the refreshed list.

Use the application's DoseSpot prescribing surface for prescription entry and signing. Its setup and embedded workflow are described in the [DoseSpot integration guide](/docs/integration/dosespot).

## Troubleshooting

| What you see                       | What to check                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| No Order medication action         | The native ordering action requires ScriptSure configuration for the signed-in practitioner. Check the integration and account setup. |
| An order remains in Draft          | Review the cart and complete checkout and the prescribing service's approval steps.                                                   |
| Checkout reports a partial failure | Review the failed orders and the prescribing queue before submitting again.                                                           |
| Order details appear out of date   | Check synchronization errors and the status in the prescribing service.                                                               |

## Building a custom medication workflow

The [E-Prescribe Decision Guide](/docs/decision-guides/e-prescribe) helps choose an embedded prescribing interface or a custom workflow. The [Medications guides](/docs/medications) explain the FHIR models and terminology used across those approaches.
