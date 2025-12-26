Instance: IdentityProvider
InstanceOf: StructureDefinition
Usage: #inline
* name = "IdentityProvider"
* url = "https://medplum.com/fhir/StructureDefinition/IdentityProvider"
* status = #active
* kind = #complex-type
* abstract = false
* type = "IdentityProvider"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/Element"
* description = "External Identity Provider (IdP) configuration details."
* snapshot.element[0].id = "IdentityProvider"
* snapshot.element[=].path = "IdentityProvider"
* snapshot.element[=].short = "External Identity Provider (IdP) configuration details."
* snapshot.element[=].definition = "External Identity Provider (IdP) configuration details."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "IdentityProvider"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "IdentityProvider.authorizeUrl"
* snapshot.element[=].path = "IdentityProvider.authorizeUrl"
* snapshot.element[=].definition = "Remote URL for the external Identity Provider authorize endpoint."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "IdentityProvider.authorizeUrl"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.tokenUrl"
* snapshot.element[=].path = "IdentityProvider.tokenUrl"
* snapshot.element[=].definition = "Remote URL for the external Identity Provider token endpoint."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "IdentityProvider.tokenUrl"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.tokenAuthMethod"
* snapshot.element[=].path = "IdentityProvider.tokenAuthMethod"
* snapshot.element[=].definition = "Client Authentication method used by Clients to authenticate to the Authorization Server when using the Token Endpoint. If no method is registered, the default method is client_secret_basic."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "IdentityProvider.tokenAuthMethod"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[=].binding.strength = #required
* snapshot.element[=].binding.valueSet = "https://medplum.com/fhir/ValueSet/token-endpoint-auth-methods-supported|4.0.1"
* snapshot.element[+].id = "IdentityProvider.userInfoUrl"
* snapshot.element[=].path = "IdentityProvider.userInfoUrl"
* snapshot.element[=].definition = "Remote URL for the external Identity Provider userinfo endpoint."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "IdentityProvider.userInfoUrl"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.clientId"
* snapshot.element[=].path = "IdentityProvider.clientId"
* snapshot.element[=].definition = "External Identity Provider client ID."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "IdentityProvider.clientId"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.clientSecret"
* snapshot.element[=].path = "IdentityProvider.clientSecret"
* snapshot.element[=].definition = "External Identity Provider client secret."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "IdentityProvider.clientSecret"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.usePkce"
* snapshot.element[=].path = "IdentityProvider.usePkce"
* snapshot.element[=].short = "Optional flag to use PKCE in the token request."
* snapshot.element[=].definition = "Optional flag to use PKCE in the token request."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "IdentityProvider.usePkce"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "IdentityProvider.useSubject"
* snapshot.element[=].path = "IdentityProvider.useSubject"
* snapshot.element[=].short = "Optional flag to use the subject field instead of the email field."
* snapshot.element[=].definition = "Optional flag to use the subject field instead of the email field."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "IdentityProvider.useSubject"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"