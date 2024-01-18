---
slug: medplum-mitre-talk
title: Medplum Talk at MITRE OHS
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
tags: [interop, fhir-datastore]
---

# Medplum Talk at MITRE

[MITRE](https://www.mitre.org/) Open Health Solutions is a leader in healthcare open source and are the makers of [Inferno](https://inferno.healthit.gov/), [Synthea](https://synthea.mitre.org/) and more - which are tools we use all the time here.

Medplum gave a talk at MITRE last fall, that was [recently released](https://youtu.be/D_S7EKe-S5E), and this post contains an annotated transcript and clips, as well as some updates as the talk was last fall, shortly after Medplum's public launch. Transcript has been lightly edited for clarity.

## Medplum Intro and Team Story

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_5 minutes_

**Intro by Mick O'Hanlon**

Welcome to today's OHS Tech Talk. Today we are very lucky to be joined by Reshma Khilnani, who will be giving a talk titled Medplum FHIR Native Web Apps. Reshma is the CEO at Medplum, which is an open source toolkit for building FHIR native web apps. Reshma has an experience as a Visiting Partner at Y Combinator and as a two-time founder in healthcare. She is also an alumna at Meta, Microsoft, Box and BS and MEng course six at MIT. Reshma will cover the opportunity and challenges in developing apps that use FHIR as their data model. She'll also discuss Medplum business model and how they hope to make a living off of open source.

Today's material will include demos and Medplum getting started tutorial.

**Reshma Khilnani**

So what is Medplum? Medplum is a [open source](https://github.com/medplum) toolkit to build FHIR native web applications. At the highest level, that's what it is. Before we dive two into the details with a little story about our founding team.

So these are our founders. We myself, [Cody](https://www.linkedin.com/in/codyebberson/), and [Rahul](https://www.linkedin.com/in/rahul-agarwal-330a979/), notably you'll notice we have a crossover career. I myself have done venture capital, I was early-ish on the team at Facebook. Cody has a career from [Microsoft](https://www.microsoft.com/) and he was at [One Medical](https://www.onemedical.com/) as well on the provider side and, Rahul at [Palantir](https://www.palantir.com/) and [Applied Intuition](https://www.appliedintuition.com/), these are enterprise and very machine learning centric organizations and so we're bringing that experience with us to this.

And I'm going to run through the following agenda.

1. First of all, I'll tell a little bit about our story.
2. Second pain points from our history of building medical applications.
3. I'll go through Medplum's approach and how we're thinking about solving the problems that we have experienced in our career.
4. I'll talk about open source and why we decided to make a commercial open source company and how we think about the opportunity on that front.
5. Then I'll do some, some demos and we can do Q&A.

Like I mentioned with regards to our team, you know, our endeavor in building Medplum is informed by our experience. First of all, in big tech. Microsoft and Meta (Facebook) and getting a sense of professional software engineering in that environment and that type of infrastructure and quality control. Also, the way web applications are developed at that scale was really informed by our careers in big tech.

This **same team** built another startup. It was called [MedXT](https://www.ycombinator.com/companies/medxt), which was a [RIS/PACS](https://en.wikipedia.org/wiki/Radiological_information_system) that was our first endeavor. That was a long time ago. That company was founded in 2012 and was acquired by Box. And then we've also had the opportunity, I myself have worked with a lot of startups. In a time working in venture capital and over the course of my career, and had a chance to work with entrepreneurs who are building applications for the first time, many in healthcare.

We have some experiences in enterprise as MedXT was acquired by Box and we worked with large enterprise customers to implement their healthcare and life sciences workflows. And Cody was a senior director of engineering at One Medical, which is a primary care company that was acquired by Amazon and has a lot of they were real leaders in providing this primary care experience that's accessible and friendly. There were a lot of learnings from building the infrastructure for that company. I was a [Visiting Group Partner at Y Combinator](https://www.ycombinator.com/blog/author/reshma-khilnani), and notable in there I had opportunity to work with a lot of commercial open source companies and learn a lot about why they make sense and how they can help in delivering software in a new way by helping people develop their applications. So that's where we're coming from.

Our experience is also informed by building many applications that are in the healthcare context, I'll include a LIS/LIMS, RIS/PACS, custom EHRs, patient portals, all as examples of medical applications.

## Healthcare Developer Pain Points

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=300" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_5 minutes_

We experience the following pain points. I think there first we'll call it **the terrible choice**, so I'll go into this in a bit of detail, but basically while developing your application, you have to make some trade-offs and it's, it's possible to leave with the impression that, you know, you don't have any good choices.

So [integrations](/products/integration) and [workflow](/products/bots) in healthcare are very difficult, harder, I believe, than other sectors like FinTech to build and maintain. So this is a common problem. And the regulated environment is part of it. The vendor mix is part of it, but in general, this is just an extremely challenging aspect of developing healthcare.

Third. And I'm very interested to hear from this team in particular on this front is **poor data quality is rampant**. Duplication issues, you can't compare records that exist in different institutions. There's lots of subtle issues with the data that make it hard to trust and if you're writing an application and you want it to have good quality data, for example, to report [HEDIS](/docs/analytics#hedis) or something like that, this is often an enormous lift for developers.

So this is a, it's a big problem. And fourth, which I think is related to the first three, is that talent is very scarce. If, you know, it's tempting to think of software engineers as a monolith and there's a labor pool. But really healthcare has its own domain specific nature, and the intersection of those who are software engineers and who are trained in the specifics of the domain is rare.

And in order to build an application, you often have a lot of people who are not trained in healthcare I'm often find myself in the position of telling them to please just [use FHIR](/docs/api/fhir/resources) instead of, create a new [patient](/docs/api/fhir/resources/patient) table create table, patient, patient ID equals X, you know this is a common pattern.

And then the nature of the workforce. Having so many people who are working in the domain who do not have healthcare experience just has a shape to it that's challenging to work with. So those, those are the high level on the pain points. So first let me talk about **the terrible choice**.

Basically consider, say you're company like One Medical, you're a provider. You have a terrible choice. You can build a great tailored experience, but roll all of your own infrastructure or you can use off the shelf products and fight with experience. So this is a common choice that people have to make and **it's easy to be frustrated with this choice.**

If you want your great tailored experience, think about how much work you have to do to build up your [certifications](/docs/compliance), interop and workflows. But if you use the off the shelf product, it's very rigid, so you're stuffing data where it's not meant to be, or you're doing unnatural things to get your system to behave the way you want.

This is a common experience that people have been having with developing these apps for years. And what's notable to me is that other domains have made more, let, for example, **FinTech or insurance technology have a better story** in this regard than I've seen in healthcare. And that is part of the opportunity that they don't have in those other domains the same terrible choice in the same way that we see in healthcare.

Healthcare is harder. Developer productivity and velocity is slower. And sometimes talented engineers choose to work in other sectors. So this is a, this is a pain point and things that we thought about hard when we decided to start Medplum.

So that leads me to the next part, which is our approach, how we've thought about at least chipping away at some of these problems. And I mean, the problems are very hard. I will never want to give people the impression that they will be overcome instantly. But, Medplum is a first step towards addressing some of these problems that we see day to day.

## System Overview

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=590" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_3 minutes_

And the approach is simple. The API is the product. Tery headless product that is interop-ready and features that are designed to be programmed.

Here's an overview of the system: the core Medplum application, then this is an open source application, is right here in purple and this is a source code that you can get on. Internet. It has a data store, FHIR data store, and a [FHIR Rest API](/docs/api/fhir). And so that's a big part of it.

![Medplum system overview](/img/medplum-overview.svg)

We've invested heavily in the [TypeScript SDK](/docs/sdk). And most of our customers and people who are developing on the platform, they're really here. They're writing a white label application on a custom domain, so it's like my `healthcareapp.com`, and they're embedding our SDK. Now, what's notable about this developer paradigm is that.

Right here, this gray box that's running their website is a static JavaScript file. This has no backend and it's meant to be very easy for back to our, the discussion on the labor and labor shortage for somebody who is you know, has a light education in healthcare or they're from a different domain, but they know how to develop apps to help them get productive very quickly.

And they don't have to think about the complexities of the data model, and the [auth](/docs/auth) and all that stuff. They can just focus on the experience that they really care about that's important to them. Notably is that integrations are very important to any healthcare application.

And we think of, integrations are the product so that this is crucial. And we have our infrastructure here called [bots](/docs/bots). You can think of these as like lambdas, you know for example, if you create a new patient, You can invoke one of these lambdas to synchronize that data to a legacy EHR, either via FHIR, HL7.

We support a bunch of data types and we have a [streamlined developer kit](/docs/sdk/core) so that, again one of these developers who don't have a lot of history or training in the domain can be very productive very quickly using this technique. So, and these, we provide the environment, which in which to develop these, and then all the tooling so that you can run them.

So there's really no DevOps from the perspective of the developer. They're just writing their code and hooking it up. And this is a big productivity win. And people bring their own code here. We have some partners who have written their own integrations and we also provide some built-in integrations.

So that's part of the customer experience. We also have [access policies](/docs/access/access-policies) and [identity](/docs/auth/user-management-guide), literacy in general on FHIR and [SMART-on-FHIR](/docs/access/smart-scopes) is growing, and we're part of the message there helping people understand how to use these tools and the scopes and the auth part of what we provide as well.

And we just have a built-in implementation as well as allowing people to [bring their own auth](/docs/auth/methods/external-identity-providers) if that's what they want as a developer. And then [subscriptions](/docs/subscriptions), you can think of these as webhooks, you know allow event driven applications to be built, and I'll show some examples of those in the demo.

## Traditional Healthcare Applications

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=799" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

1 minute

So this is, this is the Medplum overview. And I'll just like compare and contrast that with traditional software healthcare software, which is like a full stack SaaS application that exposes some interfaces. In this model, it's hard to program a system like this. The developer experiences is poor.

Systems that we've built like this tend to be **brittle and slow**, and introp is an afterthought. So we, want to think about how to do this a bit differently from the traditional way. We believe that, assume we are, go back to this view. Like all of the applications, like a LIS/LIMS or a custom EHR or patient facing apps, EDC can all be built in this simplified way.

And it could be an effective developer model to get more productivity, leverage, better interop, and just reduce the investment overall and have better tooling and story. So that's kind of the thinking. So I'll summarize it here. So our approach, you know, interoperability is the product not an afterthought.

So the, I'll emphasize that. It's very common to have a SaaS app with an API software as a service, by the way, app with an API to support interop. That generally is not the same as having a headless and dev tools centric focus, and we really live that difference. The programability of the system is what we focus on and You'll notice that our ui, they, they look very bare bones because we're really focused on the programability.

## Developer Experience and Open Source

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=899" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_4 minutes_

And we hope for a lot of **attention to detail on the developer experience**. We consider testing and test-driven development, CI/CD and [documentation](/docs) as products. And there are things that we deliver and part of our offering and of course our open source. [Open source](https://github.com/medplum/medplum) has a lot of interesting characteristics that are unexpected.

I'll put an example here. We see people, our customers searching our repo all the time. How do I search for resources? Oh, here's an example. And they're just searching in the code for examples for how to implement their own applications and workflow. And it's, a way to help people do a complex implementation without having to build the full stack SaaS app and then hand it to them.

So that's, that's the thinking. And we didn't, we didn't make this up like GitLab, Hashicorp, Vercel, Supabase. These are examples of companies who are doing this in other domains. So GitLab does DevOps and Hashicorp also is on, on the infrastructure side, infrastructure as code. And they're, really focusing on the developer as being their advocate and their own audience that they're trying to reach.

So I'll talk a bit about open source and how we think about it. **So why open source?** That's question. We believe we know that open source enables developer productivity and velocity.

If you are composing complicated systems to implement an application that's very functional, that has to do a lot of things and support lots of features enable to do that effectively. Open source is just a great tool. It's a way for an individual contributor to make a lot of progress without being gummed up with a lot of meetings and compliance and access issues. It's way for devs to also learn about how to do an implementation and a way to build trust.

So once, assuming a developer is our audience and people who we think about as users of the product, we want them to trust it. We want them to think about how to solve their problems, using us as a reference. So that's the thinking. And again, we didn't, make this up, GitLab, Hashicorp, Vercel, Supabase. They, really have a lot of mindshare on this, in other domains.

We are early in our open source life, so I'm really excited for the chance to meet you all and to have your, your thoughts and feedback and engagement as part of this community. But we, you know, we publicly launched in September around 190 GitHub stars, if that's a metric that people care about. We're, just getting started 13 contributors and around 80 in in our discord, and we just released our v1. So we're like you know, in the stage of having, we do have some definitely implementations on the platform and are working to move past the early adopters in this coming year and have some more established players.

**Updated stats as of April 14, 2023 - 622 Github Stars, 25 Contributors, 261 in [Discord](https://discord.gg/medplum)**

## Business Model

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=1136" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_1 minute_

So, That's where we are so far and our business model. So we're really focused on hosting and we have our hosted product [app.medplum.com](/docs/app) where you can [sign up](/docs/tutorials/register), start building your application, and it provides that backend that you know is fully working and easy to. And if you're a developer who wants to get started quickly, then it's a great option.

Then, you know, usually what we think of how we think about deployments is that you kind of decouple them into two parts. So one is the developers, Who want to build the app and they, build their applications the mostly front end applications or integrations. And then once they've made a significant amount of progress, the organization that they're a part of can make a decision.

Do we wanna go [self-hosted](/docs/self-hosting) and, install in our own environment or do we want to use the cloud offering? So we have invested in, [SOC II Type 2](/docs/compliance/soc2) certification, [HIPAA compliance](/docs/compliance/hipaa), and [ONC certification](/docs/compliance/onc). So we're going to really show our work on the compliance side as a way to have people think about using the hosted option.

And again, this is a model that is, is modeled after GitLab and their very successful at doing this in the DevOps world.

## Demos

<iframe width="560" height="315" src="https://www.youtube.com/embed/BIlwyJAFN04?start=1243" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

_10 minutes_

So first of all, I'm gonna demo the following things.

1. So first the [admin console](/docs/app) for developers
2. Next, a sample [patient portal](/solutions/patient-portal)
3. A sample [custom EHR](/solutions/custom-ehr)
4. I'll show our [storybook](https://storybook.medplum.com/), which is our react components
5. Demo of our [documentation](/docs) because as I mentioned documentation is a big part of the product.

I think as a developer developing in this space, the number of times I had to contact someone to even get a copy of the docs makes me irritated. So first of all, admin console. So this is our admin console. You can see here it's `app.medplum.com`, and this is a, developer-centric view of your FHIR data.

We have a list of the resources here on the side and you can just browse your resources. As I'm talking to the folks who work on Synthea, this is largely Synthea Data and. You can add your fields to your list can filter.

And the reason this is potentially interesting is that people are using this in the following way. They are actually learning how to program FHIR This. They go to their work list and they look at their dev tools here and let's see, fetch, they're like copy as curl. So they're learning how to construct their FHIR queries.

And other things this way. It's a great tool for teaching and it's a great way to explore your data. And I'll go into that in a sec. So here's my Synthea data. You can see this is, you know, it's not super beautiful, but it's very functional from a developer perspective. You can see all the linked resources that are linked to this patient.

You can, if you do the same, inspect and copy as curl. You can view the queries to query all the resources related to the patient. Let's see. These are all FHIR objects, so you can, you know, look at 'em, browse 'em, and then this is generated from the FHIR spec. So this is just a very good debugging tool where you can see all the fields.

Great. You can touch them up if you need to. This is common when doing a deployment. Just add your identifiers, for example, or change address. If you don't yet have an app that's fully functioning, you can see the history started by Synthea. And blame. So if you're running a deployment, it's very often that you wanna be, who [changed this data](/docs/sdk/core.medplumclient.readhistory). So this is a great tool for that. JSON representation. And then there's this concept of apps basically if you have. [Questionnaires](/docs/questionnaires) that are linked to this, to the patient object, then you can just link them here. They are automatically linked here. So that's a example. So yeah, that this is, this is the admin console.

It's very powerful. It helps. The developer have like an on-ramp into FHIR that you know, for a novice developer it can be pretty intimidating. For this crew, I'll show the batch upload like. I, I think one of the top search items on our website is Synthea. People generate their Synthea, or use Synthea from files from GitHub and just upload them here or paste them as JSON here and then, use that to quick start and prototype their application.

I would invite all of you all who, if you're making demos or you want to have a little environment to share with people, That would be, you know, we would love to have you use the free offering. That would be great. And we'd really like that. We support [all of the resources](/docs/api/fhir/resources). We just have like some, this account just has these ones configured, but you can change your user profile to have the quick links that you want.

And there's a lot of administrative tools to, to help you get started. One thing I'll note here. Is that there's this concept of [bots](/docs/bots) that we talked about. So if you have a bot, this is basically like it's code, that executes. For example, in this example if a patient fills out a questionnaire and you have a questionnaire response and you want to like compute some in this case, this is the SDOH, I think social determinants of health.

Then you can use, build out your scoring function and if you want to write it as an [observation](/docs/api/fhir/resources/observation), you can implement a lightweight workflow here. This is just a very common thing and the bots have, you know, different flavors. There's integration bots synchronizing to insurance, you know this is what a lot of the developers on the platform are.

I'll go briefly into the questionnaire as well, because a lot of developers, they are focused on the patient experience or the provider experience, but the, they're setting up their questionnaires and stuff in the admin tool and this is a, **Google forms type experience for your FHIR questionnaire**.

So here's the builder can, wow, this one's really big add item. You can change, the display can change go through a bunch of different. Editing and it's, this is just, a way to build it. It just ends up being, your [FHIR questionnaire object](/docs/api/fhir/resources/questionnaire) and you have the history and the, and the blame, et cetera, just like the other resources.

And then you can preview what it will look like. And this is not very impressive in and of itself, except that this, you can, you can use. Form and embed it in your application. So that's, the real use case. And people are tagging them with their various ontologies.

I don't have a good one here right now, but like, you know, where, where did this form come from? What ontologies is it tagged with? That's very useful generally for getting your, your workflow to work, right. I. Okay. Let's see. So once you have all of these like resources in place your questionnaires, your integrations, and you can start building a more powerful app.

So I'll show you kind of in context. So this is [foomedical.com](https://foomedical.com/). All this is also an [open source](https://github.com/medplum/foomedical) application. If you go to `foomedical.com` and just look at the footer, you can get to the documentation and stuff and you can log in. It's a sample. It's not a real healthcare practice, but you can have like a very cool patient portal that looks white label.

That's all FHIR native. And these are FHIR resources. I'll show you some examples here. Here's the lab result. Medications. It's a medication object. Vaccinations, vitals, blood pressure. This is based off of Synthea Data by the way, but and kind of body temperature. You can add measurements if you want.

And this is the core data model. All, the data for this is living on `app.medplum.com`. Foomedical is a static JavaScript site. It's a streamlined developer experience for a novice. Care plans, checklist. There's a lot of discussion in the community on how to, represent care plans and I'm curious on this team's perspective as well, but also get care, you know this is just a FHIR [schedule](https://storybook.medplum.com/?path=/docs/medplum-scheduler--docs) with slots.

Questionnaires, but these are composing all of the things that you've set up in your app, in your admin console into an experience that's sensible for the users. And it has, you know a lot of other, FHIR resources. I think this example uses like 40 or 50 different type of resources in order to get this experience.

But it absolutely can be supported. We have a alpha version of the Foo Medical provider as well, which is like a very simple EHR. I won't go to this in depth, but you can, you can kind of see very similarly. This is the, questionnaire object, which. Is actually comes, you know, that we saw previously here in the admin console.

So, and this is just a FHIR questionnaire object, so this is kind of helps people administer their practice in a more effective way. Let's see. So patient portal, sample custom EHR. I want to save time for questions, so I'm just gonna blitz through the rest of these. But we have our storybook here online, which is just our React components.

These React components. Map generally to FHIR objects or FHIR data types. I'll, I'm showing like the diagnostic report display here because one of our claims to fame is that one of our customers has built a LIS/LIMS, which has been certified by CLIA/CAP, on top of Medplum. And they use this [diagnostic report display](https://storybook.medplum.com/?path=/docs/medplum-diagnosticreportdisplay--docs), which the CAP inspector has looked at, and you can see the code.

This is just a, you know, diagnostic report we have if you search in our, our repos for this, you can see the object. So it's, it's got a lot of tools to help, you know, smooth the onboarding for the, for the users and for the developers. And then finally, the [storybook](https://storybook.medplum.com/), I think is one of the top things that developers are looking at in order to help build their applications more effectively.

Finally, I'll move on to the documentation. So we invest a lot in our docs and we absolutely, we want feedback. So if anybody is just looks at the docs, they find something they don't. File a GitHub issue. We're happy to talk about it. It's the subject matter for, and the subject matter is very dense.

So like, it's a, it is a tough job to really document it in a way that makes sense for users, but we are working on it. One thing I'll point out here is that we have [sophisticated search](/search). As very popular. And so like, oh, how do I [invite a user](/docs/auth/user-management-guide)? Okay, great. Or, you know, I want to look at observation.

And documentation is all [in GitHub](https://github.com/medplum/medplum/tree/main/packages/docs), so if you ever wanted to contribute to, to documentation, write some tutorials we would absolutely welcome that. And this is part of our open source project, so again, can just go there. Great. And I think you know, we have our, our core repo and would have our, our lots of tooling and build associated with it.

Let me see if I can find, okay, so one thing I will note here is we have like a pretty sophisticated build system, which is [all publicly available](https://github.com/medplum/medplum/tree/main/.github) and it has code scanning and actually probably the best way to see it and I'm also interested to talk to this group about is we have our build of course, Which includes a lot of code coverage and, and important things like that, code analysis.

And if there was like testing tools made. By MITRE and other groups that could be incorporated into a build. We think that that would be really high value. For example, like just be able to test your conformance or ontologies or terminology. The, all of those things would be just very helpful and we hope to you know, bend your ear on it or have the opportunity to at some point.
