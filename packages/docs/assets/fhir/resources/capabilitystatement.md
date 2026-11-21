## Usage

The capability statement is a key part of the overall conformance framework in FHIR. It is used as a statement of the features of actual software, or of a set of rules for an application to provide. This statement connects to all the detailed statements of functionality, such as [StructureDefinitions](/docs/api/fhir/resources/structuredefinition) and [ValueSets](/docs/api/fhir/resources/valueset). This composite statement of application capability may be used for system compatibility testing, code generation, or as the basis for a conformance assessment. For further information about Conformance testing, see [Conformance Rules](https://www.hl7.org/fhir/conformance-rules.html) and [Profiling FHIR](https://www.hl7.org/fhir/profiling.html).

Specifically, capability statements are used in one of three ways:

<table class="grid"><tbody><tr><td><a href="https://www.hl7.org/fhir/#instance">Instance</a></td><td><code>implementation</code> must be present and <code>software</code> may be present</td></tr><tr><td><a href="https://www.hl7.org/fhir/#capability">Capability</a></td><td><code>implementation</code> must be absent, <code>software</code> must be present</td></tr><tr><td><a href="https://www.hl7.org/fhir/#requirements">Requirements</a></td><td><code>implementation</code> and <code>software</code> must be absent</td></tr></tbody></table>

#### Instance: Describe an actual implementation[](/docs/api/fhir/resources/capabilitystatement 'link to here')

In this scenario, the capability statement describes the capabilities of a deployed and configured solution available at a particular access point or set of access points. The statement describes exactly how to interface with that deployed solution and thus provides for a degree of self-configuration of software solutions.

This is the type of statement that FHIR restful solutions are expected to make available on invocation of the _capabilities_ operation. It is also the type of statement that forms a basis for the testing, certification or commissioning of specific software installations.

#### Capability: Describe software solution capabilities[](/docs/api/fhir/resources/capabilitystatement 'link to here')

In this scenario, the capability statement describes generic capabilities of a software application or component solution. The solution might be available for purchase or other acquisition and might be deployed and configured at any number of independent sites. Because it is not dependent on any particular implementation, the profile cannot provide specific details such as endpoint addresses. It may also need to document various configurations in which the application can be set up or describe the degree of customizability associated with the solution.

This type of statement may be used as a marketing tool by software and system developers to formally describe their capabilities. It can also be used as the basis for conformance testing of software solutions independent of a particular installation.

#### Requirements: Describe a desired solution[](/docs/api/fhir/resources/capabilitystatement 'link to here')

In this scenario, the capability statement describes the capabilities of a desired system. It might be used as part of an architectural design process to document needed system capabilities, or might be used as part of an RFP process to formally document the requirements of a requested solution and to document the criteria by which proposals will be evaluated.

These three types of profiles can be used together. A requirements statement can be compared against the solution statements proffered by respondents to an RFP. A solution statement for a software package forms the starting point for the implementation statement associated with a particular installation of that software package.

[CapabilityStatements](/docs/api/fhir/resources/capabilitystatement) of type "requirement" describe what capabilities are potentially relevant; additional documentation or extensions (see [capabilitystatement-expectation](https://www.hl7.org/fhir/extension-capabilitystatement-expectation.html)) within the [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) are expected to make more explicit statements of degree of expectation associated with each capability.

## Background and Context

Capability Statements provide for a degree of automatic configuration and adaptation. However, capturing absolutely every variation that could impact the interoperability of two systems, let alone keeping that detailed information up-to-date as systems evolve through maintenance and upgrades, is rarely practical. Therefore, capability statements should be seen as an interim step. They provide a degree of automation. However, they also provide a great deal of human-readable content that can minimize the need for direct communication between the operators of the systems being configured to interoperate.

#### Supporting Multiple Versions[](/docs/api/fhir/resources/capabilitystatement 'link to here')

Applications may implement multiple versions. If they do, then a `CapabilityStatement` describes the system's support for a particular version of FHIR, and the system will have multiple statements, one for each version it supports. For further information, see [Managing Multiple Versions](https://www.hl7.org/fhir/versioning.html), and the [$versions](https://www.hl7.org/fhir/capabilitystatement-operation-versions.html) operation.

#### Mixed Normative Content[](/docs/api/fhir/resources/capabilitystatement 'link to here')

While the core of the `CapabilityStatement` resource is [Normative](https://www.hl7.org/fhir/versions.html#std-process), many of the flags that indicate exactly how the system operates are marked as `trial-use`. Roughly, the portions of the resource that correspond to [OpenAPI document](https://github.com/OAI/OpenAPI-Specification) elements are normative.

Applications looking for normative stability should only use the normative parts of the resource, and not populate or ignore the portions labelled trial-use. To assist with this, clients can ask for the server to return a 'Normative content only' [CapabilityStatement](/docs/api/fhir/resources/capabilitystatement) using the [mode parameter on `/metadata`](https://www.hl7.org/fhir/http.html#capabilities).

Community discussion regarding more capable, efficient and computable representations of an applications capabilities may lead to change to the trial-use parts of this resource or the creation of new resources and/or functionality in future versions of this specification.
