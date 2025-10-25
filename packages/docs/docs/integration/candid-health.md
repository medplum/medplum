# Candid Health

:::danger

This page is under construction and should not be used as reference material.

:::

[Candid Health](https://www.joincandidhealth.com/) is a revenue cycle automation provider, and this is a [billing](/docs/billing) integration.  This guide walks through the components of the integration.  A successful implementation of the integration will enable the following scenarios:

* Ability to do a (basic) eligibility/benefits check for a patient `Coverage`
* Ability to check claim balance
* Ability to submit a claim
* Synchronize claim status with external systems through the aging process

## Integration Set Up

Setup requires project linking or `Organizations` with the correct identifiers and metadata to your Medplum Project.  Bots ando other automations should be added to enable integration.

## On Demand Workflows

These workflows are triggered by new data or user action in an application.


| Trigger                                | Resource(s) Used                                                                 | Outcome                                                                                                     |
|----------------------------------------|----------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| New `Coverage` created or updated      | `Coverage`, `CoverageEligibilityRequest`, `CoverageEligibilityResponse`          | `CoverageEligibilityResponse` populated with data and `Task` created in case of exception                    |
| `Claim` created or target age          | `Claim`, `ClaimResponse`                                                        | `ClaimResponse` populated with patient responsibility                                                       |
| `Encounter` finalized post visit       | `Encounter`, `Claim`                                                            | `Encounter` synchronized to external API and identifier added to original resource for recordkeeping          |

### Eligibility/Benefits Check

The eligibility and benefits check should be tightly scoped to the implementation and should synchronize the following data

- Check whether Coverage is in force, e.g. whether `30` is active
- Check whether Coverage is in network for service provider or not
- Plan specific benefits, deductibles if available.

### Balance Check

Check and store balances.  Data model TBD.

### Claim Submission

Synchronize the finalized `Encounter` to the [Encounter endpoint for Candid](https://docs.joincandidhealth.com/api-reference/encounters/v-4/create).  A claim will be generated on the Candid side and included in the response.  A copy of that `Claim` resources, with the appropriate identifiers should be saved to the Medplum process.

## Daily Sync Job

Batch job run daily to synchronize all claims updated on that day including status and identifiers.

As part of the daily process the status of the claims created as part of submission will be updated for recordkeeping purposes.

## Related Resources

- [Candid Health API Documentation](https://docs.joincandidhealth.com/introduction/our-products)
- [Billing Documentation](/docs/billing)