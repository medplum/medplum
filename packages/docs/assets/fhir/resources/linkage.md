## Usage

This resource allows the assertion of linkages between multiple resource instances (generally of the same type) that are referring to the same underlying business objects. For example, multiple [Condition](/docs/api/fhir/resources/condition) records that refer to the same underlying problem/issue for a [Patient](/docs/api/fhir/resources/patient); multiple [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance) records that refer to the same reaction susceptibility; multiple [Patient](/docs/api/fhir/resources/patient), [Practitioner](/docs/api/fhir/resources/practitioner) and/or [RelatedPerson](/docs/api/fhir/resources/relatedperson) records that refer to the same human being or animal.

FHIR supports a process for sharing electronic records. It is common for multiple records to exist that deal with the same real-world phenomenon. This can result from information being captured by different systems, information being captured within a single system by different users (either deliberately to represent distinct perspectives or accidentally when a new record is created rather than updating an existing record). These multiple records may be referred to as "duplicate" records, but in practice they aren't often actually "duplicate" in that the data represented (and the history of the records) will be at least somewhat distinct.

In some cases, the solution after identifying duplicates is to deprecate one of the records (e.g. by changing the status to "Entered in Error") and to move all relevant information to the surviving record. In other cases, the resource may support the ability to establish a linkage directly between the resources. However, in some cases, both records may need to survive or there might be a desire to have both resources continue to be maintained, perhaps because the resources live on different servers or have different 'owners'. The **Linkage** resource is intended to satisfy this use-case.

## Relationships

The [Person](/docs/api/fhir/resources/person) resource should be used to link a person independent of a specific health-related context. [Linkage](/docs/api/fhir/resources/linkage) can be used for all other use cases.
