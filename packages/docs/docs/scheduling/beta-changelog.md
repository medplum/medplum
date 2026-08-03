---
sidebar_label: Beta Changelog
sidebar_position: 21
---

import ExampleCode from '!!raw-loader!@site/../examples/src/scheduling/clear-busy-slot-service-type.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Beta Changelog

:::info[Beta]

Medplum Scheduling APIs are currently in [beta](/docs/compliance/alpha-beta). While in beta, we
may make backwards-incompatible changes to fix bugs or align behavior with the FHIR spec. This
page is a running log of those changes, newest first, along with the migration steps (if any)
needed to adopt them.

:::

## `Slot.serviceType` is now respected on busy Slots

**Target release:** September 1, 2026 &nbsp;·&nbsp; **Issues:** [#9995](https://github.com/medplum/medplum/issues/9995), [#9998](https://github.com/medplum/medplum/pull/9998)

### What changed

Previously, [`$find`](/docs/scheduling/appointment-find) and [`$book`](/docs/scheduling/appointment-book)
only applied the `serviceType` filter to **free** Slots. Every `busy` / `busy-unavailable` Slot was
subtracted from availability regardless of its `serviceType`, so a busy Slot scoped to one service
actually blocked the **entire** Schedule.

This contradicted the [documented behavior](/docs/scheduling/defining-availability#blocking-time-by-service-type):

> - **With serviceType**: Blocks only that specific service
> - **Without serviceType**: Blocks all services

Starting with this release, the `serviceType` filter is applied to busy Slots as well:

- A busy Slot **without** a `serviceType` still blocks all services (unchanged).
- A busy Slot **with** a `serviceType` now blocks **only** the matching service(s).

Thank you to [Nick Catalano](https://github.com/nickcatal) for reporting the issue.

### Who is affected

Users of `$find`/`$book` before Medplum Server v5.1.28 will have had `Slot` resources created with a `serviceType` attribute.

These slots were intended to block their related Schedule availability for all services ("wildcard" service type matching), but before [#9998](https://github.com/medplum/medplum/pull/9998) the slots were being created with `serviceType` set to the type of the linked Appointment resource.

While the bug above existed, that stray `serviceType` was ignored, so those Slots still blocked everything and no harm was done.

Once this fix lands, those Slots will block only their single service — leaving the provider bookable for other services at the same time and allowing double-booking. If you used `$find` / `$book` before #9998 shipped, you likely have such Slots and should run the migration below.

You are also affected if you hand-authored `busy` / `busy-unavailable` Slots with a `serviceType` and relied on them blocking every service. If you never set `serviceType` on busy Slots, or you always intended a busy Slot to block only its referenced service, no action is needed.

### Migration

To preserve the old "block all services" behavior, clear `serviceType` on the affected busy Slots before upgrading. Since blocked time in the past no longer matters, you only need to migrate Slots ending after your upgrade date.

The script below finds every `busy` / `busy-unavailable` Slot with a `serviceType` ending after `TARGET_DATE` and removes the `serviceType` field, so those Slots continue to block all services.

<MedplumCodeBlock language="ts" selectBlocks="clearBusySlotServiceType">
  {ExampleCode}
</MedplumCodeBlock>
