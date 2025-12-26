Instance: ProjectMembership
InstanceOf: StructureDefinition
Usage: #inline
* name = "ProjectMembership"
* url = "https://medplum.com/fhir/StructureDefinition/ProjectMembership"
* status = #active
* kind = #resource
* abstract = false
* type = "ProjectMembership"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Medplum project membership. A project membership grants a user access to a project."
* snapshot.element[0].id = "ProjectMembership"
* snapshot.element[=].path = "ProjectMembership"
* snapshot.element[=].short = "Medplum project membership. A project membership grants a user access to a project."
* snapshot.element[=].definition = "Medplum project membership. A project membership grants a user access to a project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ProjectMembership"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ProjectMembership.id"
* snapshot.element[=].path = "ProjectMembership.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ProjectMembership.meta"
* snapshot.element[=].path = "ProjectMembership.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "ProjectMembership.implicitRules"
* snapshot.element[=].path = "ProjectMembership.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "ProjectMembership.language"
* snapshot.element[=].path = "ProjectMembership.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "ProjectMembership.text"
* snapshot.element[=].path = "ProjectMembership.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "ProjectMembership.contained"
* snapshot.element[=].path = "ProjectMembership.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "ProjectMembership.extension"
* snapshot.element[=].path = "ProjectMembership.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "ProjectMembership.modifierExtension"
* snapshot.element[=].path = "ProjectMembership.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "ProjectMembership.identifier"
* snapshot.element[=].path = "ProjectMembership.identifier"
* snapshot.element[=].short = "An identifier for this ProjectMembership"
* snapshot.element[=].definition = "An identifier for this ProjectMembership."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[=].base.path = "ProjectMembership.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ProjectMembership.active"
* snapshot.element[=].path = "ProjectMembership.active"
* snapshot.element[=].short = "Whether this patient's record is in active use"
* snapshot.element[=].definition = "Whether this project membership record is in active use."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ProjectMembership.active"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].meaningWhenMissing = "This resource is generally assumed to be active if no value is provided for the active element"
* snapshot.element[+].id = "ProjectMembership.project"
* snapshot.element[=].path = "ProjectMembership.project"
* snapshot.element[=].definition = "Project where the memberships are available."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/Project"
* snapshot.element[=].base.path = "ProjectMembership.project"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.invitedBy"
* snapshot.element[=].path = "ProjectMembership.invitedBy"
* snapshot.element[=].definition = "The project administrator who invited the user to the project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/User"
* snapshot.element[=].base.path = "ProjectMembership.invitedBy"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.user"
* snapshot.element[=].path = "ProjectMembership.user"
* snapshot.element[=].definition = "User that is granted access to the project."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile[0] = "https://medplum.com/fhir/StructureDefinition/Bot"
* snapshot.element[=].type.targetProfile[+] = "https://medplum.com/fhir/StructureDefinition/ClientApplication"
* snapshot.element[=].type.targetProfile[+] = "https://medplum.com/fhir/StructureDefinition/User"
* snapshot.element[=].base.path = "ProjectMembership.user"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.profile"
* snapshot.element[=].path = "ProjectMembership.profile"
* snapshot.element[=].definition = "Reference to the resource that represents the user profile within the project."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile[0] = "https://medplum.com/fhir/StructureDefinition/Bot"
* snapshot.element[=].type.targetProfile[+] = "https://medplum.com/fhir/StructureDefinition/ClientApplication"
* snapshot.element[=].type.targetProfile[+] = "http://hl7.org/fhir/StructureDefinition/Patient"
* snapshot.element[=].type.targetProfile[+] = "http://hl7.org/fhir/StructureDefinition/Practitioner"
* snapshot.element[=].type.targetProfile[+] = "http://hl7.org/fhir/StructureDefinition/RelatedPerson"
* snapshot.element[=].base.path = "ProjectMembership.profile"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.userName"
* snapshot.element[=].path = "ProjectMembership.userName"
* snapshot.element[=].definition = "SCIM userName. A service provider's unique identifier for the user, typically used by the user to directly authenticate to the service provider. Often displayed to the user as their unique identifier within the system (as opposed to \"id\" or \"externalId\", which are generally opaque and not user-friendly identifiers).  Each User MUST include a non-empty userName value.  This identifier MUST be unique across the service provider's entire set of Users.  This attribute is REQUIRED and is case insensitive."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ProjectMembership.userName"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.externalId"
* snapshot.element[=].path = "ProjectMembership.externalId"
* snapshot.element[=].definition = "SCIM externalId. A String that is an identifier for the resource as defined by the provisioning client.  The \"externalId\" may simplify identification of a resource between the provisioning client and the service provider by allowing the client to use a filter to locate the resource with an identifier from the provisioning domain, obviating the need to store a local mapping between the provisioning domain's identifier of the resource and the identifier used by the service provider.  Each resource MAY include a non-empty \"externalId\" value.  The value of the \"externalId\" attribute is always issued by the provisioning client and MUST NOT be specified by the service provider.  The service provider MUST always interpret the externalId as scoped to the provisioning domain."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ProjectMembership.externalId"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.accessPolicy"
* snapshot.element[=].path = "ProjectMembership.accessPolicy"
* snapshot.element[=].definition = "The access policy for the user within the project memebership."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/AccessPolicy"
* snapshot.element[=].base.path = "ProjectMembership.accessPolicy"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.access"
* snapshot.element[=].path = "ProjectMembership.access"
* snapshot.element[=].definition = "Extended access configuration using parameterized access policies."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "ProjectMembership.access"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ProjectMembership.access.policy"
* snapshot.element[=].path = "ProjectMembership.access.policy"
* snapshot.element[=].definition = "The base access policy used as a template.  Variables in the template access policy are replaced by the values in the parameter."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/AccessPolicy"
* snapshot.element[=].base.path = "ProjectMembership.access.policy"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.access.parameter"
* snapshot.element[=].path = "ProjectMembership.access.parameter"
* snapshot.element[=].definition = "User options that control the display of the application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "ProjectMembership.access.parameter"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ProjectMembership.access.parameter.name"
* snapshot.element[=].path = "ProjectMembership.access.parameter.name"
* snapshot.element[=].definition = "The unique name of the parameter."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "ProjectMembership.access.parameter.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.access.parameter.value[x]"
* snapshot.element[=].path = "ProjectMembership.access.parameter.value[x]"
* snapshot.element[=].short = "Value of the parameter."
* snapshot.element[=].definition = "Value of the parameter - must be one of a constrained set of the data types (see [Extensibility](extensibility.html) for a list)."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "string"
* snapshot.element[=].type[+].code = "Reference"
* snapshot.element[=].base.path = "ProjectMembership.access.parameter.value[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.userConfiguration"
* snapshot.element[=].path = "ProjectMembership.userConfiguration"
* snapshot.element[=].definition = "The user configuration for the user within the project memebership such as menu links, saved searches, and features."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/UserConfiguration"
* snapshot.element[=].base.path = "ProjectMembership.userConfiguration"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ProjectMembership.admin"
* snapshot.element[=].path = "ProjectMembership.admin"
* snapshot.element[=].short = "Whether this user is a project administrator."
* snapshot.element[=].definition = "Whether this user is a project administrator."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "ProjectMembership.admin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"