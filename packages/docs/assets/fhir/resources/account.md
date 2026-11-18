## Usage

The [Account](/docs/api/fhir/resources/account) resource acts as a central record against which charges, payments, and adjustments are applied. It contains information about which parties are responsible for payment of the account.

While the [Account](/docs/api/fhir/resources/account) does conceptually have a balance, expressing that balance directly as a resource property is challenging due to the complexity of pricing contracts. An operation to retrieve the current balance of an account is in consideration as future work.

## Relationships

The [Account](/docs/api/fhir/resources/account) itself does not include information about the charges, payments or adjustments, but rather those resources, such as [ChargeItem](/docs/api/fhir/resources/chargeitem) point to the account to which they apply. Payment and adjustment resources have not yet been developed.

## Background and Context

The [Account](/docs/api/fhir/resources/account) resource can be considered a "bucket" to which [ChargeItem](/docs/api/fhir/resources/chargeitem) resources are linked. These charges are processed by a billing system, which determines the responsible parties for the balance of the account. The billing system then submits claims or sends statements to the appropriate parties. Once payment is received, an adjustment is applied to the [Account](/docs/api/fhir/resources/account). The internal calculation of balances and allocation of responsibility is expected to be internal to the billing systems. Only the inputs and outputs of the billing process is communicated in the relevant financial FHIR resources.
