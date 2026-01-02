Instance: SmartAppLaunch
InstanceOf: StructureDefinition
Usage: #inline
* name = "SmartAppLaunch"
* url = "https://medplum.com/fhir/StructureDefinition/SmartAppLaunch"
* status = #active
* kind = #resource
* abstract = false
* type = "SmartAppLaunch"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "This resource contains context details for a SMART App Launch."
* snapshot.element[0].id = "SmartAppLaunch"
* snapshot.element[=].path = "SmartAppLaunch"
* snapshot.element[=].short = "This resource contains context details for a SMART App Launch."
* snapshot.element[=].definition = "This resource contains context details for a SMART App Launch."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "SmartAppLaunch"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "SmartAppLaunch.id"
* snapshot.element[=].path = "SmartAppLaunch.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "SmartAppLaunch.meta"
* snapshot.element[=].path = "SmartAppLaunch.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "SmartAppLaunch.implicitRules"
* snapshot.element[=].path = "SmartAppLaunch.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "SmartAppLaunch.language"
* snapshot.element[=].path = "SmartAppLaunch.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "SmartAppLaunch.text"
* snapshot.element[=].path = "SmartAppLaunch.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "SmartAppLaunch.contained"
* snapshot.element[=].path = "SmartAppLaunch.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "SmartAppLaunch.extension"
* snapshot.element[=].path = "SmartAppLaunch.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "SmartAppLaunch.modifierExtension"
* snapshot.element[=].path = "SmartAppLaunch.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "SmartAppLaunch.patient"
* snapshot.element[=].path = "SmartAppLaunch.patient"
* snapshot.element[=].definition = "Optional patient indicating that the app was launched in the patient context."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "http://hl7.org/fhir/StructureDefinition/Patient"
* snapshot.element[=].base.path = "SmartAppLaunch.patient"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "SmartAppLaunch.encounter"
* snapshot.element[=].path = "SmartAppLaunch.encounter"
* snapshot.element[=].definition = "Optional encounter indicating that the app was launched in the encounter context."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "http://hl7.org/fhir/StructureDefinition/Encounter"
* snapshot.element[=].base.path = "SmartAppLaunch.encounter"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"