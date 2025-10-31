Profile: MedplumBaseSubscription
Parent: Subscription
Id: medplum-base-subscription
Title: "Medplum Base Subscription"
Description: "Base subscription profile with Medplum-specific extensions for fine-grained control over subscription behavior."
* ^url = "https://medplum.com/fhir/StructureDefinition/medplum-base-subscription"

* extension contains
    SubscriptionMaxAttempts named maxAttempts 0..1 MS and
    SubscriptionSupportedInteraction named supportedInteraction 0..* MS and
    SubscriptionSecret named secret 0..1 MS and
    SubscriptionSuccessCodes named successCodes 0..1 MS and
    FhirPathCriteriaExpression named fhirPathCriteriaExpression 0..1 MS

