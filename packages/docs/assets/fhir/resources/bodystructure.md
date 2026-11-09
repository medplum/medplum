## Usage

The [BodyStructure](/docs/api/fhir/resources/bodystructure) resource contains details about the anatomical location of a specimen or body part, including patient information, identifiers, as well as text descriptions and images. It provides for the addition of qualifiers such as laterality and directionality to the anatomic location for those use cases where precoordination of codes is not possible. The [BodyStructure](/docs/api/fhir/resources/bodystructure) resource supports recording and tracking of an anatomic location or structure on a patient outside the context of another resource. For example it can be the target of a [Procedure](/docs/api/fhir/resources/procedure) resource or [Observation](/docs/api/fhir/resources/observation) resource.

## Relationships

The [BodyStructure](/docs/api/fhir/resources/bodystructure) resource is not intended to substitute for precoordination of codes. If precoordination of codes is supported by an implementation the codeableConcept should be used. This resource is not intended for describing the type of anatomical location but rather a specific body site on a specific patient.
