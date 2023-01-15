---
authors: reshma
---

# Learning FHIR Quickly

You can use Medplum as a tool to help you learn FHIR quickly.

Fast Healthcare Interoperability Resources (FHIR) specification is a data standard for healthcare that defines how information can be exchanged between systems. (Read more about what FHIR is and it's philosophy and history [here](http://www.hl7.org/fhir/overview.html))

Major healthcare platforms such as Epic and Cerner, as well as big tech - Apple, Google, etc. support FHIR in various capacities, making it increasingly popular.

FHIR is very powerful and expressive, but that can make it hard to understand. It can feel intimidating, even for those with a healthcare background and a lot of domain expertise.

Medplum is designed to help you implement FHIR, of course, but also to help you learn FHIR. The app is built on a JAM stack (Javascript, APIs and Markup), and the API calls are... FHIR API calls!

Using Chrome Developer tools can see directly which calls are made to render the page and quickly get a feel for FHIR and how to write your own app. Here's a brief video tutorial:

[![FHIR Search Tutorial Video](https://img.youtube.com/vi/0aneLa_S-PY/0.jpg)](https://www.youtube.com/watch?v=0aneLa_S-PY)

To try for yourself:

0. Pre-requisite, you have set up your Medplum account and created at least one patient [instructions here](/docs/tutorials/) and are using Google Chrome.
1. Open the Medplum App and navigate to the Patient page.
2. Open up Chrome Developer Tools and navigate to the Network tab and refresh the page [instructions here](https://everything.curl.dev/usingcurl/copyas).

Use the tool to help you construct the objects and searches that you need to build your application. Good luck, and let us know what you build!
