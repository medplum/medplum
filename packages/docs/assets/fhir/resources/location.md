## Usage

A [Location](/docs/api/fhir/resources/location) includes both incidental locations (a place which is used for healthcare without prior designation or authorization) and dedicated, formally appointed locations. [Locations](/docs/api/fhir/resources/location) may be private, public, mobile or fixed and scale from small freezers to full hospital buildings or parking garages.

Examples of [Locations](/docs/api/fhir/resources/location) are:

- Building, ward, corridor, room or bed
- Mobile Clinic
- Freezer, incubator
- Vehicle or lift
- Home, shed, or a garage
- Road, parking place, a park
- Ambulance (generic)
- Ambulance (specific)
- Patient's Home (generic)
- Jurisdiction

These locations are not intended to cover locations on a patient where something occurred (i.e. a patient's broken leg), but can happily cover the location where the patient broke the leg (the playground)

## Relationships

[Locations](/docs/api/fhir/resources/location) and [Organizations](/docs/api/fhir/resources/organization) are very closely related resources and can often be mixed/matched/confused.  
The [Location](/docs/api/fhir/resources/location) is intended to describe the more physical structures managed/operated by an organization, whereas the [Organization](/docs/api/fhir/resources/organization) is intended to represent the more conceptual hierarchies, such as a ward.

A [Location](/docs/api/fhir/resources/location) is valid without an address in cases where it could be purely described by a geo-coded location in remote areas, or when recorded by a device. [Locations](/docs/api/fhir/resources/location) with a mode = "kind" would also likely not have an address, as they are just a type of location, but could also have an address where they can be found at the address.

Another use of location could be for describing a Jurisdiction. This jurisdiction may be considered a classified boundary which could be a combination of a physical boundary, and some other discriminator(s):

- Nation - Country-wide community or Federal Government (Ministry of Health)
- Province or State (community or Government)
- Business (throughout an enterprise)
- Business scope (CDC/FDA)
- Business segment (UK Pharmacy)
