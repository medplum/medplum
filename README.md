# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![npm version](https://img.shields.io/npm/v/@medplum/core.svg?color=blue)](https://www.npmjs.com/package/@medplum/core) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum) [![Coverage Status](https://coveralls.io/repos/github/medplum/medplum/badge.svg?branch=main)](https://coveralls.io/github/medplum/medplum?branch=main) [![Featured on Openbase](https://badges.openbase.com/js/featured/@medplum/core.svg?token=UnCQpn8imdOYaqKQa6AI2km3rXx5shpt6bKIoGj3KMk=)](https://openbase.com/js/@medplum/core?utm_source=embedded&utm_medium=badge&utm_campaign=rate-badge)

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
    - [Code Style](#code-style)
  - [First time setup](#first-time-setup)

## Contributing

**We heartily welcome any and all contributions that match our engineering standards!**

That being said, this codebase isn't your typical open source project because it's not a library or package with a limited scope -- it's our entire product.

### Ground Rules

#### Contributions and discussion guidelines

By making a contribution to this project, you are deemed to have accepted the [Developer Certificate of Origin](https://developercertificate.org/) (DCO).

All conversations and communities on Medplum agree to GitHub's [Community Guidelines](https://help.github.com/en/github/site-policy/github-community-guidelines) and [Acceptable Use Policies](https://help.github.com/en/github/site-policy/github-acceptable-use-policies). This code of conduct also applies to all conversations that happen within our contributor community here on GitHub. We expect discussions in issues and pull requests to stay positive, productive, and respectful. Remember: there are real people on the other side of that screen!

#### Reporting a bug or discussing a feature idea

If you found a technical bug on Medplum or have ideas for features we should implement, the issue tracker is the best place to share your ideas. Make sure to follow the issue template and you should be golden! ([click here to open a new issue](https://github.com/medplum/medplum/issues/new))

#### Fixing a bug or implementing a new feature

If you find a bug on Medplum and open a PR that fixes it we'll review it as soon as possible to ensure it matches our engineering standards.

If you want to implement a new feature, open an issue first to discuss what it'd look like and to ensure it fits in our roadmap and plans for the app.

If you want to contribute but are unsure to start, we have [a "good first issue" label](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) which is applied to newcomer-friendly issues. Take a look at [the full list of good first issues](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and pick something you like!

Want to fix a bug or implement an agreed-upon feature? Great, jump to the [local setup instructions](#first-time-setup)!

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
│   ├── mock         # Mock FHIR data for testing
│   ├── react        # React component library
│   └── server       # Backend API server
└── scripts          # Helper bash scripts
```

### First time setup

See developer setup documentation: https://www.medplum.com/docs/contributing

## Careers

![Medplum is hiring](packages/docs/static/img/hiring.webp)

Medplum is hiring! Learn more on our [careers page](https://www.medplum.com/careers).

## License

[Apache 2.0](LICENSE.txt)

Copyright &copy; Medplum 2023

FHIR&reg; is a registered trademark of HL7.

SNOMED&reg; is a registered trademark of the International Health Terminology Standards Development Organisation.

LOINC&reg; is a registered trademark of Regenstrief Institute, Inc.

DICOM&reg; is the registered trademark of the National Electrical Manufacturers Association (NEMA).
