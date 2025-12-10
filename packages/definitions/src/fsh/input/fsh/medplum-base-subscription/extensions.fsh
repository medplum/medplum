Extension: SubscriptionMaxAttempts
Id: subscription-max-attempts
Title: "Subscription Max Attempts"
Description: "Maximum number of retry attempts for a subscription. Value must be between 1-18. Default is 3."
* ^url = "https://medplum.com/fhir/StructureDefinition/subscription-max-attempts"
* value[x] only integer
* valueInteger 1..1 MS

Extension: SubscriptionSupportedInteraction
Id: subscription-supported-interaction
Title: "Subscription Supported Interaction"
Description: "Restricts the FHIR Subscription to execute only on specific interactions (create, update, or delete)."
* ^url = "https://medplum.com/fhir/StructureDefinition/subscription-supported-interaction"
* value[x] only code
* valueCode 1..1 MS
* valueCode from SubscriptionInteractionType (required)

Extension: SubscriptionSecret
Id: subscription-secret
Title: "Subscription Secret"
Description: "Cryptographically secure secret used to generate HMAC signatures for webhook verification."
* ^url = "https://medplum.com/fhir/StructureDefinition/subscription-secret"
* value[x] only string
* valueString 1..1 MS

Extension: SubscriptionSuccessCodes
Id: subscription-success-codes
Title: "Subscription Success Codes"
Description: "Comma-separated list of HTTP status codes that indicate success (e.g., '200,201' or '200-399,404')."
* ^url = "https://medplum.com/fhir/StructureDefinition/subscription-success-codes"
* value[x] only string
* valueString 1..1 MS

Extension: FhirPathCriteriaExpression
Id: fhir-path-criteria-expression
Title: "FHIRPath Criteria Expression"
Description: "FHIRPath expression for triggering subscriptions based on complex conditional logic. Expression takes in %previous and %current variables and should return true or false."
* ^url = "https://medplum.com/fhir/StructureDefinition/fhir-path-criteria-expression"
* value[x] only string
* valueString 1..1 MS

// ValueSet for subscription interaction types
ValueSet: SubscriptionInteractionType
Id: subscription-interaction-type
Title: "Subscription Interaction Type"
Description: "Types of interactions that can trigger a subscription"
* ^url = "https://medplum.com/fhir/ValueSet/subscription-interaction-type"
* include codes from system http://hl7.org/fhir/restful-interaction where concept = #create
* include codes from system http://hl7.org/fhir/restful-interaction where concept = #update
* include codes from system http://hl7.org/fhir/restful-interaction where concept = #delete

