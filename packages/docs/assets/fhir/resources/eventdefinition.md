## Usage

**This resource is a _definition_ resource from a FHIR workflow perspective** - see [Workflow](https://www.hl7.org/fhir/workflow.html), specifically [Definition](https://www.hl7.org/fhir/workflow.html#definition).

The [EventDefinition](/docs/api/fhir/resources/eventdefinition) provides a reusable description of an event. The resource supports describing different kinds of events, including named events, periodic events, and data-based events. For each of these, the resource also supports a formal description of the event. For example, a 'monitor-emergency-admissions' event can be a named event, but also provide a formal description of the event as monitoring for encounters that occur in emergency department locations.

## Relationships

The [EventDefinition](/docs/api/fhir/resources/eventdefinition) resource is intended to be used to provide a reusable description of events for use by other resources that require event definition, such as [Subscription](/docs/api/fhir/resources/subscription). [EventDefinition](/docs/api/fhir/resources/eventdefinition) is a definition of an event that could occur, whereas [Subscription](/docs/api/fhir/resources/subscription) is asking for notification of events when they occur.
