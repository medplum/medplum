---
sidebar_position: 0
---

# Build with AI on Medplum

## The Reality of Healthcare AI

> _The barrier to production isn’t the AI model; it’s the lack of a secure, auditable foundation for healthcare data._

AI capabilities are improving quickly, and many applications in healthcare are now practical. Models can summarize clinical text, assist with documentation, and support analysis across large datasets.

Healthcare, however, places constraints on AI that do not exist in most other industries. Systems handle protected health information, support regulated workflows, and influence clinical decisions. AI must be secure, auditable, and safe by design.

Most healthcare AI efforts struggle not because of model quality, but because the foundations are weak. Data access is inconsistent, permissions are unclear, and integrations rely on manual processes or fragile pipelines. This is why many promising prototypes fail to reach production.

Sustainable healthcare AI depends on getting the basics right: structured data, reliable interfaces, explicit access controls, and interoperability with the healthcare ecosystem.

## Healthcare AI Is an Infrastructure Problem

> _Reliable AI requires a platform that treats data access, standardization, and security as core infrastructure rather than afterthoughts._

In practice, healthcare AI is an infrastructure problem. AI systems retrieve data, trigger workflows, and interact with users and external systems. Their reliability and safety depend on the platform they run on.

Many organizations try to build this infrastructure in-house and get buried by a “maintenance tax.” Custom HL7 mapping, HIPAA/SOC 2 controls, and proprietary schemas create ongoing operational load that slows down actual AI development.

Across real deployments, four requirements consistently matter:

- **Programmatic Data Access:** AI systems need complete access through stable APIs. Partial integrations and one-off exports do not scale.
- **Standardized Data Models:** Healthcare data must be structured consistently. Standards reduce ambiguity and support interoperability over time.
- **Explicit Guardrails:** AI must operate within defined permissions. It should be possible to specify what an automated system can read, suggest, or change.
- **Built-In Interoperability:** AI depends on labs, medications, billing, and messaging. Without native interoperability, AI remains limited.

Medplum is designed as a healthcare developer platform with these requirements in mind, allowing teams to focus on clinical logic rather than rebuilding basic plumbing.

## API-First by Design: Why AI Needs Programmatic Access

> _AI can only automate what it can access; true programmatic interfaces eliminate the fragile “integration phase” that kills most projects._

AI systems depend on reliable programmatic access to data. They retrieve information, evaluate context, and trigger workflows continuously—not through manual exports or periodic batch jobs.

Many systems describe themselves as “API-enabled,” but APIs are often incomplete, inconsistent, or secondary to the user interface. Important data may only be accessible through internal workflows or manual intervention.

Medplum is API-first by design. All core functionality is exposed through documented APIs, with no separate internal pathways. This has practical consequences:

- AI systems can access the full clinical and operational context they need
- Automation does not depend on fragile UI-driven processes
- Background jobs and agents are straightforward to implement
- The same foundations used to build applications are used to build automation and AI workflows

## Why FHIR Matters for AI (More Than People Realize)

> _FHIR provides the predictable, semantically rich structure that allows modern LLMs to reason about clinical data with high accuracy._

Over the past decade, the healthcare industry has converged on FHIR as the common language for clinical data exchange. For AI, standardized structure matters. Models perform best when data is predictable, semantically rich, and consistently shaped.

Because FHIR is a global standard, modern language models are already familiar with its structures and terminology through extensive documentation and real-world usage. This makes it easier for AI systems to reason about healthcare data without relying on brittle, organization-specific schemas.

FHIR also provides a clear target for AI-driven data extraction. Many healthcare inputs—clinical notes, scanned documents, faxes, and messages—are unstructured by nature. AI systems are increasingly effective at transforming this information into structured representations. When those outputs map cleanly into FHIR resources, the result is data that can be validated, audited, and reused across workflows.

This contrasts with proprietary models, where design shortcuts—such as hard-coded enums—become liabilities as systems scale. FHIR’s value is stability.

## Guardrails Are Not Optional: Building Safe AI in Healthcare

> _Responsible AI depends on fine-grained permissions that treat automated agents with the same rigorous access controls as human clinicians._

