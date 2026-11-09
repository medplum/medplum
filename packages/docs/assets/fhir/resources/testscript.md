## Usage

The [TestScript](/docs/api/fhir/resources/testscript) resource is used to define tests that can be executed on one or more FHIR servers. The [TestScript](/docs/api/fhir/resources/testscript) resource would typically contain

- a list of fixtures (required resources used in the tests)
- setup procedures
- a suite of thematically related tests
- teardown procedures

For example, one [TestScript](/docs/api/fhir/resources/testscript) might feature a set of tests focusing on searching [Patients](/docs/api/fhir/resources/patient) and validating the [Bundle](/docs/api/fhir/resources/bundle) responses. The fixtures for such a test would contain a list of [Patient](/docs/api/fhir/resources/patient) resources that are required for the test to complete successfully. The setup procedures create the fixtures on the FHIR server being tested. A series of tests execute various search parameters and search for the fixtures in the results. The teardown procedures would then clean up (delete) the fixtures on FHIR server that were created during the setup procedures.

The purpose of the [TestScript](/docs/api/fhir/resources/testscript) is to encode in an executable representation tests that can be used to

1.  determine whether a given FHIR server adheres to the FHIR specification and
2.  determine whether two or more FHIR servers implement capabilities in a compatible or interoperable manner.

It might not be possible to fully automate the latter goal (especially with regards to business rules that might ride on top of different implementations), however the tests should be able to determine whether two servers support the operations, value sets, profiles, and extensions to exchange [Bundles](/docs/api/fhir/resources/bundle) of Resources (such as returned from the [Patient $everything operation](https://www.hl7.org/fhir/operation-patient-everything.html)).

## Relationships

The [TestScript](/docs/api/fhir/resources/testscript) resource should **NOT** be used to represent Clinical tests, Prescriptions, or any other Healthcare related concept. The [TestScript](/docs/api/fhir/resources/testscript) resource is an infrastructure support resource used to represent standardized tests to determine an implementation's level of adherence to the FHIR specification.

[TestScript](/docs/api/fhir/resources/testscript) is a part of the conformance framework and is used to validate the behavior of FHIR systems, specifically their correct implementation of [StructureDefinition](/docs/api/fhir/resources/structuredefinition), [ValueSet](/docs/api/fhir/resources/valueset), [OperationDefinition](/docs/api/fhir/resources/operationdefinition), [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) and other FHIR resources that govern system behavior. [TestScript](/docs/api/fhir/resources/testscript) instances may be included as part of [ImplementationGuides](/docs/api/fhir/resources/implementationguide) to help define and test the desired behavior of systems that choose to comply with the implementation guide.

The following resources represent the FHIR conformance framework that are used to express the expected behavior of a FHIR compliant system:

- [ValueSet](/docs/api/fhir/resources/valueset 'A value set specifies a set of codes drawn from one or more code systems.')
- [ConceptMap](/docs/api/fhir/resources/conceptmap 'A statement of relationships from one set of concepts to one or more other concepts - either concepts in code systems, or data element/data element concepts, or classes in class models.')
- [StructureDefinition](/docs/api/fhir/resources/structuredefinition 'A definition of a FHIR structure. This resource is used to describe the underlying resources, data types defined in FHIR, and also for describing extensions, and constraints on resources and data types.')
- [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement 'A capability statement is a set of capabilities of a FHIR Server that may be used as a statement of actual server functionality or a statement of required or desired server implementation.')
- [OperationDefinition](/docs/api/fhir/resources/operationdefinition 'A formal computable definition of an operation (on the RESTful interface) or a named query (using the search interaction).')
- [SearchParameter](/docs/api/fhir/resources/searchparameter 'A Search Parameter that defines a named search item that can be used to search/filter on a resource.')
- [ImplementationGuide](/docs/api/fhir/resources/implementationguide 'A set of rules or how FHIR is used to solve a particular problem. This resource is used to gather all the parts of an implementation guide into a logical whole, and to publish a computable definition of all the parts.')

## Background and Context

#### Background[](https://www.hl7.org/fhir/testscript.html#7.3.3.1 'link to here')

The [TestScript](/docs/api/fhir/resources/testscript) resource is designed to establish testing as a first class artifact within the FHIR specification. This resource allows defining a suite of tests that can be executed on one or more FHIR servers and clients.

Implementers should be familiar with the testing concepts and descriptions found in [Testing FHIR](https://www.hl7.org/fhir/testing.html) before working with this resource.
