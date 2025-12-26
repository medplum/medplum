Instance: Agent
InstanceOf: StructureDefinition
Usage: #inline
* name = "Agent"
* url = "https://medplum.com/fhir/StructureDefinition/Agent"
* status = #active
* kind = #resource
* abstract = false
* type = "Agent"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Configuration details for an instance of the Medplum agent application."
* snapshot.element[0].id = "Agent"
* snapshot.element[=].path = "Agent"
* snapshot.element[=].short = "Configuration details for an instance of the Medplum agent application."
* snapshot.element[=].definition = "Configuration details for an instance of the Medplum agent application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Agent"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Agent.id"
* snapshot.element[=].path = "Agent.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "Agent.meta"
* snapshot.element[=].path = "Agent.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "Agent.implicitRules"
* snapshot.element[=].path = "Agent.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "Agent.language"
* snapshot.element[=].path = "Agent.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "Agent.text"
* snapshot.element[=].path = "Agent.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "Agent.contained"
* snapshot.element[=].path = "Agent.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "Agent.extension"
* snapshot.element[=].path = "Agent.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Agent.modifierExtension"
* snapshot.element[=].path = "Agent.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Agent.identifier"
* snapshot.element[=].path = "Agent.identifier"
* snapshot.element[=].short = "An identifier for this agent"
* snapshot.element[=].definition = "An identifier for this agent."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[=].base.path = "Agent.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Agent.name"
* snapshot.element[=].path = "Agent.name"
* snapshot.element[=].short = "The human readable friendly name of the agent."
* snapshot.element[=].definition = "The human readable friendly name of the agent."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Agent.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "Agent.status"
* snapshot.element[=].path = "Agent.status"
* snapshot.element[=].short = "active | off | error"
* snapshot.element[=].definition = "The status of the agent."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Agent.status"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/agent-status|4.0.1"
* snapshot.element[+].id = "Agent.device"
* snapshot.element[=].path = "Agent.device"
* snapshot.element[=].definition = "Optional device resource representing the device running the agent."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "http://hl7.org/fhir/StructureDefinition/Device"
* snapshot.element[=].base.path = "Agent.device"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Agent.setting"
* snapshot.element[=].path = "Agent.setting"
* snapshot.element[=].definition = "The settings for the agent."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Agent.setting"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Agent.setting.name"
* snapshot.element[=].path = "Agent.setting.name"
* snapshot.element[=].definition = "The setting name."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Agent.setting.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Agent.setting.value[x]"
* snapshot.element[=].path = "Agent.setting.value[x]"
* snapshot.element[=].definition = "The setting value."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "string"
* snapshot.element[=].type[+].code = "boolean"
* snapshot.element[=].type[+].code = "decimal"
* snapshot.element[=].type[+].code = "integer"
* snapshot.element[=].base.path = "Agent.setting.value[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Agent.channel"
* snapshot.element[=].path = "Agent.channel"
* snapshot.element[=].short = "The channel on which to report matches to the criteria"
* snapshot.element[=].definition = "Details where to send notifications when resources are received that meet the criteria."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Agent.channel"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[+].id = "Agent.channel.name"
* snapshot.element[=].path = "Agent.channel.name"
* snapshot.element[=].definition = "The channel name."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Agent.channel.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Agent.channel.endpoint"
* snapshot.element[=].path = "Agent.channel.endpoint"
* snapshot.element[=].definition = "The channel endpoint definition including protocol and network binding details."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "http://hl7.org/fhir/StructureDefinition/Endpoint"
* snapshot.element[=].base.path = "Agent.channel.endpoint"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Agent.channel.target[x]"
* snapshot.element[=].path = "Agent.channel.target[x]"
* snapshot.element[=].definition = "The target resource where channel messages will be delivered."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "Reference"
* snapshot.element[=].type[=].targetProfile = "https://medplum.com/fhir/StructureDefinition/Bot"
* snapshot.element[=].type[+].code = "url"
* snapshot.element[=].base.path = "Agent.channel.target[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"