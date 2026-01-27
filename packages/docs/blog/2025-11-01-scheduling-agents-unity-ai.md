---
slug: scheduling-agents-unity-ai
title: 'Scheduling Agents for Healthcare Operations: A Deep Dive with Unity AI'
authors: codyhall
tags: [community]
---

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo" title="Scheduling Agents for Healthcare Operations: A Deep Dive with Unity AI" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

*Slideshow: [View Presentation](https://drive.google.com/file/d/1t4h8IthpimQlayRz6j5lyOuuMpYFHT0b/view?usp=sharing)*

This is a transcript summary of the October 2025 webinar with Medplum and Unity AI.  Medplum CEO Reshma Khilnani interviews Unity AI CTO [Cody Hall](https://www.unityai.co/about/our-team).

**Reshma:** We recently hosted a webinar exploring the intersection of AI, healthcare operations, and open-source infrastructure. I was joined by Cody Hall, CTO and Co-Founder of Unity AI, to discuss how his team is solving one of healthcare's **most persistent bottlenecks**: scheduling, using AI Agents.

<!-- truncate -->

**Reshma:** At Medplum, we often talk about the "terrible choice" healthcare developers face: invest heavily to build from scratch or fight with rigid, off-the-shelf software. Unity AI demonstrates **a third path**—building exceptional products on top of pre-built primitives. Here is a recap of how Unity AI is using Medplum and `FHIR` to coordinate scarce resources.

## The Core Problem: Coordination and Scarcity

**Cody:** Healthcare operations are fundamentally about **the coordination of scarce resources**—staff, equipment time, and physical space. While clinical algorithms for treatment are well-established, the logistics of getting the right patient to the right place at the right time remains a massive challenge.

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo?start=740" title="Complex Scheduling Solutions" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

**Cody:** Currently, this coordination is driven by **human-to-human negotiation**. A scheduler might make ten phone calls to confirm a single appointment. If a patient doesn't pick up, that scheduler rarely has the time to immediately find a backfill. The result is unused capacity, lost revenue for the clinic, and, most importantly, delayed care for patients.

**Cody:** Our thesis is that voice agents represent a solution to this communication constraint. Unlike humans, AI agents are **infinitely scalable**. They can react instantly to cancellations, reach more people simultaneously, and continuously work to fill schedule gaps.


## The Role of Data Standardization (FHIR)

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo?start=430" title="Data Standardization in Healthcare" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

**Cody:** Automation requires **a high-fidelity representation of reality**. Dr. Herbert Simon once said that decision-makers can "satisfice" by finding optimum solutions for a simplified world or satisfactory solutions for a more realistic world. `FHIR` allows us to find solutions for the realistic world because it lets us model complex relationships without oversimplifying.

**Cody:** A practical example of this is the `RelatedPerson` resource in `FHIR`. In a pediatric context, the patient is rarely the person coordinating the appointment. For example, if a parent is scheduling dental cleanings for two children, do you treat this as two separate tasks and call the parent twice? Or do you query the `RelatedPerson` resource, identify that one contact manages both appointments, and **consolidate the communication**?

**Reshma:** This is a really subtle but important point. At Medplum, we see this constantly with pediatrics and elder care on the platform. Noting down the `RelatedPerson` is critical for caregiver access. It is excellent to see an agent that actually **respects this data model** to reduce friction for the family.

## Architecture: Systems of Action

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo?start=900" title="Technical Architecture & Tools" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

**Cody:** We use Medplum not just as a data store, but as a foundation for **a "system of action."** We model a confirmation request as a `FHIR` `Bundle` containing the `Appointment`, `Patient`, and `Organization`.

**Cody:** Once that bundle hits our API, a subscription in Medplum triggers our application. We use a durable workflow engine to spin up a voice agent. That agent calls the patient, verifies identity (like checking Date of Birth), and confirms the slot. The agent then **updates the `Task` and `Appointment` status in Medplum in real-time**.

**Cody:** Because Medplum handles the identity management and event-driven architecture, we can **focus entirely on the logic of the scheduling agents** rather than building boilerplate infrastructure.

## The Future: The Distributed EHR

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo?start=1150" title="Future of EHRs & Scheduling" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

**Cody:** Historically, EHRs were monolithic systems like Magic MUMPS. If you needed a specific feature, you hoped your vendor built it. Today, we are moving toward composability. I see a future of **"Distributed EHRs,"** where Medplum acts as a headless backend allowing specialized vertical applications—like Unity AI for scheduling—to sit on top of a shared data layer.

**Reshma:** We agree completely. We believe customization is required to be successful, and monolithic systems often fail to yield to specific workflows like infusion or complex radiology. The composability of this architecture allows for **"best-of-breed" solutions** to work together seamlessly through standard APIs.


## Community Q&A Highlights

<div className="responsive-iframe-wrapper">
  <iframe width="560" height="315" src="https://www.youtube.com/embed/pbiJRr1GxDo?start=1920" title="Q&A Session" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</div>

**Cody:** During the Q&A, we discussed how referrals are handled. In our system, referrals are modeled as a `ServiceRequest`. We pick up that request and generate the downstream communication workflows to ensure the patient is scheduled, **closing the loop between providers**.

**Reshma:** We also discussed the role of Bots. In Medplum, **Bots effectively act as server-side functions**. Whether verifying insurance with a partner like Stedi or triggering a custom workflow, Bots provide the logic layer that connects static data to active processes.

**Cody:** Finally, regarding data storage, the consensus is to **keep data in `FHIR` whenever possible**. While there is always a temptation to use a separate SQL database for app-specific config, keeping data in `FHIR` ensures interoperability and allows for powerful graph queries via `GraphQL` across the entire patient context.

---

*To learn more about Unity AI, visit [UnityAI.com](https://unityai.com).*


