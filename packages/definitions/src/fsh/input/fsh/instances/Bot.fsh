Instance: Bot
InstanceOf: StructureDefinition
Usage: #inline
* name = "Bot"
* url = "https://medplum.com/fhir/StructureDefinition/Bot"
* status = #active
* kind = #resource
* abstract = false
* type = "Bot"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Bot account for automated actions."
* snapshot.element[0].id = "Bot"
* snapshot.element[=].path = "Bot"
* snapshot.element[=].short = "Bot account for automated actions."
* snapshot.element[=].definition = "Bot account for automated actions."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Bot"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Bot.id"
* snapshot.element[=].path = "Bot.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "Bot.meta"
* snapshot.element[=].path = "Bot.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "Bot.implicitRules"
* snapshot.element[=].path = "Bot.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "Bot.language"
* snapshot.element[=].path = "Bot.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "Bot.text"
* snapshot.element[=].path = "Bot.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "Bot.contained"
* snapshot.element[=].path = "Bot.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "Bot.extension"
* snapshot.element[=].path = "Bot.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Bot.modifierExtension"
* snapshot.element[=].path = "Bot.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Bot.identifier"
* snapshot.element[=].path = "Bot.identifier"
* snapshot.element[=].short = "An identifier for this bot"
* snapshot.element[=].definition = "An identifier for this bot."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "Identifier"
* snapshot.element[=].base.path = "Bot.identifier"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Bot.name"
* snapshot.element[=].path = "Bot.name"
* snapshot.element[=].definition = "A name associated with the Bot."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.description"
* snapshot.element[=].path = "Bot.description"
* snapshot.element[=].definition = "A summary, characterization or explanation of the Bot."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.runtimeVersion"
* snapshot.element[=].path = "Bot.runtimeVersion"
* snapshot.element[=].definition = "The identifier of the bot runtime environment (i.e., vmcontext, awslambda, etc)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Bot.runtimeVersion"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/bot-runtime-version|4.0.1"
* snapshot.element[+].id = "Bot.timeout"
* snapshot.element[=].path = "Bot.timeout"
* snapshot.element[=].definition = "The maximum allowed execution time of the bot in seconds."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "integer"
* snapshot.element[=].base.path = "Bot.timeout"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.photo"
* snapshot.element[=].path = "Bot.photo"
* snapshot.element[=].definition = "Image of the bot."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Attachment"
* snapshot.element[=].base.path = "Bot.photo"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cron[x]"
* snapshot.element[=].path = "Bot.cron[x]"
* snapshot.element[=].definition = "A schedule for the bot to be executed."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type[0].code = "Timing"
* snapshot.element[=].type[+].code = "string"
* snapshot.element[=].base.path = "Bot.cron[x]"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.category"
* snapshot.element[=].path = "Bot.category"
* snapshot.element[=].short = "Classification of service"
* snapshot.element[=].definition = "A code that classifies the service for searching, sorting and display purposes (e.g. \"Surgical Procedure\")."
* snapshot.element[=].comment = "There may be multiple axis of categorization depending on the context or use case for retrieving or displaying the resource.  The level of granularity is defined by the category concepts in the value set."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "CodeableConcept"
* snapshot.element[=].base.path = "Bot.category"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Bot.system"
* snapshot.element[=].path = "Bot.system"
* snapshot.element[=].definition = "Optional flag to indicate that the bot is a system bot and therefore has access to system secrets."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Bot.system"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.runAsUser"
* snapshot.element[=].path = "Bot.runAsUser"
* snapshot.element[=].definition = "Optional flag to indicate that the bot should be run as the user."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Bot.runAsUser"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.publicWebhook"
* snapshot.element[=].path = "Bot.publicWebhook"
* snapshot.element[=].definition = "Optional flag to indicate that the bot can be used as an unauthenticated public webhook. Note that this is a security risk and should only be used for public bots that do not require authentication."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Bot.publicWebhook"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.auditEventTrigger"
* snapshot.element[=].path = "Bot.auditEventTrigger"
* snapshot.element[=].definition = "Criteria for creating an AuditEvent as a result of the bot invocation. Possible values are 'always', 'never', 'on-error', or 'on-output'. Default value is 'always'."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Bot.auditEventTrigger"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/bot-audit-event-trigger|4.0.1"
* snapshot.element[+].id = "Bot.auditEventDestination"
* snapshot.element[=].path = "Bot.auditEventDestination"
* snapshot.element[=].definition = "The destination system in which the AuditEvent is to be sent. Possible values are 'log' or 'resource'. Default value is 'resource'."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Bot.auditEventDestination"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/bot-audit-event-destination|4.0.1"
* snapshot.element[+].id = "Bot.sourceCode"
* snapshot.element[=].path = "Bot.sourceCode"
* snapshot.element[=].definition = "Bot logic in original source code form written by developers."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Bot.sourceCode"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Attachment"
* snapshot.element[+].id = "Bot.executableCode"
* snapshot.element[=].path = "Bot.executableCode"
* snapshot.element[=].definition = "Bot logic in executable form as a result of compiling and bundling source code."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Bot.executableCode"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Attachment"
* snapshot.element[+].id = "Bot.cdsService"
* snapshot.element[=].path = "Bot.cdsService"
* snapshot.element[=].definition = "CDS service definition if the bot is used as a CDS Hooks service. See https://cds-hooks.hl7.org/ for more details."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Bot.cdsService"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.hook"
* snapshot.element[=].path = "Bot.cdsService.hook"
* snapshot.element[=].definition = "The hook this service should be invoked on. See https://cds-hooks.hl7.org/#hooks for possible values."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Bot.cdsService.hook"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.title"
* snapshot.element[=].path = "Bot.cdsService.title"
* snapshot.element[=].definition = "The human-friendly name of this CDS service."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.cdsService.title"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.description"
* snapshot.element[=].path = "Bot.cdsService.description"
* snapshot.element[=].definition = "The description of this CDS service."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.cdsService.description"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.usageRequirements"
* snapshot.element[=].path = "Bot.cdsService.usageRequirements"
* snapshot.element[=].definition = "Optional human-friendly description of any preconditions for the use of this CDS Service."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.cdsService.usageRequirements"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.prefetch"
* snapshot.element[=].path = "Bot.cdsService.prefetch"
* snapshot.element[=].definition = "An object containing key/value pairs of FHIR queries that this service is requesting the CDS Client to perform and provide on each service call."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "Bot.cdsService.prefetch"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Bot.cdsService.prefetch.key"
* snapshot.element[=].path = "Bot.cdsService.prefetch.key"
* snapshot.element[=].definition = "The type of data being requested. See https://cds-hooks.hl7.org/#prefetch-template"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Bot.cdsService.prefetch.key"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.cdsService.prefetch.query"
* snapshot.element[=].path = "Bot.cdsService.prefetch.query"
* snapshot.element[=].definition = "The FHIR query used to retrieve the requested data. See https://cds-hooks.hl7.org/#prefetch-template"
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.cdsService.prefetch.query"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Bot.code"
* snapshot.element[=].path = "Bot.code"
* snapshot.element[=].definition = "@deprecated Bot logic script. Use Bot.sourceCode or Bot.executableCode instead."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Bot.code"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"