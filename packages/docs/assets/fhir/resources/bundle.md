## Usage

One common operation performed with resources is to gather a collection of resources into a single instance with containing context. In FHIR this is referred to as "bundling" the resources together. These resource bundles are useful for a variety of different reasons, including:

- Returning a set of resources that meet some criteria as part of a server operation (see [RESTful Search](https://www.hl7.org/fhir/http.html#search))
- Returning a set of versions of resources as part of the history operation on a server (see [History](https://www.hl7.org/fhir/http.html#history))
- Sending a set of resources as part of a message exchange (see [Messaging](https://www.hl7.org/fhir/messaging.html))
- Grouping a self-contained set of resources to act as an exchangeable and persistable collection with clinical integrity - e.g. a clinical document (see [Documents](https://www.hl7.org/fhir/documents.html))
- Creating/updating/deleting a set of resources on a server as a single operation (including doing so as a single atomic transaction) (see [Transactions](https://www.hl7.org/fhir/http.html#transaction))
- Storing a collection of resources

## Relationships

There are two ways to collect resources together for transport and persistence purposes - [contained resources](https://www.hl7.org/fhir/references.html#contained), and bundles. There is an important difference between the two:

- Contained resources are "in" the container resource - they can only ever be interpreted and/or changed in the context of the container
- A bundle is a collection of resources that can have an independent existence - for example, they might also be accessed directly using the [RESTful API](https://www.hl7.org/fhir/http.html)

In addition to these two technical mechanisms, there are three administrative and infrastructure resources which also support grouping of content. These resources do not contain resources directly, but instead use \[Reference\] to point to the grouped resources:

- The [List](/docs/api/fhir/resources/list) resource – Enumerates a flat collection of resources and provides features for managing the collection. While a particular [List](/docs/api/fhir/resources/list) instance may represent a "snapshot", from a business process perspective the notion of "List" is dynamic – items are added and removed over time. The list resource references other resources. [Lists](/docs/api/fhir/resources/list) may be curated and have specific business meaning.
- The [Group](/docs/api/fhir/resources/group) resource – Defines a group of specific people, animals, devices, etc. by enumerating them, or by describing qualities that group members have. The group resource refers to other resources, possibly implicitly. [Groups](/docs/api/fhir/resources/group) are intended to be acted upon or observed as a whole; e.g. performing therapy on a group, calculating risk for a group, etc. This resource will commonly be used for public health (e.g. describing an at-risk population), clinical trials (e.g. defining a test subject pool) and similar purposes.
- The [Composition](/docs/api/fhir/resources/composition) resource – Defines a set of healthcare-related information that is assembled together into a single logical document that provides a single coherent statement of meaning, establishes its own context and that has clinical attestation with regard to who is making the statement. The composition resource provides the basic structure of a FHIR [document](https://www.hl7.org/fhir/documents.html). The full content of the document is expressed using a [Bundle](/docs/api/fhir/resources/bundle). [Compositions](/docs/api/fhir/resources/composition) will often reference [Lists](/docs/api/fhir/resources/list) as the focus of particular sections.

These three resources represent meaningful groupings of the resources they refer to (e.g. a discharge medication [List](/docs/api/fhir/resources/list), a [Group](/docs/api/fhir/resources/group) of participants for a clinical trial, a set of resources that form a signed document), while a [Bundle](/docs/api/fhir/resources/bundle) is merely is a container for resources used for transfer and storage. This list is not exhaustive; other resources also provde grouping functionality.
