---
sidebar_position: 0
---

# ScriptSure

:::tip[Planning this integration?]
The [E-Prescribe Decision Guide](/docs/decision-guides/e-prescribe) walks through the integration and enrollment decisions behind an e-prescribing build — iframe vs. integrated UI, controlled substances, and prescriber enrollment — use it alongside these docs.
:::

Medplum has partnered with [DAW Systems](https://www.dawsystems.com/) to offer e-prescribing via ScriptSure. The integration exposes a full API surface, including custom FHIR operations and Medplum bots. Providers can have access to features such as:

- Electronic prescriptions including controlled substances (EPCS)
- Medication history via SureScripts

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

Detailed prescribing workflow documentation is available to customers with the ScriptSure integration enabled. Contact [Medplum support](mailto:support@medplum.com) for access.
