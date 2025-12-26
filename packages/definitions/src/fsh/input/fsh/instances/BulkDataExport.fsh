Instance: BulkDataExport
InstanceOf: StructureDefinition
Usage: #inline
* name = "BulkDataExport"
* url = "https://medplum.com/fhir/StructureDefinition/BulkDataExport"
* status = #active
* kind = #resource
* abstract = false
* type = "BulkDataExport"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "User specific configuration for the Medplum application."
* snapshot.element[0].id = "BulkDataExport"
* snapshot.element[=].path = "BulkDataExport"
* snapshot.element[=].short = "User specific configuration for the Medplum application."
* snapshot.element[=].definition = "User specific configuration for the Medplum application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "BulkDataExport"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "BulkDataExport.id"
* snapshot.element[=].path = "BulkDataExport.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "BulkDataExport.meta"
* snapshot.element[=].path = "BulkDataExport.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "BulkDataExport.implicitRules"
* snapshot.element[=].path = "BulkDataExport.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "BulkDataExport.language"
* snapshot.element[=].path = "BulkDataExport.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "BulkDataExport.text"
* snapshot.element[=].path = "BulkDataExport.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "BulkDataExport.contained"
* snapshot.element[=].path = "BulkDataExport.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "BulkDataExport.extension"
* snapshot.element[=].path = "BulkDataExport.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "BulkDataExport.modifierExtension"
* snapshot.element[=].path = "BulkDataExport.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "BulkDataExport.status"
* snapshot.element[=].path = "BulkDataExport.status"
* snapshot.element[=].short = "active | error | completed"
* snapshot.element[=].definition = "The status of the request."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "BulkDataExport.status"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/async-job-status|4.0.1"
* snapshot.element[+].id = "BulkDataExport.requestTime"
* snapshot.element[=].path = "BulkDataExport.requestTime"
* snapshot.element[=].definition = "Indicates the server's time when the query is requested."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "instant"
* snapshot.element[=].base.path = "BulkDataExport.requestTime"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.transactionTime"
* snapshot.element[=].path = "BulkDataExport.transactionTime"
* snapshot.element[=].definition = "Indicates the server's time when the query is run. The response SHOULD NOT include any resources modified after this instant, and SHALL include any matching resources modified up to and including this instant."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "instant"
* snapshot.element[=].base.path = "BulkDataExport.transactionTime"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.request"
* snapshot.element[=].path = "BulkDataExport.request"
* snapshot.element[=].definition = "The full URL of the original Bulk Data kick-off request. In the case of a POST request, this URL will not include the request parameters."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "BulkDataExport.request"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.requiresAccessToken"
* snapshot.element[=].path = "BulkDataExport.requiresAccessToken"
* snapshot.element[=].definition = "Indicates whether downloading the generated files requires the same authorization mechanism as the $export operation itself."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "BulkDataExport.requiresAccessToken"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.output"
* snapshot.element[=].path = "BulkDataExport.output"
* snapshot.element[=].definition = "An array of file items with one entry for each generated file. If no resources are returned from the kick-off request, the server SHOULD return an empty array."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "BulkDataExport.output"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "BulkDataExport.output.type"
* snapshot.element[=].path = "BulkDataExport.output.type"
* snapshot.element[=].definition = "The FHIR resource type that is contained in the file."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "BulkDataExport.output.type"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.description = "One of the resource types defined as part of this version of FHIR."
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types|4.0.1"
* snapshot.element[+].id = "BulkDataExport.output.url"
* snapshot.element[=].path = "BulkDataExport.output.url"
* snapshot.element[=].definition = "The absolute path to the file. The format of the file SHOULD reflect that requested in the _outputFormat parameter of the initial kick-off request."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "BulkDataExport.output.url"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.deleted"
* snapshot.element[=].path = "BulkDataExport.deleted"
* snapshot.element[=].definition = "An array of deleted file items following the same structure as the output array."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "BulkDataExport.deleted"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "BulkDataExport.deleted.type"
* snapshot.element[=].path = "BulkDataExport.deleted.type"
* snapshot.element[=].definition = "The FHIR resource type that is contained in the file."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "BulkDataExport.deleted.type"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.description = "One of the resource types defined as part of this version of FHIR."
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types|4.0.1"
* snapshot.element[+].id = "BulkDataExport.deleted.url"
* snapshot.element[=].path = "BulkDataExport.deleted.url"
* snapshot.element[=].definition = "The absolute path to the file. The format of the file SHOULD reflect that requested in the _outputFormat parameter of the initial kick-off request."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "BulkDataExport.deleted.url"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "BulkDataExport.error"
* snapshot.element[=].path = "BulkDataExport.error"
* snapshot.element[=].definition = "Array of message file items following the same structure as the output array."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "BulkDataExport.error"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "BulkDataExport.error.type"
* snapshot.element[=].path = "BulkDataExport.error.type"
* snapshot.element[=].definition = "The FHIR resource type that is contained in the file."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "BulkDataExport.error.type"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.description = "One of the resource types defined as part of this version of FHIR."
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types|4.0.1"
* snapshot.element[+].id = "BulkDataExport.error.url"
* snapshot.element[=].path = "BulkDataExport.error.url"
* snapshot.element[=].definition = "The absolute path to the file. The format of the file SHOULD reflect that requested in the _outputFormat parameter of the initial kick-off request."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "BulkDataExport.error.url"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"