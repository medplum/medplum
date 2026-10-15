## Usage

FamilyMemberHistory is one of the [event](https://www.hl7.org/fhir/workflow.html#event) resources in the FHIR [workflow](https://www.hl7.org/fhir/workflow.html) specification.

This resource records significant health conditions for a particular individual related to the subject. This information can be known to different levels of accuracy. Sometimes the exact condition ('asthma') is known, and sometimes it is less precise ('some sort of cancer'). Equally, sometimes the person can be identified ('my aunt Agatha') and sometimes all that is known is that the person was an uncle.

This resource represents a simple structure used to capture an 'elementary' family history for a particular family member. However, it can also be the basis for capturing a more rigorous history useful for genetic and other analysis - refer to the [Genetic Pedigree](https://www.hl7.org/fhir/familymemberhistory-genetic.html) profile for an example.

The entire family history for an individual can be represented by combining references to **FamilyMemberHistory** instances into a [List](/docs/api/fhir/resources/list) resource instance.
