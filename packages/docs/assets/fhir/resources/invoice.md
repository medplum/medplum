## Usage

Tracking Financial information is vital in [Patient](/docs/api/fhir/resources/patient) Administration and Finance systems in most Healthcare [Organizations](/docs/api/fhir/resources/organization). An invoice is a financial document issued by a healthcare provider to a patient or a payer indicating the goods and services (ChargeItems) performed with their quantities and prices.

Example implementations:

- Any solution that tracks billing information and needs to issue invoices
- Private Insurance Providers who want to deliver structured information to patients to increase cost transparency
- Patient apps that want to include information on the amount and reason of the charged costs for the healthcare services a patient received

## Relationships

The existing [Claim](/docs/api/fhir/resources/claim) resource is constricted to use cases where [Claims](/docs/api/fhir/resources/claim) are sent to insurances for reimbursement, in a message-like style. It neither references [ChargeItems](/docs/api/fhir/resources/chargeitem) nor [Accounts](/docs/api/fhir/resources/account).

Competing invoicing standards such as EDIFACT or X12 are aiming at inter-organizational exchange and do not offer human readable representations or traceable links to services rendered which is a requirement for invoicing towards patients. This resource is used where existing [ChargeItems](/docs/api/fhir/resources/chargeitem) in an [Account](/docs/api/fhir/resources/account) are collected to create an [Invoice](/docs/api/fhir/resources/invoice) to be sent out to Individuals or [Organizations](/docs/api/fhir/resources/organization) in a structured way. The invoice is the hospital's view, whereas the [Claim](/docs/api/fhir/resources/claim) is the payer's view on the performed services.

Since the individual [ChargeItem](/docs/api/fhir/resources/chargeitem) resources that make up the line items of the [Invoice](/docs/api/fhir/resources/invoice) do not carry any pricing information, [ChargeItemDefinitions](/docs/api/fhir/resources/chargeitemdefinition) will have to be applied to the [ChargeItems](/docs/api/fhir/resources/chargeitem) in order to calculate the price components for the [Invoice](/docs/api/fhir/resources/invoice) depending on the context of the [ChargeItem](/docs/api/fhir/resources/chargeitem)
