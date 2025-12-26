Instance: UserConfiguration
InstanceOf: StructureDefinition
Usage: #inline
* name = "UserConfiguration"
* url = "https://medplum.com/fhir/StructureDefinition/UserConfiguration"
* status = #active
* kind = #resource
* abstract = false
* type = "UserConfiguration"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "User specific configuration for the Medplum application."
* snapshot.element[0].id = "UserConfiguration"
* snapshot.element[=].path = "UserConfiguration"
* snapshot.element[=].short = "User specific configuration for the Medplum application."
* snapshot.element[=].definition = "User specific configuration for the Medplum application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "UserConfiguration"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "UserConfiguration.id"
* snapshot.element[=].path = "UserConfiguration.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "UserConfiguration.meta"
* snapshot.element[=].path = "UserConfiguration.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "UserConfiguration.implicitRules"
* snapshot.element[=].path = "UserConfiguration.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "UserConfiguration.language"
* snapshot.element[=].path = "UserConfiguration.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "UserConfiguration.text"
* snapshot.element[=].path = "UserConfiguration.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "UserConfiguration.contained"
* snapshot.element[=].path = "UserConfiguration.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "UserConfiguration.extension"
* snapshot.element[=].path = "UserConfiguration.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "UserConfiguration.modifierExtension"
* snapshot.element[=].path = "UserConfiguration.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "UserConfiguration.name"
* snapshot.element[=].path = "UserConfiguration.name"
* snapshot.element[=].definition = "A name associated with the UserConfiguration."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "UserConfiguration.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.menu"
* snapshot.element[=].path = "UserConfiguration.menu"
* snapshot.element[=].definition = "Optional menu of shortcuts to URLs."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "UserConfiguration.menu"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "UserConfiguration.menu.title"
* snapshot.element[=].path = "UserConfiguration.menu.title"
* snapshot.element[=].definition = "Title of the menu."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "UserConfiguration.menu.title"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.menu.link"
* snapshot.element[=].path = "UserConfiguration.menu.link"
* snapshot.element[=].definition = "Shortcut links to URLs."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "UserConfiguration.menu.link"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "UserConfiguration.menu.link.name"
* snapshot.element[=].path = "UserConfiguration.menu.link.name"
* snapshot.element[=].definition = "The human friendly name of the link."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "UserConfiguration.menu.link.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.menu.link.target"
* snapshot.element[=].path = "UserConfiguration.menu.link.target"
* snapshot.element[=].definition = "The URL target of the link."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "url"
* snapshot.element[=].base.path = "UserConfiguration.menu.link.target"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.search"
* snapshot.element[=].path = "UserConfiguration.search"
* snapshot.element[=].definition = "Shortcut links to URLs."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "UserConfiguration.search"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "UserConfiguration.search.name"
* snapshot.element[=].path = "UserConfiguration.search.name"
* snapshot.element[=].definition = "The human friendly name of the link."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "UserConfiguration.search.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.search.criteria"
* snapshot.element[=].path = "UserConfiguration.search.criteria"
* snapshot.element[=].definition = "The rules that the server should use to determine which resources to return."
* snapshot.element[=].comment = "The rules are search criteria (without the [base] part). Like Bundle.entry.request.url, it has no leading \"/\"."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "UserConfiguration.search.criteria"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.option"
* snapshot.element[=].path = "UserConfiguration.option"
* snapshot.element[=].definition = "User options that control the display of the application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "UserConfiguration.option"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "UserConfiguration.option.id"
* snapshot.element[=].path = "UserConfiguration.option.id"
* snapshot.element[=].definition = "The unique identifier of the option."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "UserConfiguration.option.id"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "UserConfiguration.option.value[x]"
* snapshot.element[=].path = "UserConfiguration.option.value[x]"
* snapshot.element[=].short = "Value of option"
* snapshot.element[=].definition = "Value of option - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list)."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "boolean"
* snapshot.element[=].type[+].code = "code"
* snapshot.element[=].type[+].code = "decimal"
* snapshot.element[=].type[+].code = "integer"
* snapshot.element[=].type[+].code = "string"
* snapshot.element[=].base.path = "UserConfiguration.option.value[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"