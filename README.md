# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![npm version](https://img.shields.io/npm/v/@medplum/core.svg?color=blue)](https://www.npmjs.com/package/@medplum/core) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum) [![Coverage Status](https://coveralls.io/repos/github/medplum/medplum/badge.svg?branch=main)](https://coveralls.io/github/medplum/medplum?branch=main)

![Medplum](packages/docs/static/img/cover.webp)

Medplum is a developer platform that enables flexible and rapid development of healthcare apps.

- **Medplum Auth** - End-to-end identity solution for easy user authentication, sign-in, and permissions using OAuth, OpenID, and SMART-on-FHIR.
- **Medplum Clinical Data Repository (CDR)** - Backend server that hosts your healthcare data in a secure, compliant, and standards based repository.
- **Medplum API** - FHIR-based API for sending, receiving, and manipulating data.
- **Medplum SDK** - Client libraries that simplify the process of interacting with the **Medplum API**.
- **Medplum App** - Web application where you can view your data, perform basic editing tasks. You can also use the Medplum App to manage basic workflows.
- **Medplum Bots** - Write and run application logic server-side without needing to set up your own server.
- **UI Component Library** - React components designed to help you quickly develop custom healthcare applications.

## Docs

- [Contributing](#contributing)
  - [Ground Rules](#ground-rules)
  - [Codebase](#codebase)
    - [Technologies](#technologies)
    - [Folder Structure](#folder-structure)

## Contributing

**We heartily welcome any and all contributions that match our engineering standards!**

That being said, this codebase isn't your typical open source project because it's not a library or package with a
limited scope -- it's our entire product.

### Ground Rules

#### Contributions and discussion guidelines

By making a contribution to this project, you are deemed to have accepted the [Developer Certificate of Origin](https://developercertificate.org/) (DCO).

All conversations and communities on Medplum are expected to follow GitHub's [Community Guidelines](https://help.github.com/en/github/site-policy/github-community-guidelines)
and [Acceptable Use Policies](https://help.github.com/en/github/site-policy/github-acceptable-use-policies). We expect
discussions in issues and pull requests to stay positive, productive, and respectful. Remember: there are real people on
the other side of the screen!

#### Reporting a bug or proposing a new feature

If you found a technical bug on Medplum or have ideas for features we should implement, the issue tracker is the best
place to . ([click here to open a new issue](https://github.com/medplum/medplum/issues/new))

### Writing documentation or blog content

Did you learn how to do something using Medplum that wasn't obvious on your first try? By contributing your new knowledge
to our documentation, you cna help others who might have a similar use case!

Our documentation is hosted on [medplum.com/docs](/docs), but it is built from [Markdown](https://www.markdownguide.org/)
files in our [`docs` package](https://github.com/medplum/medplum/tree/main/packages/docs/docs).

For relatively small changes, you can edit files directly from your web browser on [Github.dev](https://github.dev/medplum/medplum/blob/main/packages/docs/docs/home.md)
without needing to clone the repository.

#### Fixing a bug or implementing a new feature

If you find a bug and open a Pull Request that fixes it, we'll review it as soon as possible to ensure it meets our engineering standards.

If you want to implement a new feature, open an issue first to discuss with us how the feature might work, and to ensure
it fits into our roadmap and plans for the app.

If you want to contribute but are unsure to start, we have [a "good first issue" label](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) which is applied to newcomer-friendly issues. Take a look at [the full list of good first issues](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and pick something you like!

**Ready to get started writing code?** Follow the [local setup instructions](https://www.medplum.com/docs/contributing/local-dev-setup) and jump in!

### Codebase

#### Technologies

With the ground rules out of the way, let's talk about the coarse architecture of this mono repo:

- **Full-stack TypeScript**: We use Node.js to power our servers, and React to power our frontend apps. Almost all of the code you'll touch in this codebase will be TypeScript.

Here is a list of all the big technologies we use:

- **PostgreSQL**: Data storage
- **Redis**: Background jobs and caching
- **Express**: API server
- **TypeScript**: Type-safe JavaScript
- **React**: Frontend React app

#### Folder structure

```sh
medplum/
├── packages
│   ├── agent        # On-premise agent
│   ├── app          # Frontend web app
│   ├── bot-layer    # AWS Lambda Layer for Bots
│   ├── cdk          # AWS CDK infra as code
│   ├── cli          # Command line interface
│   ├── core         # Core shared library
│   ├── definitions  # Data definitions
│   ├── docs         # Documentation
│   ├── examples     # Example code used in documentation
│   ├── fhir-router  # FHIR URL router
│   ├── fhirtypes    # FHIR TypeScript definitions
│   ├── generator    # Code generator utilities
│   ├── graphiql     # Preconfigured GraphiQL
│   ├── hl7          # HL7 client and server
│   ├── mock         # Mock FHIR data for testing
│   ├── react        # React component library
│   └── server       # Backend API server
└── scripts          # Helper bash scripts
```

## License

[Apache 2.0](LICENSE.txt)

Copyright &copy; Medplum 2023

FHIR&reg; is a registered trademark of HL7.

SNOMED&reg; is a registered trademark of the International Health Terminology Standards Development Organisation.

LOINC&reg; is a registered trademark of Regenstrief Institute, Inc.

DICOM&reg; is the registered trademark of the National Electrical Manufacturers Association (NEMA).
