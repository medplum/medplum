Instance: ClientApplication
InstanceOf: StructureDefinition
Usage: #inline
* name = "ClientApplication"
* url = "https://medplum.com/fhir/StructureDefinition/ClientApplication"
* status = #active
* description = "Medplum client application for automated access."
* kind = #resource
* abstract = false
* type = "ClientApplication"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* snapshot.element[0].id = "ClientApplication"
* snapshot.element[=].path = "ClientApplication"
* snapshot.element[=].short = "Medplum client application for automated access."
* snapshot.element[=].definition = "Medplum client application for automated access."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "ClientApplication"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ClientApplication.id"
* snapshot.element[=].path = "ClientApplication.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "ClientApplication.meta"
* snapshot.element[=].path = "ClientApplication.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "ClientApplication.implicitRules"
* snapshot.element[=].path = "ClientApplication.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "ClientApplication.language"
* snapshot.element[=].path = "ClientApplication.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "ClientApplication.text"
* snapshot.element[=].path = "ClientApplication.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "ClientApplication.contained"
* snapshot.element[=].path = "ClientApplication.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "ClientApplication.extension"
* snapshot.element[=].path = "ClientApplication.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "ClientApplication.modifierExtension"
* snapshot.element[=].path = "ClientApplication.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "ClientApplication.status"
* snapshot.element[=].path = "ClientApplication.status"
* snapshot.element[=].short = "active | error | off"
* snapshot.element[=].definition = "The client application status. The status is active by default. The status can be set to error to indicate that the client application is not working properly. The status can be set to off to indicate that the client application is no longer in use."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "ClientApplication.status"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/CodeSystem/client-application-status"
* snapshot.element[+].id = "ClientApplication.name"
* snapshot.element[=].path = "ClientApplication.name"
* snapshot.element[=].definition = "A name associated with the ClientApplication."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.name"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.description"
* snapshot.element[=].path = "ClientApplication.description"
* snapshot.element[=].definition = "A summary, characterization or explanation of the ClientApplication."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.description"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.signInForm"
* snapshot.element[=].path = "ClientApplication.signInForm"
* snapshot.element[=].definition = "Custom values for the Log In form."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "BackboneElement"
* snapshot.element[=].base.path = "ClientApplication.signInForm"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.signInForm.welcomeString"
* snapshot.element[=].path = "ClientApplication.signInForm.welcomeString"
* snapshot.element[=].definition = "Welcome string for the Log In Form."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.signInForm.welcomeString"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.signInForm.logo"
* snapshot.element[=].path = "ClientApplication.signInForm.logo"
* snapshot.element[=].definition = "Logo for the Log In Form."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Attachment"
* snapshot.element[=].base.path = "ClientApplication.signInForm.logo"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.secret"
* snapshot.element[=].path = "ClientApplication.secret"
* snapshot.element[=].definition = "Client secret string used to verify the identity of a client."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.secret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.retiringSecret"
* snapshot.element[=].path = "ClientApplication.retiringSecret"
* snapshot.element[=].definition = "Old version of the client secret that is being rotated out.  Instances of the client using this value should update to use the value in ClientApplication.secret"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.retiringSecret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.jwksUri"
* snapshot.element[=].path = "ClientApplication.jwksUri"
* snapshot.element[=].definition = "Optional JWKS URI for public key verification of JWTs issued by the authorization server (client_secret_jwt)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "ClientApplication.jwksUri"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.redirectUri"
* snapshot.element[=].path = "ClientApplication.redirectUri"
* snapshot.element[=].definition = "@deprecated This field is deprecated. Use redirectUris instead."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "ClientApplication.redirectUri"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.redirectUris"
* snapshot.element[=].path = "ClientApplication.redirectUris"
* snapshot.element[=].definition = "Optional redirect URI array used when redirecting a client back to the client application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "ClientApplication.redirectUris"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ClientApplication.launchUri"
* snapshot.element[=].path = "ClientApplication.launchUri"
* snapshot.element[=].definition = "Optional launch URI for SMART EHR launch sequence."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[=].base.path = "ClientApplication.launchUri"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.pkceOptional"
* snapshot.element[=].path = "ClientApplication.pkceOptional"
* snapshot.element[=].definition = "Flag to make PKCE optional for this client application. PKCE is required by default for compliance with Smart App Launch. It can be disabled for compatibility with legacy client applications."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "ClientApplication.pkceOptional"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.identityProvider"
* snapshot.element[=].path = "ClientApplication.identityProvider"
* snapshot.element[=].definition = "Optional external Identity Provider (IdP) for the client application."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "IdentityProvider"
* snapshot.element[=].base.path = "ClientApplication.identityProvider"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.accessTokenLifetime"
* snapshot.element[=].path = "ClientApplication.accessTokenLifetime"
* snapshot.element[=].definition = "Optional configuration to set the access token duration"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].constraint.key = "clapp-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Token lifetime must be a valid string representing time duration (eg. 2w, 1h)"
* snapshot.element[=].constraint.expression = "$this.matches('^[0-9]+[smhdwy]$')"
* snapshot.element[=].base.path = "ClientApplication.accessTokenLifetime"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.refreshTokenLifetime"
* snapshot.element[=].path = "ClientApplication.refreshTokenLifetime"
* snapshot.element[=].definition = "Optional configuration to set the refresh token duration"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].constraint.key = "clapp-1"
* snapshot.element[=].constraint.severity = #error
* snapshot.element[=].constraint.human = "Token lifetime must be a valid string representing time duration (eg. 2w, 1h)"
* snapshot.element[=].constraint.expression = "$this.matches('^[0-9]+[smhdwy]$')"
* snapshot.element[=].base.path = "ClientApplication.refreshTokenLifetime"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "ClientApplication.allowedOrigin"
* snapshot.element[=].path = "ClientApplication.allowedOrigin"
* snapshot.element[=].definition = "Optional CORS allowed origin for the client application.  By default, all origins are allowed."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.allowedOrigin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "ClientApplication.defaultScope"
* snapshot.element[=].path = "ClientApplication.defaultScope"
* snapshot.element[=].definition = "Optional default OAuth scope for the client application. This scope is used when the client application does not specify a scope in the authorization request."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "ClientApplication.defaultScope"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"