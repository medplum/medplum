---
sidebar_position: 0
---

# ScriptSure (Beta)

:::caution[Beta]
The ScriptSure integration is in beta. Features and APIs may change.
:::

Medplum has partnered with [DAW Systems](https://www.dawsystems.com/) to offer e-prescribing via ScriptSure. The integration exposes a full API surface, including custom FHIR operations and Medplum bots. This allows users to build custom UI on top of the platform, though ScriptSure also offers an authenticated iframe. Providers can have access to features such as:

- Drug search with real-time DDI/allergy checks
- Electronic prescriptions including controlled substances (EPCS)
- Medication history via SureScripts
- Pharmacy search and preferred pharmacy management
- Prescription order sets

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/Yw05lnNOtpE" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
</div>

## Prerequisites

Medplum will create your organization in the ScriptSure vendor portal and configure the integration before you begin. Once setup is complete, you'll receive an invite email. Once onboarded, you can send invites to new users.

## Getting started

| Guide | Description |
|---|---|
| [Account Setup](/docs/integration/scriptsure/account-setup) | Accept your invite, configure your Medplum profile, and verify access |
| [Sync a Provider](/docs/integration/scriptsure/sync-provider) | Enroll a prescriber in ScriptSure |
| [Sync a Patient](/docs/integration/scriptsure/sync-patient) | Sync a patient to ScriptSure before an encounter |
| [Prescribing iFrame](/docs/integration/scriptsure/iframe) | Render the ScriptSure prescribing UI |
| [Order Medication](/docs/integration/scriptsure/order-medication) | Create a pending prescription order and launch the prescribing widget |
| [Drug Interaction Check](/docs/integration/scriptsure/drug-interaction) | Check candidate drugs against the patient's current medications |
| [Pharmacy Search](/docs/integration/scriptsure/pharmacy-search) | Search pharmacies and set a patient's preferred pharmacy |
| [Order Sets](/docs/integration/scriptsure/order-sets) | Import and launch ScriptSure order sets |
