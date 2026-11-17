## Usage

Operation outcomes are sets of error, warning and information messages that provide detailed information about the outcome of an attempted system operation. They are provided as a direct system response, or component of one, and provide information about the outcome of the operation.

The [OperationOutcome](/docs/api/fhir/resources/operationoutcome) resource is used in the following circumstances:

- When a [RESTful interaction](https://www.hl7.org/fhir/http.html#operations) or [operation](https://www.hl7.org/fhir/operations.html) fails
- As the response on a [validation operation](https://www.hl7.org/fhir/http.html#validate) to provide information about the outcome
- As part of a message response, usually when the message has not been processed correctly
- As the response to a batch/transaction, when requested
- As part of a search's [Bundle](/docs/api/fhir/resources/bundle) response containing information about the search

## Relationships

This resource is not used for reporting clinical or workflow issues associated with a proposed or ongoing action; these would be handled using [DetectedIssue](/docs/api/fhir/resources/detectedissue) or other resources. [OperationOutcome](/docs/api/fhir/resources/operationoutcome) is not designed to be persisted or referenced from other parts of the workflow.

It is possible to have both `OperationOutcome` and [DetectedIssue](/docs/api/fhir/resources/detectedissue) together, where the [OperationOutcome](/docs/api/fhir/resources/operationoutcome) might indicate that a requested action was rejected due to a clinical issue and the [DetectedIssue](/docs/api/fhir/resources/detectedissue) provides the details of the issue.
