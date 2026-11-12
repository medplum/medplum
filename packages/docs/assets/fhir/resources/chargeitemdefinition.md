## Usage

The [ChargeItemDefinition](/docs/api/fhir/resources/chargeitemdefinition) holds all relevant billing information pertaining to a billing code or a product.

Many billing systems have rules associated with the code which may define whether a billing code is applicable in a specific context or whether certain billing details (surcharges, discounts) apply. [ChargeItemDefinitions](/docs/api/fhir/resources/chargeitemdefinition) may also be used to hold pricing information pertaining to only one specific instance of a product (e.g. [Device](/docs/api/fhir/resources/device), [Medication](/docs/api/fhir/resources/medication) or [Substance](/docs/api/fhir/resources/substance)) which may be a requirement for custom made devices or medications or other products where prices vary by instance. Rules for applicability may include

- a billing code is only applicable in an outpatient setting
- a surcharge that applies only to services provided outside regular business hours
- a discount that applies only to patients up to the age of 14
- a billing code that may only be charged once per [Encounter](/docs/api/fhir/resources/encounter)
- a billing code that can only be charged in combination with another code from the same billing system

A billing engine will apply the [ChargeItemDefinitions](/docs/api/fhir/resources/chargeitemdefinition) to all [ChargeItems](/docs/api/fhir/resources/chargeitem) within a specific [Account](/docs/api/fhir/resources/account) in order to select all billable items an acquire the pricing details to create an [Invoice](/docs/api/fhir/resources/invoice). However, [ChargeItems](/docs/api/fhir/resources/chargeitem) may be validated against a [ChargeItemDefinition](/docs/api/fhir/resources/chargeitemdefinition) at any point in time, using the $apply-Operation

## Relationships

While the [ChargeItem](/docs/api/fhir/resources/chargeitem) resource represents the occurrence of a billing code (for services rendered or products supplied to a specific patient), the [ChargeItemDefinition](/docs/api/fhir/resources/chargeitemdefinition) represents the properties and rules that a billing engine needs to determine the pricing and applicability of a billing code in the context of a specific setting.

Billing Codes may be defined in a [CodeSystem](/docs/api/fhir/resources/codesystem) Resource, however, each of these codes - if it is used in a financial context - can have a large number of business rules and properties associated with it, that lay outside the scope of [CodeSystem](/docs/api/fhir/resources/codesystem) and may change in time independently from the underlying Code's validity period. Even though [CodeSystem](/docs/api/fhir/resources/codesystem) can associate a concept with any number of additional properties, such a construct would be very hard to maintain. This is why the ChargItemDefinition has been introduced. It allows to maintain the attributes of each billing code independently and has a wider scope to also include business rules.

In most use cases, billing codes will be both defined as semantical concepts in a [CodeSystem](/docs/api/fhir/resources/codesystem) and as a financial artifact in [ChargeItemDefinition](/docs/api/fhir/resources/chargeitemdefinition).

[ChargeItemDefinitions](/docs/api/fhir/resources/chargeitemdefinition) that pertain to codes from the same [CodeSystem](/docs/api/fhir/resources/codesystem) may be aggregated using the Catalog profile for [Composition](/docs/api/fhir/resources/composition).

Resources representing products that can be sold or billed (Device, [Medication](/docs/api/fhir/resources/medication), [Substance](/docs/api/fhir/resources/substance)...), do not specify financial details for the product instance. Most of the time, such products are not billed seperately but are a part of a generic billing code that covers both the product and the service rendered. In some occasions however, product prices may vary depending on type or manufactuer or even on instance (e.g. custom made products). For these cases, [ChargeItemDefinitions](/docs/api/fhir/resources/chargeitemdefinition) may be created to specify the financial details for a product kind, type or instance.
