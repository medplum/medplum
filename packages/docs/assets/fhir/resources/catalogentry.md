## Usage

The [CatalogEntry](/docs/api/fhir/resources/catalogentry) resource (formally known as EntryDefinition) allows additional information specification for items that may be found in the following types of clinical collections, including but not limited to:

- A pharmacy formulary
- A laboratory compendium
- A radiology compendium of exams that may be ordered
- A dietary nutrition order catalog
- A supply charge master
- A CDS catalog of knowledge artifacts

The Catalog profile of the [Composition](/docs/api/fhir/resources/composition) resource is used to organize catalog entries.

Catalogs are composed of nestable sections which contain catalog entries. Catalog entries wrap the items that are orderable or selectable in a catalog and any other required supporting entries. Examples of information provided by [CatalogEntry](/docs/api/fhir/resources/catalogentry) includes whether the status of the item in the catalog is "active", "inactive", "legacy", or "informative" or whether the item is an orderable item in the context of this catalog (or catalog section). the relation between the item and other items ("contains", "includes", "requires"). Catalog entries also support relationships to other catalog entries such as whether a product is now replaced by another product in a product catalog. Please refer to the Boundaries and Relationships part of this document for more information on the topic.

## Relationships

This [CatalogEntry](/docs/api/fhir/resources/catalogentry) resource wraps and contextualizes definitional items that make up a catalog such as the following resources:

- [Medication](/docs/api/fhir/resources/medication)
- [Device](/docs/api/fhir/resources/device)
- [Activity Definition (including laboratory service definitions)](/docs/api/fhir/resources/activitydefinition)
- [Specimen Definition](/docs/api/fhir/resources/specimendefinition)
- ...

It is important to note that [CatalogEntry](/docs/api/fhir/resources/catalogentry) shall not specify attributes that are pertinent to the item that it wraps if those attributes hold true regardless of the catalog context. For instance, a catalog entry should generally not provide attributes to describe the hierarchical relationship of an item to other items (e.g., drug class or other such ontological relationships) since that information holds outside of the context of a catalog and thus should reside in the referenced item itself. A catalog entry may, however, specify a status of a given item **_in the context of the catalog_** such as whether that item is orderable a given institution or context. Catalog entries can also be related to one another. Here again, it is important to note that only relationships that hold within the context of a catalog and not generally for the item referenced by the catalog entry should be considered. For instance, in the context of a given laboratory service compendium, a laboratory order may be preferred over other laboratory orders. The other laboratory orders in this use case may thus be related to the preferred test using an 'is-replaced-by' relationship and assigned a new status of 'retired'. Other definitional relationships such as the specimen or expected input and output observation definitions associated with a particular laboratory test, relationships that generally hold outside of a laboratory catalog context, should reside at the level of the definitional resource itself. That is, laboratory tests often state the required input observation specifications, the format of the expected observation output, and the attributes of the required specimen and such relationships are probably best described outside of the [CatalogEntry](/docs/api/fhir/resources/catalogentry) within the referenced item.
