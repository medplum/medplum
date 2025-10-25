---
sidebar_position: 5
---

# Creating Superbills

Medplum supports customizable creation of superbills. 

A superbill is a detailed form used by healthcare providers that outlines the services provided to a patient. It is typically given to patients after their medical appointments so they can submit it to their insurance companies for reimbursement.  Superbills are important in settings where the provider does not directly bill the insurance company, such as in many out-of-network situations or when services are provided by a provider who operates on a cash-only basis.

Similar to the generation of the [CMS 1500](/docs/billing/creating-cms1500) the Superbill is typically generated when an encounter is finished.  The recommended implementaiton pattern is to create a Superbill as PDF and attaches it to a `Claim` resource.

Superbills are typically not synchronized to external systems, but are sent to payors via patients or directly as a bill for out of network services.