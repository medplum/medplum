Instance: User
InstanceOf: StructureDefinition
Usage: #inline
* name = "User"
* url = "https://medplum.com/fhir/StructureDefinition/User"
* status = #active
* kind = #resource
* abstract = false
* type = "User"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Representation of a human user of the system."
* snapshot.element[0].id = "User"
* snapshot.element[=].path = "User"
* snapshot.element[=].short = "Representation of a human user of the system"
* snapshot.element[=].definition = "Representation of a human user of the system."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "User"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "User.id"
* snapshot.element[=].path = "User.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "User.meta"
* snapshot.element[=].path = "User.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "User.implicitRules"
* snapshot.element[=].path = "User.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "User.language"
* snapshot.element[=].path = "User.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "User.text"
* snapshot.element[=].path = "User.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "User.contained"
* snapshot.element[=].path = "User.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "User.extension"
* snapshot.element[=].path = "User.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "User.modifierExtension"
* snapshot.element[=].path = "User.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "User.identifier"
* snapshot.element[=].path = "User.identifier"
* snapshot.element[=].short = "An identifier for this user"
* snapshot.element[=].definition = "An identifier for this user."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[=].base.path = "User.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "User.firstName"
* snapshot.element[=].path = "User.firstName"
* snapshot.element[=].definition = "The first name or given name of the user. This is the value as entered when the user is created. It is used to populate the profile resource."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.firstName"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.lastName"
* snapshot.element[=].path = "User.lastName"
* snapshot.element[=].definition = "The last name or family name of the user. This is the value as entered when the user is created. It is used to populate the profile resource."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.lastName"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.externalId"
* snapshot.element[=].path = "User.externalId"
* snapshot.element[=].definition = "@deprecated Replaced by ProjectMembership.externalId."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.externalId"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.email"
* snapshot.element[=].path = "User.email"
* snapshot.element[=].definition = "The email address that uniquely identifies the user."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.email"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.emailVerified"
* snapshot.element[=].path = "User.emailVerified"
* snapshot.element[=].definition = "Whether the system has verified that the user has access to the email address."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "User.emailVerified"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.admin"
* snapshot.element[=].path = "User.admin"
* snapshot.element[=].short = "@deprecated"
* snapshot.element[=].definition = "@deprecated"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "User.admin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.passwordHash"
* snapshot.element[=].path = "User.passwordHash"
* snapshot.element[=].definition = "Encrypted hash of the user's password."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.passwordHash"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.mfaSecret"
* snapshot.element[=].path = "User.mfaSecret"
* snapshot.element[=].definition = "Shared secret for MFA authenticator applications."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "User.mfaSecret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.mfaRequired"
* snapshot.element[=].path = "User.mfaRequired"
* snapshot.element[=].definition = "Whether the user is required to complete MFA enrollment. If true, the user must complete MFA enrollment before they can log in."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "User.mfaRequired"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.mfaEnrolled"
* snapshot.element[=].path = "User.mfaEnrolled"
* snapshot.element[=].definition = "Whether the user has completed MFA enrollment."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "User.mfaEnrolled"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "User.project"
* snapshot.element[=].path = "User.project"
* snapshot.element[=].definition = "Optional project if the user only exists for the project. This is used for the project-specific user database."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/Project"
* snapshot.element[=].base.path = "User.project"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"