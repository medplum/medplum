Refer to the [US Core CarePlan profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-careplan.html).

## Usage

CarePlan is one of the [request](https://www.hl7.org/fhir/workflow.html#request) resources in the FHIR [workflow](https://www.hl7.org/fhir/workflow.html) specification.

Care Plans are used in many areas of healthcare with a variety of scopes. They can be as simple as a general practitioner keeping track of when their patient is next due for a tetanus immunization through to a detailed plan for an oncology patient covering diet, chemotherapy, radiation, lab work and counseling with detailed timing relationships, pre-conditions and goals. They may be used in veterinary care or clinical research to describe the care of a herd or other collection of animals. In public health, they may describe education or immunization campaigns.

This resource takes an intermediate approach to complexity. It captures basic details about who is involved and what actions are intended without dealing in discrete data about dependencies and timing relationships. These can be supported where necessary using the extension mechanism.

The scope of care plans may vary widely. Examples include:

- Multi-disciplinary cross-organizational care plans; e.g. An oncology plan including the oncologist, home nursing staff, pharmacy and others
- Plans to manage specific disease/condition(s) (e.g. nutritional plan for a patient post bowel resection, neurological plan post head injury, pre-natal plan, post-partum plan, grief management plan, etc.)
- Decision support generated plans following specific practice guidelines (e.g. stroke care plan, diabetes plan, falls prevention, etc.)
- Self-maintained patient or care-giver authored plans identifying their goals and an integrated understanding of actions to be taken

This resource can be used to represent both proposed plans (for example, recommendations from a decision support engine or returned as part of a consult report) as well as active plans. The nature of the plan is communicated by the status. Some systems may need to filter [CarePlans](/docs/api/fhir/resources/careplan) to ensure that only appropriate plans are exposed via a given user interface.

## Relationships

For simplicity's sake, [CarePlan](/docs/api/fhir/resources/careplan) allows the inline definition of activities as part of a plan using the `activity.detail` element. However, activities can also be defined using references to the various "request" resources. These references could be to resources with a status of "planned" or to an active order. It is possible for planned activities to exist (e.g. appointments) without needing a [CarePlan](/docs/api/fhir/resources/careplan) at all. [CarePlans](/docs/api/fhir/resources/careplan) are used when there's a need to group activities, goals and/or participants together to provide some degree of context.

[CarePlans](/docs/api/fhir/resources/careplan) can be tied to specific [Conditions](/docs/api/fhir/resources/condition), however they can also be condition-independent and instead focused on a particular type of care (e.g. psychological, nutritional) or the care delivered by a particular practitioner or group of practitioners.

An [ImmunizationRecommendation](/docs/api/fhir/resources/immunizationrecommendation) can be interpreted as a narrow type of [CarePlan](/docs/api/fhir/resources/careplan) dealing only with immunization events. Where such information could appear in either resource, the immunization-specific resource is preferred.

[CarePlans](/docs/api/fhir/resources/careplan) represent a specific plan instance for a particular patient or group. It is not intended to be used to define generic plans or protocols that are independent of a specific individual or group. [CarePlan](/docs/api/fhir/resources/careplan) represents a specific intent, not a general definition. Protocols and order sets are supported through [PlanDefinition](/docs/api/fhir/resources/plandefinition).
