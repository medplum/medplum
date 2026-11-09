## Usage

The [TestScript](/docs/api/fhir/resources/testscript) resource is used to define tests that can be executed on one or more FHIR servers. The [TestReport](/docs/api/fhir/resources/testreport) resource defines how systems should encode the summarized results of executing a [TestScript](/docs/api/fhir/resources/testscript).

The [TestReport](/docs/api/fhir/resources/testreport) structure mirrors the [TestScript](/docs/api/fhir/resources/testscript) concepts of having sections for setup, tests, and teardown. If present, these ordered lists should mirror the actions (either operations or assertions) of the referenced [TestScript](/docs/api/fhir/resources/testscript) with a result code: pass, skip, fail, warning, or error.

## Background and Context

#### Background[](https://www.hl7.org/fhir/testreport.html#7.4.2.1 'link to here')

Implementers should be familiar with the testing concepts and descriptions found in [Testing FHIR](https://www.hl7.org/fhir/testing.html) before working with this resource.
