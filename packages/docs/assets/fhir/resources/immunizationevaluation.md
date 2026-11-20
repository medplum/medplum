## Usage

The [ImmunizationEvaluation](/docs/api/fhir/resources/immunizationevaluation) resource is intended to cover communicating the results of an evaluation of a vaccine administration event (documented using the [Immunization](/docs/api/fhir/resources/immunization) resource) against a set of published recommendations (protocols). Evaluating administered doses in a patient's immunization history is central to ensuring that the patient if fully protected against vaccine-preventable diseases. It is also a necessary prerequisite to generating a customized set of immunization recommendations for the patient.

## Relationships

The [ImmunizationEvaluation](/docs/api/fhir/resources/immunizationevaluation) resource communicates the results of an evaluation of an instance of the [Immunization](/docs/api/fhir/resources/immunization) resource relative to a set of published recommendations. It is intended to communicate if the vaccine administration event was "valid" or "not valid" relative to the recommendations. Once all vaccine administration events in a patient's record have been evaluated, it is then possible to generate a set of vaccination related recommendations, unique for the patient. These recommendations are communicated using the ImmunizationRecommedation resource.

As the [ImmunizationEvaluation](/docs/api/fhir/resources/immunizationevaluation) resource is focused on the evaluation of a single vaccine administration event, it does not include data regarding the overall patient status relative to the recommendations used in the evaluation. For example, a total of 3 doses of hepatitis B vaccine may be required for patient protection, but an instance of the [ImmunizationEvaluation](/docs/api/fhir/resources/immunizationevaluation) resource will be concerned with only one of the doses (although other instances of [ImmunizationEvaluation](/docs/api/fhir/resources/immunizationevaluation) should exist for the other doses). The [ImmunizationRecommendation](/docs/api/fhir/resources/immunizationrecommendation) resource is used to convey the overall patient status (eg. a dose is due or the patient is complete) relative to the hepatitis B series.

## Background and Context

Through FHIR Release 3, the [Immunization](/docs/api/fhir/resources/immunization) resource contained a "protocol" backbone element which functioned as an evaluation of the vaccine administration event. Beginning in Release 4, this new resource replaces the [Immunization](/docs/api/fhir/resources/immunization).protocol element.
