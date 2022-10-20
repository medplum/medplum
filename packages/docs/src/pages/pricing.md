---
id: pricing
slug: /pricing
---

# Pricing

When you have selected your offering fill out [this form](https://forms.gle/ZQZq1iWjjWMkUwc9A) to activate your account and receive your agreements. For questions about pricing please reach out to us at hello@medplum.com.

## Cloud Hosted

| Edition                                               | Free<sup>[1](/pricing#footnotes)</sup> | Developer<sup>[2](/pricing#footnotes)</sup> | Production<sup>[3](/pricing#footnotes)</sup>   | Enterprise<sup>[4](/pricing#footnotes)</sup> |
| ----------------------------------------------------- | -------------------------------------- | ------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| **Pricing**                                           | Free                                   | $300/mo                                     | $2000/mo                                       | Contact Us                                   |
| Standard BAA                                          |                                        | ✔️                                          | ✔️                                             | Contact Us                                   |
| Standard MSA                                          |                                        |                                             | ✔️                                             | Contact Us                                   |
| Data Usage<sup>[5](/pricing#footnotes)</sup>          | Up to 500 FHIR Resources               | Up to 1k FHIR Resources                     | Up to 50k FHIR <br/> Resources                 | Contact Us                                   |
| Bots and Automation<sup>[6](/pricing#footnotes)</sup> | None                                   | 1k executions                               | 5k executions                                  | Contact Us                                   |
| Emails sent                                           | None                                   | 50/mo                                       | 500/mo                                         | Contact Us                                   |
| Open Onboarding                                       | Testing Only                           | Testing Only                                | ✔️                                             | ✔️                                           |
| Custom Domain                                         | None                                   | None                                        | 1                                              | Contact Us                                   |
| Pre-Built Integrations                                |                                        |                                             |                                                | ✔️                                           |
| Single Tenant                                         |                                        |                                             |                                                | Contact Us                                   |
| Support                                               | Discord and Github                     | Discord and Github                          | Slack, Email <br /> 6 hr SLA business hours PT | Contact Us                                   |
| **Security**                                          |                                        |                                             |                                                |                                              |
| Enable Google Auth                                    | ✔️                                     | ✔️                                          | ✔️                                             | ✔️                                           |
| Require Google Auth<sup>[7](/pricing#footnotes)</sup> |                                        | ✔️                                          | ✔️                                             | ✔️                                           |
| WAF Blocking                                          |                                        |                                             | ✔️                                             | ✔️                                           |
| IP Logging and Restriction                            |                                        |                                             |                                                | ✔️                                           |
| Observability Suite                                   |                                        |                                             |                                                | ✔️                                           |
| SAML                                                  |                                        |                                             |                                                | ✔️                                           |
| Access Policies                                       | Testing only                           | 5                                           | 20                                             | Contact Us                                   |
| **Compliance**<sup>[8](/pricing#footnotes)</sup>      |                                        |                                             |                                                |                                              |
| SOC 2                                                 | ✔️                                     | ✔️                                          | ✔️                                             | ✔️                                           |
| CLIA/CAP                                              |                                        |                                             |                                                | ✔️                                           |

## Self-Hosted

| Edition                    | Community<sup>[9](/pricing#footnotes)</sup> | Enterprise Managed<sup>[10](/pricing#footnotes)</sup> |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Pricing                    | Free                                        | Contact Us                                            |
| Standard BAA               |                                             | Contact Us                                            |
| Standard MSA               |                                             | Contact Us                                            |
| Data Usage                 |                                             | Unlimited                                             |
| Bots and Automation        | Unlimited                                   | Unlimited                                             |
| Emails sent                |                                             | Unlimited                                             |
| Open Onboarding            |                                             | ✔️                                                    |
| Custom Domain              | DIY                                         | Contact Us                                            |
| Pre-Built Integrations     |                                             | Contact Us                                            |
| Single Tenant              |                                             | ✔️                                                    |
| Support                    | Discord and Github                          | Contact Us                                            |
| **Security**               |                                             |                                                       |
| Enable Google Auth         | DIY                                         | Contact Us                                            |
| Require Google Auth        | DIY                                         | ✔️                                                    |
| WAF Blocking               | DIY                                         | ✔️                                                    |
| IP Logging and Restriction | DIY                                         |                                                       |
| Observability Suite        | DIY                                         | ✔️                                                    |
| SAML                       | DIY                                         | ✔️                                                    |
| Access Policies            | ✔️                                          | ✔️                                                    |
| **Compliance**             |                                             |                                                       |
| SOC 2                      | DIY                                         | Contact Us                                            |
| CLIA/CAP                   | DIY                                         | Contact Us                                            |

## Footnotes

1. **Free**: recommended for prototyping or learning.
2. **Developer**: recommended for developer environments or test environments.
3. **Production**: recommended for production use, e.g. treatment of patients or conducting research.
4. **Enterprise**: recommended for institutions with complex workflow, integration or data requirements.
5. Data usage refers to the creation of [FHIR Resources](/docs/tutorials/api-basics/create-fhir-data), this figure is cumulative.
6. Bots and automation refer to custom logic written by customers to execute their workflow. [Automation](/products/automation) documentation and [integration](/products/integration) are a good place to learn more.
7. Organizations can require that all logins go through Google Authentication.
8. Many complex compliance scenarios can be supported with this infrastructure, you can read more on the [compliance page](/docs/compliance).
9. **Community**: refers to self-hosting the [medplum application](https://github.com/medplum/medplum).
10. **Enterprise Managed**: recommended for those who must host the application on their own cloud infrastructure.
