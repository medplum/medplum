---
slug: understanding-fhir-questionnaires
title: Understanding FHIR Questionnaires
authors:
  name: reshma
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
---

# Easy Custom Forms for Your Healthcare App

At Medplum we know that customizable forms are critical for any healthcare app. Is it even a healthcare app without tons of forms?

To serve that need, we have created a Form builder similar to common tools like [SurveyMonkey](https://www.surveymonkey.com/) or [Google Forms](https://docs.google.com/forms) but based on the [FHIR Questionnaires](https://www.hl7.org/fhir/questionnaire.html).

FHIR Questionnaires are very powerful and are widely used in healthcare systems. Medplum can help you author questionnaires or import them from other systems and manipulate them programmatically to get the workflow and data capture you desire.

Here is a 2 minute video introducing the product.

[![Medplum FHIR Questionnaires](https://img.youtube.com/vi/mOBC0VYtCLE/0.jpg)](https://www.youtube.com/watch?v=mOBC0VYtCLE)

## Here's how to get FHIR Questionnaires set up

0. This tutorial assumes you have registered for an account. If you have not, you can do so [here](/docs/tutorials/register).
1. You can create new questionnaires using the [Questionnaire Tool](https://app.medplum.com/Questionnaire/new) on Medplum. (Here are all [Questionnaires](https://app.medplum.com/Questionnaire) in your account.)
2. You can use the Builder to add questions that have different types, and they can be common types like `strings` or `integers`, or they can be FHIR objects like `Organizations` or `Patients`
3. Each questionnaire has one or more `Subject`s, which will link the Questionnaire in the tool to the `Subject` data type. For example if the `Subject` is a `Patient`, then the Questionnaire can be found in the `Apps` tab on the `Patient` object (see video to get a visual).
4. Once the `Form` is filled out a [QuestionnaireResponse](https://app.medplum.com/QuestionnaireResponse) will be created with all the appropriate data.
5. This is an advanced topic which will be covered in another tutorial, but you can use [Bots](/docs/bots) to create new FHIR objects and execute an advanced workflows.
6. Questionnaires can be embedded in applications such as your webapp, this is also an advanced topic for another time but if you want to get started building app [start here](/docs/questionnaires)

## Open Source Questionnaires

There are tons of standard questionnaires available online, and some institutions have proprietary ones that are tailored for a use case, or in some cases even validated experimentally.

Some institutions publish their questionnaires - for example:

- [MDCalc](https://www.mdcalc.com/) publishes a large number of questionnaires like [PHQ9](https://www.mdcalc.com/phq-9-patient-health-questionnaire-9)
- [Ages and Stages](https://agesandstages.com/products-pricing/asq3/) publishes widely used pediatric screening tools.

Having a well managed and documented Questionnaire set with version tracking and attribution can be a huge asset for an organization and we encourage everyone to think of it as such.
