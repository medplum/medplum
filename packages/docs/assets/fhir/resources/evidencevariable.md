## Usage

**This resource is a _definition_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Definition](https://www.hl7.org/fhir/workflow.html#definition).

The scope of the [EvidenceVariable](/docs/api/fhir/resources/evidencevariable) resource is to describe a "PICO" element that knowledge (evidence, assertion, recommendation) is about. PICO stands for: [Population](/docs/api/fhir/datatypes/population) - the population within which exposures and outcomes are being considered Intervention - the conditional state or exposure state being described for which one is expressing the risk of or effect on an outcome Comparison - the alternative conditional state or alternative exposure state when one is comparing states for the effect on an outcome Outcome - the result or effect of an intervention or exposure in a population PICO (and its variants like PECO or PICOT) is a universal acronym used in evidence-based medicine communities to clearly express research questions and evidence findings. The [EvidenceVariable](/docs/api/fhir/resources/evidencevariable) resource allows expression of the components of a PICO question in codeable and reusable formats.

## Relationships

Multiple resources describing evidence findings (Evidence, [EffectEvidenceSynthesis](/docs/api/fhir/resources/effectevidencesynthesis), EffectEvidenceBit, [RiskEvidenceSynthesis](/docs/api/fhir/resources/riskevidencesynthesis), RiskEvidenceBit) will reference [EvidenceVariable](/docs/api/fhir/resources/evidencevariable) to describe what the evidence findings are about.
