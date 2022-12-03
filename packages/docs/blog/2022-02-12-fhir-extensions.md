---
slug: fhir-extensions-intro
title: Extending Objects through FHIR Extensions
authors:
  name: Reshma Khilnani
  title: Medplum Core Team
  url: https://github.com/reshmakh
  image_url: https://github.com/reshmakh.png
---

# FHIR Extensions are a way to add fields to FHIR objects

When working with customers to set up their apps and workflow we commonly get this request:

**We need to track this extra data, but there is no field for it in the FHIR object. What should we do?**

FHIR Extensions are a relatively simple way to track extra fields associated with a FHIR objects, and Medplum supports versioning and API access for the extensions, just like we do for all FHIR objects.

Here is the [FHIR Extentions official guide](https://www.hl7.org/fhir/extensibility.html).

## Design your Extension

As with any data modeling problem, design of your extension is the hardest part. Most implementations use (1) a top-level extension with the full URL of their institution and then (2) create many sub-extensions with specific values that you want to track.

Let's start with an example: Consider a (fictional) healthcare provider "My Teleradiology Practice" that serves hospitals and clinics throughout the United States with the website `www.myteleradiologypractice.com`.

Continuing in this example, let's say that My Teleradiology Practice serves several hospitals nationwide, each represented as `Organization` FHIR objects.

My Teleradiology Practice has contracted with these hospitals and has an _annual minimum_ and _annual maximum_ number of studies they will perform for those hospitals and want to store that data in Medplum, associated with the relevant FHIR objects.

## Set up URL(s)

To get started, My Teleradiology Practice sets up a URL that serves as the top level extension for these organizational details. This URL can have publicly available content or authenticated conent. Example url (there is no content here, it's just an example):

`www.myteleradiologypractice.com/organization-details`

## Write the data as appropriate using the API

With the URL(s) in place, you can now use them to build the extension. Like the example shown below:

```json
{
  "resourceType": "Organization",
  "name": "City Hospital",
  "extension": [
    {
      "url": "https://www.myteleradiologypractice.com/organization-details",
      "extension": [
        {
          "url": "annualMaximum",
          "valueInteger": 1000
        },
        {
          "url": "annualMinimum",
          "valueInteger": 50
        }
      ]
    }
  ]
}
```

Now this Organization JSON Object, representing a specific organization, also has the annual maximums and annual minimums tracked along with the core data.

## View data in the Medplum Console App

As with any data in Medplum, FHIR objects with extensions will have data versioning and audit history. If you browse to the JSON representation of the object in the [console](https://app.medplum.com/) you can browse the values, and of course access them via the API.

As always, we can help you construct your extension to fit your needs. Contact us at info@medplum.com.
