Instance: AccessPolicy
InstanceOf: StructureDefinition
Usage: #inline
* name = "AccessPolicy"
* url = "https://medplum.com/fhir/StructureDefinition/AccessPolicy"
* status = #active
* kind = #resource
* abstract = false
* type = "AccessPolicy"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Access Policy for user or user group that defines how entities can or cannot access resources."
* snapshot.element[0].id = "AccessPolicy"
* snapshot.element[=].path = "AccessPolicy"
* snapshot.element[=].short = "Access Policy for user or user group that defines how entities can or cannot access resources."
* snapshot.element[=].definition = "Access Policy for user or user group that defines how entities can or cannot access resources."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "AccessPolicy"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "AccessPolicy.id"
* snapshot.element[=].path = "AccessPolicy.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "AccessPolicy.meta"
* snapshot.element[=].path = "AccessPolicy.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "AccessPolicy.implicitRules"
* snapshot.element[=].path = "AccessPolicy.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "AccessPolicy.language"
* snapshot.element[=].path = "AccessPolicy.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "AccessPolicy.text"
* snapshot.element[=].path = "AccessPolicy.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "AccessPolicy.contained"
* snapshot.element[=].path = "AccessPolicy.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "AccessPolicy.extension"
* snapshot.element[=].path = "AccessPolicy.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "AccessPolicy.modifierExtension"
* snapshot.element[=].path = "AccessPolicy.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "AccessPolicy.name"
* snapshot.element[=].path = "AccessPolicy.name"
* snapshot.element[=].definition = "A name associated with the AccessPolicy."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.basedOn"
* snapshot.element[=].path = "AccessPolicy.basedOn"
* snapshot.element[=].definition = "Other access policies used to derive this access policy."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "AccessPolicy.basedOn"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/AccessPolicy"
* snapshot.element[+].id = "AccessPolicy.compartment"
* snapshot.element[=].path = "AccessPolicy.compartment"
* snapshot.element[=].definition = "Optional compartment for newly created resources.  If this field is set, any resources created by a user with this access policy will automatically be included in the specified compartment."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].base.path = "AccessPolicy.compartment"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.resource"
* snapshot.element[=].path = "AccessPolicy.resource"
* snapshot.element[=].definition = "Access details for a resource type."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "AccessPolicy.resource"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].constraint.key = "axp-3"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Criteria must be a valid FHIR search string on the correct resource type, e.g. Patient?identifier=123"
* snapshot.element[=].constraint.expression = "criteria.exists() implies criteria.matches('^' & iif(%context.resourceType = '*','\\\\*',%context.resourceType) & '\\\\?([a-zA-Z_:-]+=[^&]+&?)+$') and criteria.contains('_has:').not()"
* snapshot.element[+].id = "AccessPolicy.resource.resourceType"
* snapshot.element[=].path = "AccessPolicy.resource.resourceType"
* snapshot.element[=].definition = "The resource type."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.resource.resourceType"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.resource.compartment"
* snapshot.element[=].path = "AccessPolicy.resource.compartment"
* snapshot.element[=].definition = "@deprecated Optional compartment restriction for the resource type."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].base.path = "AccessPolicy.resource.compartment"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.resource.criteria"
* snapshot.element[=].path = "AccessPolicy.resource.criteria"
* snapshot.element[=].definition = "The rules that the server should use to determine which resources to allow."
* snapshot.element[=].comment = "The rules are search criteria (without the [base] part). Like Bundle.entry.request.url, it has no leading \"/\"."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.resource.criteria"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.resource.readonly"
* snapshot.element[=].path = "AccessPolicy.resource.readonly"
* snapshot.element[=].definition = "@deprecated Use AccessPolicy.resource.interaction = ['search', 'read', 'vread', 'history']"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "AccessPolicy.resource.readonly"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.resource.interaction"
* snapshot.element[=].path = "AccessPolicy.resource.interaction"
* snapshot.element[=].definition = "Permitted FHIR interactions with this resource type"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "AccessPolicy.resource.interaction"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/access-poliicy-interactions"
* snapshot.element[+].id = "AccessPolicy.resource.hiddenFields"
* snapshot.element[=].path = "AccessPolicy.resource.hiddenFields"
* snapshot.element[=].definition = "Optional list of hidden fields.  Hidden fields are not readable or writeable."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.resource.hiddenFields"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "AccessPolicy.resource.readonlyFields"
* snapshot.element[=].path = "AccessPolicy.resource.readonlyFields"
* snapshot.element[=].definition = "Optional list of read-only fields.  Read-only fields are readable but not writeable."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.resource.readonlyFields"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "AccessPolicy.resource.writeConstraint"
* snapshot.element[=].path = "AccessPolicy.resource.writeConstraint"
* snapshot.element[=].definition = "Invariants that must be satisfied for the resource to be written.  Can include %before and %after placeholders to refer to the resource before and after the updates are applied."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Expression"
* snapshot.element[=].base.path = "AccessPolicy.resource.writeConstraint"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].constraint.key = "axp-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Write constraint expressions must be literal text/fhirpath strings"
* snapshot.element[=].constraint.expression = "expression.exists() and language = 'text/fhirpath'"
* snapshot.element[+].id = "AccessPolicy.ipAccessRule"
* snapshot.element[=].path = "AccessPolicy.ipAccessRule"
* snapshot.element[=].definition = "Use IP Access Rules to allowlist, block, and challenge traffic based on the visitor IP address."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "AccessPolicy.ipAccessRule"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "AccessPolicy.ipAccessRule.name"
* snapshot.element[=].path = "AccessPolicy.ipAccessRule.name"
* snapshot.element[=].definition = "Friendly name that will make it easy for you to identify the IP Access Rule in the future."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.ipAccessRule.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.ipAccessRule.value"
* snapshot.element[=].path = "AccessPolicy.ipAccessRule.value"
* snapshot.element[=].definition = "An IP Access rule will apply a certain action to incoming traffic based on the visitor IP address or IP range."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "AccessPolicy.ipAccessRule.value"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "AccessPolicy.ipAccessRule.action"
* snapshot.element[=].path = "AccessPolicy.ipAccessRule.action"
* snapshot.element[=].definition = "Access rule can perform one of the following actions: \"allow\" | \"block\"."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "AccessPolicy.ipAccessRule.action"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/ip-access-rule-action|4.0.1"