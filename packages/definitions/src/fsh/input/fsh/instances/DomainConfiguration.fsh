Instance: DomainConfiguration
InstanceOf: StructureDefinition
Usage: #inline
* name = "DomainConfiguration"
* url = "https://medplum.com/fhir/StructureDefinition/DomainConfiguration"
* status = #active
* kind = #resource
* abstract = false
* type = "DomainConfiguration"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Domain specific configuration for the Medplum application."
* snapshot.element[0].id = "DomainConfiguration"
* snapshot.element[=].path = "DomainConfiguration"
* snapshot.element[=].short = "Domain specific configuration for the Medplum application."
* snapshot.element[=].definition = "Domain specific configuration for the Medplum application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainConfiguration"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "DomainConfiguration.id"
* snapshot.element[=].path = "DomainConfiguration.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "DomainConfiguration.meta"
* snapshot.element[=].path = "DomainConfiguration.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "DomainConfiguration.implicitRules"
* snapshot.element[=].path = "DomainConfiguration.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "DomainConfiguration.language"
* snapshot.element[=].path = "DomainConfiguration.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "DomainConfiguration.text"
* snapshot.element[=].path = "DomainConfiguration.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "DomainConfiguration.contained"
* snapshot.element[=].path = "DomainConfiguration.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "DomainConfiguration.extension"
* snapshot.element[=].path = "DomainConfiguration.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "DomainConfiguration.modifierExtension"
* snapshot.element[=].path = "DomainConfiguration.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "DomainConfiguration.domain"
* snapshot.element[=].path = "DomainConfiguration.domain"
* snapshot.element[=].definition = "Globally unique domain name for this configuration."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "DomainConfiguration.domain"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "DomainConfiguration.identityProvider"
* snapshot.element[=].path = "DomainConfiguration.identityProvider"
* snapshot.element[=].definition = "Optional external Identity Provider (IdP) for the domain name."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "IdentityProvider"
* snapshot.element[=].base.path = "DomainConfiguration.identityProvider"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"