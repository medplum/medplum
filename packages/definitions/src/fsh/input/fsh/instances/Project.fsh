Instance: Project
InstanceOf: StructureDefinition
Usage: #inline
* name = "Project"
* url = "https://medplum.com/fhir/StructureDefinition/Project"
* status = #active
* description = "Encapsulation of resources for a specific project or organization."
* kind = #resource
* abstract = false
* type = "Project"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* snapshot.element[0].id = "Project"
* snapshot.element[=].path = "Project"
* snapshot.element[=].short = "Encapsulation of resources for a specific project or organization."
* snapshot.element[=].definition = "Encapsulation of resources for a specific project or organization."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].base.path = "Project"
* snapshot.element[+].id = "Project.id"
* snapshot.element[=].path = "Project.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "Project.meta"
* snapshot.element[=].path = "Project.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "Project.implicitRules"
* snapshot.element[=].path = "Project.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "Project.language"
* snapshot.element[=].path = "Project.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "Project.text"
* snapshot.element[=].path = "Project.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "Project.contained"
* snapshot.element[=].path = "Project.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "Project.extension"
* snapshot.element[=].path = "Project.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Project.modifierExtension"
* snapshot.element[=].path = "Project.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Project.identifier"
* snapshot.element[=].path = "Project.identifier"
* snapshot.element[=].short = "An identifier for this project"
* snapshot.element[=].definition = "An identifier for this project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[=].base.path = "Project.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.name"
* snapshot.element[=].path = "Project.name"
* snapshot.element[=].definition = "A name associated with the Project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.description"
* snapshot.element[=].path = "Project.description"
* snapshot.element[=].definition = "A summary, characterization or explanation of the Project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.superAdmin"
* snapshot.element[=].path = "Project.superAdmin"
* snapshot.element[=].short = "Whether this project is the super administrator project."
* snapshot.element[=].definition = "Whether this project is the super administrator project. A super administrator is a user who has complete access to all resources in all projects."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Project.superAdmin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.strictMode"
* snapshot.element[=].path = "Project.strictMode"
* snapshot.element[=].short = "Whether this project uses strict FHIR validation."
* snapshot.element[=].definition = "Whether this project uses strict FHIR validation.  This setting has been deprecated, and can only be set by a super admin."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Project.strictMode"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.checkReferencesOnWrite"
* snapshot.element[=].path = "Project.checkReferencesOnWrite"
* snapshot.element[=].short = "Whether this project uses referential integrity on write operations such as 'create' and 'update'."
* snapshot.element[=].definition = "Whether this project uses referential integrity on write operations such as 'create' and 'update'."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Project.checkReferencesOnWrite"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.owner"
* snapshot.element[=].path = "Project.owner"
* snapshot.element[=].definition = "The user who owns the project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/User"
* snapshot.element[=].base.path = "Project.owner"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.features"
* snapshot.element[=].path = "Project.features"
* snapshot.element[=].definition = "A list of optional features that are enabled for the project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Project.features"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/project-feature"
* snapshot.element[+].id = "Project.defaultPatientAccessPolicy"
* snapshot.element[=].path = "Project.defaultPatientAccessPolicy"
* snapshot.element[=].definition = "The default access policy for patients using open registration."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/AccessPolicy"
* snapshot.element[=].base.path = "Project.defaultPatientAccessPolicy"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.setting"
* snapshot.element[=].path = "Project.setting"
* snapshot.element[=].definition = "Option or parameter that can be adjusted within the Medplum Project to customize its behavior."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Project.setting"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.setting.name"
* snapshot.element[=].path = "Project.setting.name"
* snapshot.element[=].definition = "The secret name."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.setting.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.setting.value[x]"
* snapshot.element[=].path = "Project.setting.value[x]"
* snapshot.element[=].definition = "The secret value."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "string"
* snapshot.element[=].type[+].code = "boolean"
* snapshot.element[=].type[+].code = "decimal"
* snapshot.element[=].type[+].code = "integer"
* snapshot.element[=].base.path = "Project.setting.value[x]"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.secret"
* snapshot.element[=].path = "Project.secret"
* snapshot.element[=].definition = "Option or parameter that can be adjusted within the Medplum Project to customize its behavior, only visible to project administrators."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Project.secret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].contentReference = "#Project.setting"
* snapshot.element[+].id = "Project.systemSetting"
* snapshot.element[=].path = "Project.systemSetting"
* snapshot.element[=].definition = "Option or parameter that can be adjusted within the Medplum Project to customize its behavior, only modifiable by system administrators."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Project.systemSetting"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].contentReference = "#Project.setting"
* snapshot.element[+].id = "Project.systemSecret"
* snapshot.element[=].path = "Project.systemSecret"
* snapshot.element[=].definition = "Option or parameter that can be adjusted within the Medplum Project to customize its behavior, only visible to system administrators."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Project.systemSecret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].contentReference = "#Project.setting"
* snapshot.element[+].id = "Project.site"
* snapshot.element[=].path = "Project.site"
* snapshot.element[=].definition = "Web application or web site that is associated with the project."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Project.site"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.site.name"
* snapshot.element[=].path = "Project.site.name"
* snapshot.element[=].definition = "Friendly name that will make it easy for you to identify the site in the future."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.name"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.site.domain"
* snapshot.element[=].path = "Project.site.domain"
* snapshot.element[=].definition = "The list of domain names associated with the site. User authentication will be restricted to the domains you enter here, plus any subdomains. In other words, a registration for example.com also registers subdomain.example.com. A valid domain requires a host and must not include any path, port, query or fragment."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.domain"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.site.googleClientId"
* snapshot.element[=].path = "Project.site.googleClientId"
* snapshot.element[=].definition = "The publicly visible Google Client ID for the site. This is used to authenticate users with Google. This value is available in the Google Developer Console."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.googleClientId"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.site.googleClientSecret"
* snapshot.element[=].path = "Project.site.googleClientSecret"
* snapshot.element[=].definition = "The private Google Client Secret for the site. This value is available in the Google Developer Console."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.googleClientSecret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.site.recaptchaSiteKey"
* snapshot.element[=].path = "Project.site.recaptchaSiteKey"
* snapshot.element[=].definition = "The publicly visible reCAPTCHA site key. This value is generated when you create a new reCAPTCHA site in the reCAPTCHA admin console. Use this site key in the HTML code your site serves to users."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.recaptchaSiteKey"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.site.recaptchaSecretKey"
* snapshot.element[=].path = "Project.site.recaptchaSecretKey"
* snapshot.element[=].definition = "The private reCAPTCHA secret key. This value is generated when you create a new reCAPTCHA site in the reCAPTCHA admin console. Use this secret key for communication between your site and reCAPTCHA."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Project.site.recaptchaSecretKey"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.link"
* snapshot.element[=].path = "Project.link"
* snapshot.element[=].definition = "Linked Projects whose contents are made available to this one"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Project.link"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.link.project"
* snapshot.element[=].path = "Project.link.project"
* snapshot.element[=].definition = "A reference to the Project to be linked into this one"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "Project"
* snapshot.element[=].base.path = "Project.link.project"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Project.defaultProfile"
* snapshot.element[=].path = "Project.defaultProfile"
* snapshot.element[=].definition = "Default profiles to apply to resources in this project that do not individually specify profiles"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Project.defaultProfile"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.defaultProfile.resourceType"
* snapshot.element[=].path = "Project.defaultProfile.resourceType"
* snapshot.element[=].definition = "The resource type onto which to apply the default profiles"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Project.defaultProfile.resourceType"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types"
* snapshot.element[+].id = "Project.defaultProfile.profile"
* snapshot.element[=].path = "Project.defaultProfile.profile"
* snapshot.element[=].definition = "The profiles to add by default"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "canonical"
* snapshot.element[=].type.targetProfile = "http://hl7.org/fhir/StructureDefinition/StructureDefinition"
* snapshot.element[=].base.path = "Project.defaultProfile.profile"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Project.exportedResourceType"
* snapshot.element[=].path = "Project.exportedResourceType"
* snapshot.element[=].definition = "The resource types exported by the project when linked"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Project.exportedResourceType"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types"