## Usage

The [GraphDefinition](/docs/api/fhir/resources/graphdefinition) resource provides a formal computable definition of a graph of resources - that is, a coherent set of resources that form a graph by following references. The Graph Definition resource defines a set and makes rules about the set. The [GraphDefinition](/docs/api/fhir/resources/graphdefinition) resource can be used to:

- Summarize a set of profiles on resources
- Define a graph of resources to return in a query
- Define a graph of resources to include in a document
- Document rules about the relationship between a set of resources e.g. must all resources concern the same patient?

## Relationships

There is a close relationship between [Profiles](/docs/api/fhir/resources/structuredefinition) and `GraphDefinitions`:

- A [StructureDefinition](/docs/api/fhir/resources/structuredefinition) defines a profile, and profiles can make rules about the relationships between resources. A carefully defined set of profiles implies part of what is in a [GraphDefinition](/docs/api/fhir/resources/graphdefinition)
- A [GraphDefinition](/docs/api/fhir/resources/graphdefinition) defines rules about the relationships between resources, and in so doing, implies some constraints that would need to be represented in their profiles

Profiles and Graph Definitions can be used together, or separately. When used together, they should be consistent. Note, though, that a graph definition may contain a subset or a superset of the relationships explicitly described in the profiles it refers to.

It is possible that in some circumstances, a graph definition makes incompatible rules with the Profiles it refers to - in this case, no graph if resources will meet the constraints expressed. Applications should - but are not required - detect when such incompatibilities arise.
