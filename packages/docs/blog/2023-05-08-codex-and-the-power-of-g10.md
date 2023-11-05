---
slug: codex-and-the-power-of-g10
title: Power of g10 - Codex Case Study
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [interop, fhir-datastore, compliance, case-study]
---

[Codex Health](https://www.codex.health/) enables health systems manage their patient populations with effective remote patient monitoring (RPM) programs for diabetes, cardiovascular diseases and more.

Their offering has a **patient facing** experience, a **provider experience** and **EHR integrations** with Epic, Cerner and others.

They read and write data from EHRs, and collect data from medical devices like CGM, scales and blood pressure monitors.

## Challenging the Status Quo

Historically, services like Codex would have had to connect to EHRs using some combination of system integrators or HL7 V2 over VPN connections which is painful, brittle and costly.

With the roll out of the [Standardized API for Patient and Population Services (g)(10)](https://www.healthit.gov/test-method/standardized-api-patient-and-population-services) by major EHR platforms like Epic and Cerner they are able to connect to multiple health systems via REST based FHIR APIs, _without third party aggregators or VPN Connections._

![The "old" way of connecting](/img/blog/connect-via-integrator-vpn.png)

> (Above) The "old" way of connecting an application to an EHR

![The new way of connecting](/img/blog/connect-via-g10.png)

> (Above) The new (g)(10) based way of connecting an application to an EHR

**This standardized interface allows Codex to provide RPM programs with no setup cost.**

The (g)(10) API is very powerful, as it has build in support for access controls using SMART-on-FHIR oAuth Scopes, enabling:

- Provider Access - allowing Codex physicians and staff to access demographic data, diagnostic reports and notes for patients under their care.
- Patient Access - patients can auth in the Codex application and read and write their own data to their record, without need for IT approval.

This scalable approach allows the Codex team to focus on their service, and not on integrations.

## Using Medplum

Codex uses Medplum as part of their software development cycle, because **Medplum is an [open source](https://github.com/medplum/medplum) implementation of the [(g)(10)](/docs/compliance/onc)**, and so from a developer perspective is the same as Epic, Cerner or others, but with robust tooling and configurable permissions. This streamlines the Codex's teams software development lifecycle and their testing across platforms and products.

This standardized interface driven approach allows them to deliver their two solutions:

- [Foresight](https://www.codex.health/solutions) - an analytics and case management web application for clinicians, that helps them view and manage their patients care
- [Allie](https://www.codex.health/solutions) - a patient facing application that runs on iOS and Android that allows patients to view their care plans and take action.

## Interview with Codex Engineering

Below is a brief interview with the Codex engineering leadership Zane Silver and Yury Staravoitau, about their EHR integrations the transcript is edited for clarity.

Video - 7 mins 51 seconds

<iframe width="560" height="315" src="https://www.youtube.com/embed/ZCmGlio07GY?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

**Background (Zane):** Let me just give you quick refresher of what we're doing here at Codex.

So we're building a remote patient monitoring platform a software solution as well as professional service on top of that. So we sell directly to healthcare providers or DMEs durable medical equipment manufacturers. And they can use our platform to monitor patients remotely if any diseases we connect over Bluetooth.

We have native (iOS, Android) applications, connects over Bluetooth to various blood glucose meters scales, blood pressure monitors. We also do cloud connections for like Dexcom and Freestyle Libre and other CGM devices. A clinician, either at a hospital system or a doctor or technician, might use our platform to be able to monitor or they can out outsource that to us.

We have a licensed disease educators for heart failure, diabetes that we can monitor the patients for them as well. Our internal educators use the same product that we also sell as a platform to the healthcare providers. We integrate directly with EHR systems for those hospital systems, either being able to read or write results back.

So sometimes blood glucose meter results are required in the EHR system, so we do that. We use Medplum as a testing ground and staging ground to make sure that we can properly read and write as well as be able to pull new types of resources records from the healthcare provider themselves.

At this point, a dozen to, well, half a dozen different types of EHR systems: Meditech, Hilo, Epic, Cerner, and others.

We use a multi-tenant system. And so each multi-tenant itself will have its own set of EHRs that's integrated and they're totally isolated across tenants. We are testing connectivity and correctness and being able to pull in those records there.

EHR systems quickly either throttle or crash. So we, we pull in batches and we kind of basically do periodic syncs and then try to do writes in real time.

**Question (Reshma):** How does it work end to end?

Yury: A patient, selects Medplum as healthcare provider login using the account. And authentication that we put that in the background request EHR system to, to grab some data for this user and update our database, get the refresh token, and on a daily basis, we request some updates using this user by ID for example.

Zane: We integrate with EHR systems, right? Yeah. So we wanna be able to test against EHR systems. And because Medplum is an EHR system with also write access, we can test whether or not we can write records and be able to see that as well as manually write records outside of our application.

Make sure we were able to read those as well. You can't do that unless you're actually doing it on a real EHR system. And we can, but not all of our customers have partnerships where they actually allow us to be able to test on their production systems.

We're remote patient monitoring, so we get (FHIR) [Observations](/docs/api/fhir/resources/observation) (from the customer EHR).

The big part it's missing in terms of the spec is just callbacks and being able to get asynchronous updates.

So moving from an event based versus a pull based system. The pull based system is like much more scalable operationally for us. So we don't have any kind of third party dependencies.

> I think for the most part **they (providers) prefer it because there's fewer integration points. They turn on the endpoint and give us, our credentials and they're just ready to go**. We don't have to, you know, do any back doors connecting directly to their databases or anything like that.

So observations came as from our applications that can be connected to via some devices or, for example, we have dramatic error device that I testing for my blood, blood glucose. Or it can be from EHR system.

I'm happy to talk or, you know, feel free to put us, you know, connect us to anyone you feel like I might be interested in and we're happy to also help out and share any of our learnings and thoughts too.

**Question:** Can you do a day in the life for me about when you're talking to the provider and you're engaging their IT to get this kind of access, what the process looks like?

Yeah, it's more of a, I would say like a long engaged relationship in terms of actually getting like the direct access to write and read from systems to system.

> Obviously, with [ONC and data blocking](https://www.healthit.gov/buzz-blog/information-blocking/information-blocking-eight-regulatory-reminders-for-october-6th), we can connect with the provider on our own. We don't coordinate with them to do that in terms of just getting patient consent to read their (FHIR) [resources](/docs/api/fhir/resources). So that's easy if we do that on our own. And then it just takes a little bit of time and talk to the right stakeholders.

The healthcare provider side, find out who the IT team is, get the right people in there and make sure we go through their security reviews. At that point, basically there's, each of the major healthcare providers have their own app portal. So we create an app portal on there. We usually end up giving the healthcare provider what our app ID is, whether it's, you know, app Orchard on Epic.

Cerner has their own developer portal too. Give that to them and then basically they download the app into their system. I don't have any visibility into what that looks like. There says admins do that. And it's usually like a, it takes about 24 hours for that to happen for them to pull it in and then we get their endpoint and it just seems to work for us on that side.

Reshma: So you download their app, but like they're not using the traditional [SMART-on-FHIR](/docs/integration/smart-app-launch) kind of app machinery. It's more that. You're now eligible to get the credentials that you need to connect server to server?

Zane: That is true. Yeah. We, we can use it in terms of if SMART-on-FHIR to be able to do our launch and they do have to have, you know, download the app there.

> But the (Codex) app type is different. So instead of it's a clinician facing app, which is system facing app. So they, the app store kind of on their part, they (provider) have the dropdown that they choose how they want to install it, and it gets installed in their system.

Seems, seems great and it's a lot more scalable in terms of how you can write your application once.

And you don't have to have a custom footprint or like dedicated boxes or instances for each provider.

> Our integration costs are very low, so we don't really even, we don't charge in a new integration or onboarding fees or anything like that for a new customer.

**Question (Reshma):** Are you continuing to roll it out or working on more of the depth scenarios within systems?

I think it's more of just getting more breadth with more provider systems on there. You know, even just this morning we tested Hilo and Meditech, which are two different EHR systems and just getting verified all those seems to work out of the box quite well, which is nice.

**Question (Reshma):** So anyone with a (g)(10) right? A (g)(10) FHIR implementation?

Zane: Yep.

Reshma: Awesome. It's a great story. It's a great, great story and all the FHIR enthusiasts would be excited.

## How It Works

Medplum Client Typescript SDK can be used to connect to the EHR in multiple modes, such as Patient access, oAuth and Basic Auth.

For example use the MedplumClient to connect to another FHIR server from a Bot or other application that has the Medplum client as follows (client credentials).

```typescript
// External EHR Url and credentials
const externalEhrBaseUrl = 'https://ehr.externalprovider.org/FHIRProxy/api/FHIR/DSTU2/';
const externalClientId = '<client_id>';
const externalClientSecret = '<client_secret>';

// Construct client ant authenticate
const externalEhrClient = new MedplumClient({
  baseUrl: externalEhrBaseUrl,
});
await externalEhrClient.startLogin(externalClientId, externalClientSecret);

// Work with the client as needed, for example search
await externalEhrClient.searchResources('Patient?identifier:contains=999-47-5984');
```

## Related Resources

- [Medplum SDK Constructor](/docs/sdk/core.medplumclient._constructor_)
- [Medplum SDK startLogin](/docs/sdk/core.medplumclient.startclientlogin)
