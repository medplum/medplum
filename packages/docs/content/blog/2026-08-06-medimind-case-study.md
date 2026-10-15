---
id: 2026-08-06-medimind-case-study
slug: medimind-case-study
title: 'MediMind: An AI-Native Hospital System'
authors: lasha
tags: [case-study, ai, self-hosting, integration, migration]
---

[MediMind](https://medimind.md/) is a **proactive, AI-native hospital system** built from the ground up on FHIR R4, now under contract with a **25-hospital network** in the Republic of Georgia. Here is why we rebuilt what a hospital runs on instead of adding features to what was already there, and why we built it on Medplum.

![MediMind](/img/blog/medimind-logo.svg)

<!--more-->

<div class="responsive-iframe-wrapper">
  <iframe src="https://www.youtube.com/embed/v7lRW_ZYDmc" title="MediMind / Medplum Case Study" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

## The bet

I am a physician, and I think that within a few years, practicing medicine without AI assistance will look like malpractice. The timeline is a guess and I may be wrong about it by years. I am not hedging on the direction at all.

If AI assistance is going to be the standard of care, you cannot get there by adding AI to existing hospital software. You have to build the thing AI runs on. That is what MediMind is: a hospital system designed from the data layer up to be reasoned over by a model, covering [clinical workflows](/docs/ai) end to end, from the moment an analyzer produces a result to the moment the ministry receives the report, with AI inside the flow instead of beside it.

## Why Georgia

We chose Georgia deliberately, for velocity: how fast an idea becomes something running in a real clinical workflow with real patients. It had to practice Western, evidence-based medicine so that whatever we learned would transfer everywhere, and it had to let us move.

The clinical culture here is Western-oriented and evidence-based, and the hospitals are close to greenfield: no thirty-year installed base, no integration debt between forty systems that all half-talk to each other, no five-year procurement cycle between a decision and a deployment. A network here can decide to change everything at once and mean it. Some of the same conditions have made Georgia a destination for early-phase clinical trials.

None of that is about lighter rules. We are treating patients across a 25-hospital network, we carry the obligations any hospital system carries for accuracy and availability, and we handle personal health data under Georgian data protection law, which is aligned with GDPR. What we do not carry is thirty years of software sediment.

The catch is that effectively nobody here builds on FHIR. The software on the market is dated across the board: international systems that do not fit this market, and local systems designed long before FHIR existed and never meant to be read by anything except themselves. No standard is shared even between two hospitals in the same city. Georgian is also a low-resource language for today's models, and unstructured clinical data on top of that makes already-hard medical AI tasks harder still. None of this is specific to Georgia; it is the reality across the region.

Georgia is a spectacular place to prove out AI-native healthcare and a difficult place to build the substrate one runs on. We wanted the first badly enough to go do the second.

## Why FHIR from the beginning

The standard advice was to sit on top of the incumbent systems and ship features. We solved the substrate instead, and not by building another system of record that would age into the same legacy everyone else is stuck with. AI is only ever as good as what it can see, and a hospital storing its data across forty proprietary schemas can never hand a model a whole patient. It can only hand it fragments.

So [FHIR R4](/docs/fhir-basics) became our operational data model, not an interoperability layer bolted to the edge of the system. A lab result is an [Observation](/docs/api/fhir/resources/observation) when the analyzer produces it, when the ward reads it, when our models reason over it, and when the insurer receives it. There is no separate internal representation we translate out of on the way to an API.

Nobody made us do this, and that is unusual enough to say out loud. In the US, FHIR mostly arrives as a compliance requirement, which is why so many engineers there treat it as a tax. There is no Georgian FHIR mandate, and no regulator here was ever going to ask us for it. We adopted it because it was the best available data model for the product we wanted to build.

FHIR also solved the language problem in a way we did not anticipate. When the structure is standard, the model already knows what an Observation is, what a [MedicationRequest](/docs/api/fhir/resources/medicationrequest) is, where to look and what to expect. The structure carries the meaning and Georgian only has to carry the free text. A low-resource language stopped being a compounding penalty. Medplum's [multilingual support](/docs/fhir-datastore/multilingual-support) means the same record serves our Georgian, Russian and English interfaces without a separate translation layer.

![MediMind patient overview: allergies, active problems, vitals and risk scores on one FHIR-backed chart, rendered in Georgian](/img/blog/medimind-patient-overview.jpg)

## Why Medplum

We did not want to spend two years writing a FHIR server. We wanted to spend them writing the hospital.

That is most of the reason, and the list of what we skipped is long: [FHIR search](/docs/search/basic-search) and [chained search](/docs/search/chained-search), [transactions](/docs/fhir-datastore/fhir-batch-requests), version history and [AuditEvent](/docs/api/fhir/resources/auditevent), [SMART on FHIR authorization](/docs/access/smart-scopes), [role-based access control](/docs/access/access-policies), [subscriptions](/docs/subscriptions), [binary storage](/docs/api/fhir/resources/binary), [terminology](/docs/terminology), [bulk export](/docs/api/fhir/operations/bulk-fhir). Every one of those is real engineering that no clinician ever sees, and all of it stood between us and the first useful thing we could put in front of a technician.

What we did not appreciate at the time is how much the deployment flexibility would matter. Medplum [self-hosts](/docs/self-hosting) as naturally as it runs in the cloud, so when our anchor customer needed the entire stack on their own hardware, that was a configuration choice and not a second architecture.

We now have [80+] FHIR resource types in production. Every department we have added since (lab, pharmacy, imaging, beds, [billing](/docs/billing), HR, ministry reporting) has been a vocabulary, not an architecture. That is why a team this small can cover a hospital.

![Figure 1: MediMind production architecture. Medplum at the storage and API layer, MediMind's departments above it.](/img/blog/medimind-architecture.png)

_Figure 1: MediMind production architecture. Medplum at the storage and API layer, MediMind's departments above it._

## Where we are

Thirteen months from idea to a counter-signed contract with a 25-hospital network. Most healthcare startups spend thirteen months getting a pilot scheduled.

- A 25-hospital network under contract, with the first modules live in production
- AI tools in daily clinical use since May 2025
- About 1.1 million patients [migrated into FHIR](/docs/migration/convert-to-fhir)
- Roughly 3.1 million visits and 3.7 million clinical observations behind them
- [80+] FHIR resource types in production, ~2,200 files, 70+ shipped features
- A 150,000 GEL grant from GITA, Georgia's Innovation and Technology Agency
- Among the first companies in the country granted innovative startup status, with the associated tax exemptions. We were the fifth.
- Two founders and an AI code factory

![MediMind administrative modules: 65 modules across clinic operations, warehouse, financial, command center and analytics, one codebase](/img/blog/medimind-admin-modules.jpg)

## Modernizing a hospital that never stops

A hospital laboratory does not stop. There is no maintenance window for a blood count, so we never asked for one. Every analyzer reported to two places at once, to us and to the incumbent, in the exact shape the old system already expected. The incumbent never noticed it had company, not one technician changed a habit, and for the entire migration rolling back was a decision we could execute in well under a minute.

The hospital handed us a virtual machine and an SSH key on a Friday and the stack was live the next day. Fifteen analyzer lines were live within three weeks of a standing start, over [HL7 v2 interfacing](/docs/integration/hl7-interfacing) and ASTM. That is work that gets quoted in quarters here. One junior engineer on site was enough for the on-premise wiring; the rest was done over SSH from a desk in Tbilisi. [Imaging](/docs/labs-imaging) went in the same way, and a CT study now moves from scanner to archive to FHIR to viewer without a step where somebody retypes anything.

Then we spent a week standing in that laboratory, writing down every complaint and every wish. Several of them went from a sentence said out loud to running in production the same day. By the third time that happened, the technicians stopped asking carefully.

![Figure 2: Laboratory task board. Analyzer results arriving as Observation and DiagnosticReport.](/img/blog/medimind-lab-queue.jpg)

_Figure 2: Laboratory task board. Analyzer results arriving as Observation and DiagnosticReport._

![Figure 3: Imaging viewer, CT study.](/img/blog/medimind-pacs-3d.jpg)

_Figure 3: Imaging viewer, CT study._

## Open source is a procurement argument

The objection we meet in this market is not technical. Hospitals here have watched their own data become hostage to vendors they do not even hold a contract with. Being able to say "you can see the server you are running, and your data is yours in a standard format", and then prove it at the storage layer, closes conversations that a feature list does not. Building on a recognized FHIR platform also shortens the "are these people serious" conversation with hospital IT by about a meeting and a half.

There is a real trade here and we would make it again. Self-hosting means we own upgrades, patching, and backups, and we take new Medplum releases after a soak instead of on day zero. For a regulated on-premise hospital deployment, that is the right side of it.

## Why the AI works

It never reads a lab result on its own. It reads the patient. The result sits beside the medication, the imaging, the admission, and the entire history, all in one place and one format. A patient handed to you in fragments can only be reasoned about in fragments, and that is the ceiling every AI layer stacked on top of a stitched-together hospital eventually hits. No amount of model quality raises it.

Structure is also what makes proactive possible. Healthcare AI today is mostly reactive: you ask it something and it answers. We are building the opposite, a system that notices deterioration before any single department would see the pattern and then coordinates the hospital around it: surfacing the right labs, alerting the right specialist, checking the drug is in stock, flagging the bed, and catching the billing requirement while care is still happening. [Subscriptions](/docs/subscriptions) and [bots](/docs/bots) let that run as events instead of as a nightly batch.

Structure is also what lets us do it safely. Anything our AI produces goes into its own report, permanently marked preliminary and permanently coded as AI-generated, and never merged into the clinical conclusion. The AI flags and clinicians decide, and the data model does not let the two blur. The same [access policies](/docs/access/access-policies) and audit trail that govern a clinician govern the AI.

![Figure 5: Patient hub with AI-generated preliminary findings and CDS alerts.](/img/blog/medimind-clinical-dashboard.jpg)

_Figure 5: Patient hub with AI-generated preliminary findings and CDS alerts._

## Where MediMind is headed

Near-term, network-wide go-live. Georgia is the first step because it accumulates evidence quickly, and that evidence is what we intend to take global.

A hospital today runs on something like forty systems. One will run them tomorrow, and it will not be forty systems with AI bolted on top.

## References

- [MediMind](https://medimind.md/)
- [MediMind / Medplum case study video](https://youtu.be/v7lRW_ZYDmc)
- [Medplum FHIR Datastore](/docs/fhir-datastore)
- [Medplum Self-Hosting](/docs/self-hosting)
- [Medplum HL7 Interfacing](/docs/integration/hl7-interfacing)
- [Medplum Bots](/docs/bots) and [Subscriptions](/docs/subscriptions)
- [Medplum Migration Guide](/docs/migration)
- [Medplum AI](/docs/ai)
