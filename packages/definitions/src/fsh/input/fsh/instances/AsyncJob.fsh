Instance: AsyncJob
InstanceOf: StructureDefinition
Usage: #inline
* name = "AsyncJob"
* url = "https://medplum.com/fhir/StructureDefinition/AsyncJob"
* status = #active
* kind = #resource
* abstract = false
* type = "AsyncJob"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Contains details of long running asynchronous/background jobs."
* snapshot.element[0].id = "AsyncJob"
* snapshot.element[=].path = "AsyncJob"
* snapshot.element[=].short = "Contains details of long running asynchronous/background jobs."
* snapshot.element[=].definition = "Contains details of long running asynchronous/background jobs."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "AsyncJob"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].constraint.key = "ajb-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Async jobs of type 'data-migration' require a 'dataVersion' and 'minServerVersion'."
* snapshot.element[=].constraint.expression = "type.exists() and type = 'data-migration' implies dataVersion.exists() and minServerVersion.exists()"
* snapshot.element[+].id = "AsyncJob.id"
* snapshot.element[=].path = "AsyncJob.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "AsyncJob.meta"
* snapshot.element[=].path = "AsyncJob.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "AsyncJob.implicitRules"
* snapshot.element[=].path = "AsyncJob.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "AsyncJob.language"
* snapshot.element[=].path = "AsyncJob.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "AsyncJob.text"
* snapshot.element[=].path = "AsyncJob.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "AsyncJob.contained"
* snapshot.element[=].path = "AsyncJob.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "AsyncJob.extension"
* snapshot.element[=].path = "AsyncJob.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "AsyncJob.modifierExtension"
* snapshot.element[=].path = "AsyncJob.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "AsyncJob.status"
* snapshot.element[=].path = "AsyncJob.status"
* snapshot.element[=].short = "accepted | error | completed | cancelled"
* snapshot.element[=].definition = "The status of the request."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "AsyncJob.status"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/async-job-status|4.0.1"
* snapshot.element[+].id = "AsyncJob.requestTime"
* snapshot.element[=].path = "AsyncJob.requestTime"
* snapshot.element[=].definition = "Indicates the server's time when the query is requested."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "instant"
* snapshot.element[=].base.path = "AsyncJob.requestTime"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AsyncJob.transactionTime"
* snapshot.element[=].path = "AsyncJob.transactionTime"
* snapshot.element[=].definition = "Indicates the server's time when the query is run. The response SHOULD NOT include any resources modified after this instant, and SHALL include any matching resources modified up to and including this instant."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "instant"
* snapshot.element[=].base.path = "AsyncJob.transactionTime"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AsyncJob.request"
* snapshot.element[=].path = "AsyncJob.request"
* snapshot.element[=].definition = "The full URL of the original kick-off request. In the case of a POST request, this URL will not include the request parameters."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "AsyncJob.request"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AsyncJob.output"
* snapshot.element[=].path = "AsyncJob.output"
* snapshot.element[=].definition = "Outputs resulting from the async job."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Parameters"
* snapshot.element[=].base.path = "AsyncJob.output"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AsyncJob.type"
* snapshot.element[=].path = "AsyncJob.type"
* snapshot.element[=].short = "data-migration"
* snapshot.element[=].definition = "The type of the AsyncJob."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "AsyncJob.type"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/async-job-type|4.0.1"
* snapshot.element[+].id = "AsyncJob.dataVersion"
* snapshot.element[=].path = "AsyncJob.dataVersion"
* snapshot.element[=].definition = "The data version of the migration this job represents."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "AsyncJob.dataVersion"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "integer"
* snapshot.element[+].id = "AsyncJob.minServerVersion"
* snapshot.element[=].path = "AsyncJob.minServerVersion"
* snapshot.element[=].definition = "The minimum Medplum server version required to run this job."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "AsyncJob.minServerVersion"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"