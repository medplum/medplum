Instance: JsonWebKey
InstanceOf: StructureDefinition
Usage: #inline
* name = "JsonWebKey"
* url = "https://medplum.com/fhir/StructureDefinition/JsonWebKey"
* status = #active
* kind = #resource
* abstract = false
* type = "JsonWebKey"
* baseDefinition = "http://hl7.org/fhir/StructureDefinition/DomainResource"
* description = "A JSON object that represents a cryptographic key. The members of the object represent properties of the key, including its value."
* snapshot.element[0].id = "JsonWebKey"
* snapshot.element[=].path = "JsonWebKey"
* snapshot.element[=].short = "A JSON object that represents a cryptographic key."
* snapshot.element[=].definition = "A JSON object that represents a cryptographic key. The members of the object represent properties of the key, including its value."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "JsonWebKey"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "JsonWebKey.id"
* snapshot.element[=].path = "JsonWebKey.id"
* snapshot.element[=].short = "Logical id of this artifact"
* snapshot.element[=].definition = "The logical id of the resource, as used in the URL for the resource. Once assigned, this value never changes."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.id"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[+].id = "JsonWebKey.meta"
* snapshot.element[=].path = "JsonWebKey.meta"
* snapshot.element[=].definition = "The metadata about the resource. This is content that is maintained by the infrastructure. Changes to the content might not always be associated with version changes to the resource."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.meta"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Meta"
* snapshot.element[+].id = "JsonWebKey.implicitRules"
* snapshot.element[=].path = "JsonWebKey.implicitRules"
* snapshot.element[=].definition = "A reference to a set of rules that were followed when the resource was constructed, and which must be understood when processing the content. Often, this is a reference to an implementation guide that defines the special rules along with other profiles etc."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.implicitRules"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "uri"
* snapshot.element[+].id = "JsonWebKey.language"
* snapshot.element[=].path = "JsonWebKey.language"
* snapshot.element[=].definition = "The base language in which the resource is written."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "Resource.language"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "code"
* snapshot.element[+].id = "JsonWebKey.text"
* snapshot.element[=].path = "JsonWebKey.text"
* snapshot.element[=].short = "Text summary of the resource, for human interpretation"
* snapshot.element[=].definition = "A human-readable narrative that contains a summary of the resource and can be used to represent the content of the resource to a human. The narrative need not encode all the structured data, but is required to contain sufficient detail to make it \"clinically safe\" for a human to just read the narrative. Resource definitions may define what content should be represented in the narrative to ensure clinical safety."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].base.path = "DomainResource.text"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[=].type.code = "Narrative"
* snapshot.element[+].id = "JsonWebKey.contained"
* snapshot.element[=].path = "JsonWebKey.contained"
* snapshot.element[=].short = "Contained, inline Resources"
* snapshot.element[=].definition = "These resources do not have an independent existence apart from the resource that contains them - they cannot be identified independently, and nor can they have their own independent transaction scope."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.contained"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Resource"
* snapshot.element[+].id = "JsonWebKey.extension"
* snapshot.element[=].path = "JsonWebKey.extension"
* snapshot.element[=].short = "Additional content defined by implementations"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource. To make the use of extensions safe and manageable, there is a strict set of governance  applied to the definition and use of extensions. Though any implementer can define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.extension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "JsonWebKey.modifierExtension"
* snapshot.element[=].path = "JsonWebKey.modifierExtension"
* snapshot.element[=].short = "Extensions that cannot be ignored"
* snapshot.element[=].definition = "May be used to represent additional information that is not part of the basic definition of the resource and that modifies the understanding of the element that contains it and/or the understanding of the containing element's descendants. Usually modifier elements provide negation or qualification. To make the use of extensions safe and manageable, there is a strict set of governance applied to the definition and use of extensions. Though any implementer is allowed to define an extension, there is a set of requirements that SHALL be met as part of the definition of the extension. Applications processing a resource are required to check for modifier extensions.\n\nModifier extensions SHALL NOT change the meaning of any elements on Resource or DomainResource (including cannot change the meaning of modifierExtension itself)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].base.path = "DomainResource.modifierExtension"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[=].type.code = "Extension"
* snapshot.element[+].id = "JsonWebKey.active"
* snapshot.element[=].path = "JsonWebKey.active"
* snapshot.element[=].definition = "Whether this key is in active use."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "boolean"
* snapshot.element[=].base.path = "JsonWebKey.active"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.alg"
* snapshot.element[=].path = "JsonWebKey.alg"
* snapshot.element[=].definition = "The specific cryptographic algorithm used with the key."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.alg"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.kty"
* snapshot.element[=].path = "JsonWebKey.kty"
* snapshot.element[=].definition = "The family of cryptographic algorithms used with the key."
* snapshot.element[=].min = 1
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.kty"
* snapshot.element[=].base.min = 1
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.use"
* snapshot.element[=].path = "JsonWebKey.use"
* snapshot.element[=].definition = "How the key was meant to be used; sig represents the signature."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.use"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.key_ops"
* snapshot.element[=].path = "JsonWebKey.key_ops"
* snapshot.element[=].definition = "The operation(s) for which the key is intended to be used."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.key_ops"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "JsonWebKey.x5c"
* snapshot.element[=].path = "JsonWebKey.x5c"
* snapshot.element[=].definition = "The x.509 certificate chain. The first entry in the array is the certificate to use for token verification; the other certificates can be used to verify this first certificate."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "*"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.x5c"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "*"
* snapshot.element[+].id = "JsonWebKey.n"
* snapshot.element[=].path = "JsonWebKey.n"
* snapshot.element[=].definition = "The modulus for the RSA public key."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.n"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.e"
* snapshot.element[=].path = "JsonWebKey.e"
* snapshot.element[=].definition = "The exponent for the RSA public key."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.e"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.kid"
* snapshot.element[=].path = "JsonWebKey.kid"
* snapshot.element[=].definition = "The unique identifier for the key."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.kid"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.x5t"
* snapshot.element[=].path = "JsonWebKey.x5t"
* snapshot.element[=].definition = "The thumbprint of the x.509 cert (SHA-1 thumbprint)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.x5t"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.d"
* snapshot.element[=].path = "JsonWebKey.d"
* snapshot.element[=].definition = "The exponent for the RSA private key."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.d"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.p"
* snapshot.element[=].path = "JsonWebKey.p"
* snapshot.element[=].definition = "The first prime factor."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.p"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.q"
* snapshot.element[=].path = "JsonWebKey.q"
* snapshot.element[=].definition = "The second prime factor."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.q"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.dp"
* snapshot.element[=].path = "JsonWebKey.dp"
* snapshot.element[=].definition = "The first factor CRT exponent."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.dp"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.dq"
* snapshot.element[=].path = "JsonWebKey.dq"
* snapshot.element[=].definition = "The second factor CRT exponent."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.dq"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.qi"
* snapshot.element[=].path = "JsonWebKey.qi"
* snapshot.element[=].definition = "The first CRT coefficient."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.qi"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.x"
* snapshot.element[=].path = "JsonWebKey.x"
* snapshot.element[=].definition = "The x coordinate of the elliptic curve point (base64url encoded)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.x"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.y"
* snapshot.element[=].path = "JsonWebKey.y"
* snapshot.element[=].definition = "The y coordinate of the elliptic curve point (base64url encoded)."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.y"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"
* snapshot.element[+].id = "JsonWebKey.crv"
* snapshot.element[=].path = "JsonWebKey.crv"
* snapshot.element[=].definition = "The cryptographic curve identifier (e.g., 'P-256', 'P-384', 'P-521')."
* snapshot.element[=].min = 0
* snapshot.element[=].max = "1"
* snapshot.element[=].type.code = "string"
* snapshot.element[=].base.path = "JsonWebKey.crv"
* snapshot.element[=].base.min = 0
* snapshot.element[=].base.max = "1"