Unlike traditional software, AI-driven workflows can make suggestions or initiate actions based on probabilistic reasoning. Without explicit guardrails, this creates unacceptable risk. A common pattern is **“can suggest, but not act.”** An AI may draft a note or recommend an order, while a human remains responsible for the final action.

Supporting this requires permissions that are precise, enforceable, and auditable. In Medplum, an AI agent is governed by the same policy framework as a human user. Every action taken by an AI system is captured in a FHIR-standard `AuditEvent` log, providing a verifiable record of what data it accessed and what it suggested—critical for clinical safety and regulatory compliance.

## Open Source Makes AI Practical

> _AI systems work best when the platform they operate on is transparent, well-documented, and widely understood._

Open source provides a practical advantage for healthcare AI that is often overlooked.

Modern language models are trained on public codebases, documentation, and examples. Because Medplum is open source, its APIs, data models, and architectural patterns are already familiar to these systems. This makes it easier for AI tools to generate correct integrations, follow established best practices, and avoid unsafe assumptions.

This transparency also benefits human developers. Teams can inspect how the platform works, understand how data flows, and reason about system behavior without relying on opaque abstractions or proprietary tooling.

In healthcare AI, where correctness and auditability matter, this matters more than speed alone. Open source reduces guesswork, improves debuggability, and makes both human and automated systems easier to trust.

## Interoperability Is the Difference Between a Demo and Production

> _To move beyond isolated demos, AI must be able to trigger actions across the entire ecosystem—from labs and pharmacy to billing and messaging._

Most healthcare AI systems work well in isolation, looking impressive in demos but stalling in real clinical environments. Real healthcare AI must interact with labs, medications, billing systems, and external partners.

Point solutions struggle because they are built around a single data source and rely on custom integrations to reach everything else. Medplum functions as an interoperability hub, providing a unified data model and direct integration with HL7 v2, DICOM, and other industry standards.

When interoperability is built into the platform, AI systems are not confined to isolated use cases; they can participate in the end-to-end workflows that define success in production.

## What This Enables in Practice

> _Industry leaders like Rad AI and Unity AI use Medplum to bypass infrastructure builds and go straight to scaling AI-driven clinical workflows._

API-first design, standardized data, strong guardrails, and deep interoperability enable classes of AI systems that are otherwise difficult to build safely.

- [Rad AI](/blog/radai-case-study): Builds tools that help radiologists by automating documentation and surfacing clinical context. By using Medplum for underlying infrastructure, they can focus on AI differentiation. They now support more than half of all U.S. medical imaging providers.
- [Unity AI](/blog/scheduling-agents-unity-ai): Uses AI-driven agents to handle tens of thousands of patient outreach calls daily. Because Medplum integrates clinical data, scheduling, and messaging, Unity AI can operate agents across multiple systems without stitching together fragile point integrations.

## A Foundation, Not a Bet on a Single Model

> _Models and regulations will change, but a foundation built on open standards ensures your AI strategy remains durable and adaptable._

AI models will continue to change; capabilities will improve and costs will shift. What should not change is the foundation those systems are built on.

In healthcare, long-term success depends on platforms that are stable, interoperable, and designed with safety in mind. Medplum focuses on durable infrastructure: standardized data, comprehensive APIs, and strong access controls. This allows organizations to adopt new AI capabilities as they mature—without repeatedly re-architecting their core systems.

## AI Solutions with Medplum

Medplum helps you put AI to work on real-world problems. Whether you're structuring clinical notes or extracting key data from faxes, Medplum is the platform that makes it possible.

Explore our dedicated integrations to learn more:

- **[Medplum `$ai` ](/docs/ai/ai-operation):** The FHIR-compliant operation for integrating with large language models (LLMs) and enabling conversational AI within healthcare applications.
- **[Medplum AI (MCP)](/docs/ai/mcp):** Connect with Medplum's MCP integration to enable AI models to securely access and interact with healthcare data using FHIR standards.
- **[AWS Textract](/docs/ai/aws):** Extract and analyze text from clinical documents, faxes, and other unstructured data sources.
- **[AWS Comprehend Medical](/docs/ai/aws):** Uncover valuable insights from clinical text, identifying medical conditions, medications, and treatments.

Ready to see how Medplum can accelerate your AI journey? Get started with our documentation and a code example today.
