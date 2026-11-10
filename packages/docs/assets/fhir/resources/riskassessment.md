## Usage

**This resource is an _event_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Event](https://www.hl7.org/fhir/workflow.html#event).

This resource captures predicted outcomes for a patient or population on the basis of source information. Examples include:

- A prognosis statement for a particular condition
- Risk of health outcome (heart attack, particular type of cancer) on the basis of lifestyle factors and/or family history
- List of potential health risks based on a patient's genetic analysis
- A prediction of outbreak infection rates within a geography based on immunization rates

This resource can be used to represent the results of formal scoring/decision support tools that evaluate risk. It can also be used to capture a practitioner's subjective assessment of the patient's risk based on existing knowledge and previous experience.

## Relationships

Risk assessments are a specialized type of observation. A specialized resource is used to provide a simpler mechanism to capture of a series of risks and to associate those risks with time-ranges, probabilities, etc. All risk assertions are captured at one time based on a single set of source inputs. Capture of a single risk MAY be done using the [Observation](/docs/api/fhir/resources/observation) class, particularly in circumstances where it's treated as a generic observation, but for consistency, all risk assessments and prognosis SHOULD be captured using **RiskAssessment**.

Risk assessments may be based on a variety of factors, including:

- Basic demographic information from the [Patient](/docs/api/fhir/resources/patient) or [Group](/docs/api/fhir/resources/group) resources
- Various [Observations](/docs/api/fhir/resources/observation) including vital signs, lab information, assessments, genetic information, etc.
- [FamilyMemberHistory](/docs/api/fhir/resources/familymemberhistory)
- Current, past and proposed therapies [Immunization](/docs/api/fhir/resources/immunization), [Procedure](/docs/api/fhir/resources/procedure), [CarePlan](/docs/api/fhir/resources/careplan), etc.

Because so many resources can potentially be used, no limit is placed on what resources can be sent in `RiskAssessment.basis`. However, some resources would be nonsensical for this use (e.g. [MessageHeader](/docs/api/fhir/resources/messageheader)).

**AllergyIntolerance and [RiskAssessment](/docs/api/fhir/resources/riskassessment)**

[AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance) describes a specific type of risk - propensity to reaction to a substance while [RiskAssessment](/docs/api/fhir/resources/riskassessment) describes general risks to a subject, not generally based on a reaction.

## Background and Context

Risk Assessments can be determined manually by health-care providers based on their professional expertise, by using an algorithmic scoring system or through a combination. Risk assessments can also be computed by decision support systems. [OperationDefinitions](/docs/api/fhir/resources/operationdefinition) may be defined by servers to generate risk assessments based on particular combinations of source resources or other inputs.
