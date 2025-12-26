Instance: Login
InstanceOf: StructureDefinition
Usage: #inline
* name = "Login"
* url = "https://medplum.com/fhir/StructureDefinition/Login"
* status = #active
* kind = #resource
* abstract = false
* type = "Login"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "Login event and session details."
* snapshot.element[0].id = "Login"
* snapshot.element[=].path = "Login"
* snapshot.element[=].short = "Login event and session details."
* snapshot.element[=].definition = "Login event and session details."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "Login"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "Login.id"
* snapshot.element[=].path = "Login.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "Login.meta"
* snapshot.element[=].path = "Login.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "Login.implicitRules"
* snapshot.element[=].path = "Login.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "Login.language"
* snapshot.element[=].path = "Login.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "Login.text"
* snapshot.element[=].path = "Login.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "Login.contained"
* snapshot.element[=].path = "Login.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "Login.extension"
* snapshot.element[=].path = "Login.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Login.modifierExtension"
* snapshot.element[=].path = "Login.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "Login.client"
* snapshot.element[=].path = "Login.client"
* snapshot.element[=].definition = "The client requesting the code."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/ClientApplication"
* snapshot.element[=].base.path = "Login.client"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.profileType"
* snapshot.element[=].path = "Login.profileType"
* snapshot.element[=].definition = "Optional required profile resource type."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "http://hl7.org/fhir/ValueSet/resource-types|4.0.1"
* snapshot.element[=].base.path = "Login.profileType"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.project"
* snapshot.element[=].path = "Login.project"
* snapshot.element[=].definition = "Optional required project for the login."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/Project"
* snapshot.element[=].base.path = "Login.project"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.user"
* snapshot.element[=].path = "Login.user"
* snapshot.element[=].definition = "The user requesting the code."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile[0] = "https://medplum.com/fhir/StructureDefinition/Bot"
* snapshot.element[=].type.targetProfile[+] = "https://medplum.com/fhir/StructureDefinition/ClientApplication"
* snapshot.element[=].type.targetProfile[+] = "https://medplum.com/fhir/StructureDefinition/User"
* snapshot.element[=].base.path = "Login.user"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.membership"
* snapshot.element[=].path = "Login.membership"
* snapshot.element[=].definition = "Reference to the project membership which includes FHIR identity (patient, practitioner, etc), access policy, and user configuration."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/ProjectMembership"
* snapshot.element[=].base.path = "Login.membership"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.scope"
* snapshot.element[=].path = "Login.scope"
* snapshot.element[=].definition = "OAuth scope or scopes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.scope"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.authMethod"
* snapshot.element[=].path = "Login.authMethod"
* snapshot.element[=].definition = "The authentication method used to obtain the code (password or google)."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Login.authMethod"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/login-auth-method|4.0.1"
* snapshot.element[+].id = "Login.authTime"
* snapshot.element[=].path = "Login.authTime"
* snapshot.element[=].definition = "Time when the End-User authentication occurred."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "instant"
* snapshot.element[=].base.path = "Login.authTime"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.cookie"
* snapshot.element[=].path = "Login.cookie"
* snapshot.element[=].definition = "The cookie value that can be used for session management."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.cookie"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.code"
* snapshot.element[=].path = "Login.code"
* snapshot.element[=].definition = "The authorization code generated by the authorization server.  The authorization code MUST expire shortly after it is issued to mitigate the risk of leaks.  A maximum authorization code lifetime of 10 minutes is RECOMMENDED.  The client MUST NOT use the authorization code more than once.  If an authorization code is used more than once, the authorization server MUST deny the request and SHOULD revoke (when possible) all tokens previously issued based on that authorization code.  The authorization code is bound to the client identifier and redirection URI."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.code"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.codeChallenge"
* snapshot.element[=].path = "Login.codeChallenge"
* snapshot.element[=].definition = "PKCE code challenge presented in the authorization request."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.codeChallenge"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.codeChallengeMethod"
* snapshot.element[=].path = "Login.codeChallengeMethod"
* snapshot.element[=].definition = "OPTIONAL, defaults to \"plain\" if not present in the request.  Code verifier transformation method is \"S256\" or \"plain\"."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].base.path = "Login.codeChallengeMethod"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/login-code-challenge-method|4.0.1"
* snapshot.element[+].id = "Login.refreshSecret"
* snapshot.element[=].path = "Login.refreshSecret"
* snapshot.element[=].definition = "Optional secure random string that can be used in an OAuth refresh token."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.refreshSecret"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.nonce"
* snapshot.element[=].path = "Login.nonce"
* snapshot.element[=].definition = "Optional cryptographically random string that your app adds to the initial request and the authorization server includes inside the ID Token, used to prevent token replay attacks."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.nonce"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.mfaVerified"
* snapshot.element[=].path = "Login.mfaVerified"
* snapshot.element[=].definition = "Whether the user has verified using multi-factor authentication (MFA). This will only be set is the user has MFA enabled (see User.mfaEnrolled)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Login.mfaVerified"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.granted"
* snapshot.element[=].path = "Login.granted"
* snapshot.element[=].definition = "Whether a token has been granted for this login."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Login.granted"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.revoked"
* snapshot.element[=].path = "Login.revoked"
* snapshot.element[=].definition = "Whether this login has been revoked or invalidated."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Login.revoked"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.admin"
* snapshot.element[=].path = "Login.admin"
* snapshot.element[=].definition = "@deprecated"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Login.admin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.superAdmin"
* snapshot.element[=].path = "Login.superAdmin"
* snapshot.element[=].definition = "@deprecated"
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "Login.superAdmin"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.launch"
* snapshot.element[=].path = "Login.launch"
* snapshot.element[=].definition = "Optional SMART App Launch context for this login."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "Reference"
* snapshot.element[=].type.targetProfile = "https://medplum.com/fhir/StructureDefinition/SmartAppLaunch"
* snapshot.element[=].base.path = "Login.launch"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.remoteAddress"
* snapshot.element[=].path = "Login.remoteAddress"
* snapshot.element[=].definition = "The Internet Protocol (IP) address of the client or last proxy that sent the request."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.remoteAddress"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.userAgent"
* snapshot.element[=].path = "Login.userAgent"
* snapshot.element[=].definition = "The User-Agent request header as sent by the client."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.userAgent"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "Login.pictureUrl"
* snapshot.element[=].path = "Login.pictureUrl"
* snapshot.element[=].definition = "Optional picture URL from the external identity provider."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "Login.pictureUrl"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"