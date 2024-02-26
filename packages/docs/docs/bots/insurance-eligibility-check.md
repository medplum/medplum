---
sidebar_position: 9
---

# Insurance Eligibility Check

Health insurance eligibility checks are a way to fetch information about a given policy, including the plan name, type, status (active or inactive) and any associated benefits. You can use eligibility checks to determine whether a patient's plan will cover particular medical service, treatment or equipment. Furthermore, by combining the relevant benefits, you can come up with an estimate of the coverage amount and patient responsibility.

Insurance billing is complex, and the fact that there are approximately 300 medical billing companies in the US speaks to that. This example will walk through a very simple eligibility check to demonstrate the concepts and data structures.

_This guide includes an example of a bot written in TypeScript, deployed using the [Medplum CLI](https://github.com/medplum/medplum-demo-bots)._

## This guide will show you

- How to represent insurance `Coverage` using FHIR
- How to set up a workflow that runs an eligibility check when `Coverage` is created or modified
- How to perform an eligibility check for a specific combination of policy holder, doctor and medical service (in this case, we use a generic service called `health_benefit_plan_coverage` that returns general benefits)
- How to store the results of the eligibility check for use in your application
- How to trigger an email alert if the policy holder's plan is inactive

## Background: Insurance Eligibility Check Concepts

The term _eligibility check_ implies a yes or no answer, but in practice this tends to be more complex. Medical billing is run off of an [X12](https://x12.org/products/by-industry) data standard, and claims are submitted and managed using that standard. Eligibility checks, though they do not submit a full claim, use some of the data outlined by the format. In this simple example, the request has the following inputs and outputs.

- Data Inputs
  - Patient information like **name** and **date of birth**
  - Information about the **provider**, usually the NPI of the physician providing the service
  - Insurance information
    - An **identifier for the insurance company** providing the coverage
    - An **identifier for the subscriber** (usually found on the insurance card)
  - A **service type**, specifying the type of medical service provided. (For reference: [X12 Service Type Reference](https://x12.org/codes/service-type-codes))
- Data Outputs
  - Is **coverage active** for this service type?
  - What's the **deductible**, and how much has been used to date
  - What's the **out of pocket stop loss** for this policy
  - Is the service **in network** or out of network

## The Workflow

When this implementation is complete we will:

- Create a [Coverage](https://app.medplum.com/Coverage) object in FHIR and the corresponding [Subscription](https://app.medplum.com/Subscription) that triggers when this object is created or edited.
- Trigger a [Bot](https://app.medplum.com/Bot) that gathers all of the necessary information for the eligibility check: the policy holder details, the provider details, and the service type.
- Connect to an external eligibility service, in this case [Opkit](https://opkit.co/), to perform the check.
- Store the details of the eligibility check using two FHIR objects: a [CoverageEligibilityRequest](https://app.medplum.com/CoverageEligibilityRequest) and a [CoverageEligibilityResponse](https://app.medplum.com/CoverageEligibilityResponse).
- Send an email alert if the eligibility check indicates that the policy holder's plan is inactive

## The Implementation

### Account and Policy Setup

- Make sure you have an account on Medplum, if not, [register](https://app.medplum.com/register).
- Create a Bot from your [Admin Settings Panel](https://app.medplum.com/admin/project)
- (Optional) Create a [ClientApplication](https://app.medplum.com/admin/project) on Medplum called "Eligibility Check Bot Client Application".
- (Optional) Create a very restrictive [AccessPolicy](https://app.medplum.com/AccessPolicy) called "Eligibility Check Bot Policy" and restrict to `Coverage`, `CoverageEligibilityRequest`, and `CoverageEligibilityResponse` objects.
- (Optional) In the [ProjectAdmin dashboard](https://app.medplum.com/admin/project) apply the "Eligibility Check Bot Policy" to the `ClientApplication` by clicking `Access`.
- Obtain an API key from Opkit by signing up for their service. Here is the Opkit [Quickstart Guide](https://docs.opkit.co/docs/introduction).

### Bot Setup

Linking the Eligibility Check Service to Medplum is done through [Medplum Bots](https://app.medplum.com/Bot). At a high level, the Bot is linked to a [Subscription](https://app.medplum.com/Subscription) that is configured to fire every time a `Coverage` object is created or edited. The `Coverage` create/edit event triggers the bot, which sends the necessary data for the eligibility check to eligibility service Opkit.

Opkit will respond with the results of the eligibility check. Request data is stored in Medplum as a `CoverageEligibilityRequest`. Response data is stored as a `CoverageEligibilityResponse`. If the policy holder's plan is inactive, an email alert is triggered.

Full [bot source code](https://github.com/medplum/medplum-demo-bots/blob/main/src/eligibility-check-opkit.ts) and [tests](https://github.com/medplum/medplum-demo-bots/blob/main/src/eligibility-check-opkit.test.ts) are available on [online](https://github.com/medplum/medplum-demo-bots).

- Here's how to create a bot that will listen for `Coverage` object changes:
  - First, [create a bot](https://app.medplum.com/admin/project) called Coverage Eligibility Bot. Save the `id`.
  - Then, clone [demo bot repo](https://github.com/medplum/medplum-demo-bots), create a .env file in the root directory and put the ClientId and ClientSecret in the .env file.
  - Add your Opkit public key to the `eligibility-check-opkit.ts` bot.
  - Follow the deployment instructions in the [demo bot repo](https://github.com/medplum/medplum-demo-bots) README.
- Create a `Subscription` that invokes the bot when a `Coverage` object is created. (Here's the guide on [Setting up Subscriptions](./bot-basics#executing-automatically-using-a-subscription))
- When a new Coverage object is created, your bot will trigger. Go to the [Subscription](https://app.medplum.com/Subscription) page that you created to view events and logs.

### Testing your Bot

You can test your bot by running the test code using the Medplum CLI.

```bash
npm t -- src/eligibility-check-opkit.test.ts
```

Once the bot is deployed in production, create a new [Coverage](https://app.medplum.com/Coverage) object to execute the bot.

### Real World Usage

An eligibility check workflow, if designed correctly, can help you identify which patients have insurance coverage for your services and help you communicate with said patients appropriately.

You will want your app to have awareness of the following things and message them to the user:

- Will their insurance cover this service?
- Are they in network or out of network?
- What is their estimated out of pocket cost?

These are a function of the deductible, out of pocket stop loss, in-network data received from the eligibility check.

#### Payer IDs

In this example, we provided a payor identifier (this is usually an insurance company, like Blue Shield) as part of the request, but to make this work in practice, you'll need a correct identifier to send along with the request. Eligibility providers generally use different identifier systems.

If, for example, you are performing an eligibility check with Opkit, you must supply an Opkit payer ID. This is supplied by including the Opkit payer ID as an identifier on the Organization FHIR resource (see `eligibility-check-opkit.test.ts` for an example). To find the appropriate Opkit payer ID for a given insurance company, see [this guide](https://docs.opkit.co/docs/faq#which-payer-should-i-use).

#### Is the service in network?

Eligibility checking systems generally do not keep track of whether a specific provider is in network or not. As a provider, you should maintain a list of which plans are in-network. We recommend maintaining a list of `Organization`s in FHIR and adding a `type` to them indicating whether they are in-network or not. The in-network status will be a big factor in the out-of-pocket cost for the patient.
