---
slug: composability-medplum
title: Composability, Open Source, Standards, API-First
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [integration]
---

![Composability venn diagram](/img/blog/composability-venn-diagram.png)

Composability is the ability of different components or systems to be combined and work together seamlessly. This allows developers to build on existing open source software to create new applications and solutions that meet their specific needs.

As a software engineer, when a system you are using supports enables composability you have this visceral feeling that you are moving fast, and you feel powerful. Ideally, you also feel a sense of confidence and safety, that the application you are building is going to work as expected.

Composability is so important to us here at Medplum that we have used the three biggest tools in our toolbox to enable it for healthcare applications and those are:

- Standards
- Open source software
- API-First design

## Standards

The needs of a healthcare organization are in constant flux. Some days the patient experience is top of mind, other days the provider workflow needs work, and yet other days the needs of payors or partners is crucial.

However, in a organization with active patient flow, upgrading tooling and technology to address needs can be a challenge.

Providers have a stack that looks something like this - with a mix of commercially available tools working together with home grown software. There is often a lively discussion on which tools to pick for which purpose. The diagram below shows (as an example) applications that are written in house as purple, and the ones that are bought in grey - but there are many possible configurations.

![Abstract provider stack](/img/blog/provider-stack-abstract.png)

In practice, a stack might look like the following, with different SaaS, on-premise, or other tools working together to enable a service. Sometimes teams within a company coalesce around a tool, and an information silo within an organization can form. We have even seen some groups where it is a person's job to move data from one tool to another.

![Specific provider stack](/img/blog/provider-stack-specific.png)

After many years of doing implementations like these, and getting these systems to work together, we at Medplum have formed a strong opinion on how to get your stack to evolve to meet your needs and we want to emphasize one word: **standards**.

Getting your application to implement the functionality you need will be so much easier if you have a standards based approach. An example of a standards enabled stack might look:

![Standard provider stack](/img/blog/provider-stack-standards.png)

Here are 5 specific ways standards can help your stack evolve.

| Standard                  | What is it?                                           | Enables what?                                                                |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| OpenID                    | Identity provider standard                            | Bringing on new identity providers when you want/need them                   |
| SCIM                      | Identity data standard                                | Portable identities, replace your auth                                       |
| [FHIR](/docs/fhir-basics) | Clinical data standard                                | Integrating with health systems, payors                                      |
| UMLS                      | Ontology for medications, medical conditions and more | Adding/replacing ePrescribe, billing providers, computing CMS queries, HEDIS |
| OpenAPI(REST)             | Standard to describe REST API                         | Allow others to consume your product/service as API                          |

## Open Source Software

Open source is critical in enabling composability, and that is one of the top reasons why developers love it so much. When developing an application, it is common to get unexpected behavior and get stuck. Sometimes something that sounds so simple, like the way a regex is parsed or the way a dates are compared can cause chaos in or completely block an implementation.

Open source, providing line by line access can greatly speed debugging, and can help users get past blockers that would have caused enormous delays in the past. Similarly, understanding with specificity how something is implemented is critical to extending it.

At Medplum, we care a great deal about having our [open source](https://github.com/medplum/medplum) enable composability. Well organized and tested code, solid abstractions, with great issue management is what we strive for.

## API First Design

Many, many applications have an API, but only allow limited functions to be accessed via the API. This limits the composability of said systems substantially because by definition some of the functions must be done manually in the app.

In healthcare, the most common pattern where you see the limitations of existing platforms is workflow. For example, there is a sophisticated workflow app with data capture, business logic and validation that triggers notifications. Inevitably, when the workflow needs to be amended and many organizations work around this by having humans do data entry and processing, or make an alternate datastore and copy and manipulate the data. This feels slow, is costly and error prone.

At Medplum we take great care to make nearly everything available via [well-documented API](/docs/api). As needs change, if the workflow abstractions (data, users, business logic, notifications) are in place they can be altered to evolve with the changing needs of healthcare.

## In Conclusion

We aim to enable extreme composability for healthcare apps - and we use standards, open source and API-first design to do it. We welcome [your feedback via issues](https://github.com/medplum/medplum/issues) or [discussions](https://github.com/medplum/medplum/discussions).
