---
slug: vanya-and-medplum
title: Vanya for Browsing Data on Medplum's FHIR Server
authors:
  name: Cody Ebberson
  title: Medplum Core Team
  url: https://github.com/codyebberson
  image_url: https://github.com/codyebberson.png
tags: [auth, case-study]
---

# Vanya for Browsing Data on Medplum's FHIR Server

[Darren Devitt](https://www.linkedin.com/in/darrendevitt/), a respected FHIR expert, has recently released an alpha version of a new tool called [Vanya](https://vanyalabs.com/). Similar to how Postman functions for API requests, Vanya is designed specifically for browsing data on FHIR servers.

I've taken some time to test Vanya with Medplum's FHIR server, and I want to share the setup process, some tricks I've found useful, and a brief overview of my experience.

### Setting Up Vanya with Medplum's FHIR Server

If you've decided to give Vanya a try, here's what you need to know to get it running with Medplum's FHIR server:

#### FHIR Base URL

You'll need to input the FHIR base URL, not just the server base URL. Remember to include the "fhir/R4" path. For example, when using the Medplum Staging server, I used the full URL "https://api.staging.medplum.com/fhir/R4".

#### Authentication

Vanya requires authentication as an HTTP header. For my testing, I used a "Basic" auth header created using the client ID and client secret.

You can use a tool such as [DebugBear](https://www.debugbear.com/basic-auth-header-generator) to generate a Basic auth header from a client ID and client secret.

Or, if you prefer, you can use the OAuth2 client_credentials flow with the client ID and client secret to get an access token. See our [guide on Client Credentials](/docs/auth/methods/client-credentials) for step-by-step instructions.

Once you have a Basic auth token or a Bearer token, add it to the Vanya HTTP headers:

![Enter Vanya auth header](/img/blog/vanya-auth-header.webp)

### Using Vanya

Once you've set up these parameters, you can start using Vanya to browse through different types of FHIR data on the Medplum server.

![Vanya client screenshot](/img/blog/vanya-client-screenshot.webp)

### Wrapping Up

Vanya is still in its alpha stage, and there's a lot to look forward to as it continues to develop. However, even now, it offers a useful tool for browsing FHIR data. I'll be keeping an eye on the tool's progress, and I'll share any important updates here.

Give Vanya a try and let us know about your experience. If you have any questions or need help with the setup, please [join our Discord](https://discord.gg/medplum)!
