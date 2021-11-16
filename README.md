# [Medplum](https://www.medplum.com) &middot; [![GitHub license](https://img.shields.io/badge/license-Apache-blue.svg)](https://github.com/medplum/medplum/blob/main/LICENSE.txt) [![npm version](https://img.shields.io/npm/v/@medplum/core.svg?color=blue)](https://www.npmjs.com/package/@medplum/core) [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=medplum_medplum&metric=alert_status&token=207c95a43e7519809d6d336d8cc7837d3e057acf)](https://sonarcloud.io/dashboard?id=medplum_medplum) [![Coverage Status](https://coveralls.io/repos/github/medplum/medplum/badge.svg?branch=main)](https://coveralls.io/github/medplum/medplum?branch=main)

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications.  Medplum includes a FHIR server, React component library, and developer console.

## Docs

- [Contributing](#contributing)
  - [Ground Rules](#ground-rules)
  - [Codebase](#codebase)
    - [Technologies](#technologies)
    - [Folder Structure](#folder-structure)
    - [Code Style](#code-style)
  - [First time setup](#first-time-setup)
  - [Running the app locally](#running-the-app-locally)
  - [Roadmap](https://github.com/medplum/medplum/projects/19)

## Contributing

**We heartily welcome any and all contributions that match our engineering standards!**

That being said, this codebase isn't your typical open source project because it's not a library or package with a limited scope -- it's our entire product.

### Ground Rules

#### Contributions and discussion guidelines

All conversations and communities on Medplum agree to GitHub's [Community Guidelines](https://help.github.com/en/github/site-policy/github-community-guidelines) and [Acceptable Use Policies](https://help.github.com/en/github/site-policy/github-acceptable-use-policies). This code of conduct also applies to all conversations that happen within our contributor community here on GitHub. We expect discussions in issues and pull requests to stay positive, productive, and respectful. Remember: there are real people on the other side of that screen!

#### Reporting a bug or discussing a feature idea

If you found a technical bug on Medplum or have ideas for features we should implement, the issue tracker is the best place to share your ideas. Make sure to follow the issue template and you should be golden! ([click here to open a new issue](https://github.com/medplum/medplum/issues/new))

#### Fixing a bug or implementing a new feature

If you find a bug on Medplum and open a PR that fixes it we'll review it as soon as possible to ensure it matches our engineering standards.

If you want to implement a new feature, open an issue first to discuss what it'd look like and to ensure it fits in our roadmap and plans for the app (see [the main project board](https://github.com/medplum/medplum/projects/23) for planned and currently ongoing work).

If you want to contribute but are unsure to start, we have [a "good first issue" label](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) which is applied to newcomer-friendly issues. Take a look at [the full list of good first issues](https://github.com/medplum/medplum/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and pick something you like!

Want to fix a bug or implement an agreed-upon feature? Great, jump to the [local setup instructions](#first-time-setup)!

### Codebase

#### Technologies

With the ground rules out of the way, let's talk about the coarse architecture of this mono repo:

- **Full-stack TypeScript**: We use Node.js to power our servers, and React to power our frontend apps. Almost all of the code you'll touch in this codebase will be TypeScript.

Here is a list of all the big technologies we use:

- **PostgreSQL**: Data storage
- **Redis**: Background jobs and caching
- **Express**: API, powered by the entire Apollo toolchain
- **TypeScript**: Type-safe JavaScript
- **React**: Frontend React app

#### Folder structure

```sh
medplum/
├── packages
│   ├── app          # Frontend web app
│   ├── core         # Core shared library
│   ├── definitions  # Data definitions
│   ├── docs         # Documentation
│   ├── generator    # Code generator utilities
│   ├── graphiql     # Preconfigured GraphiQL
│   ├── infra        # Infra as code
│   ├── server       # Backend API server
│   └── ui           # React component library
└── scripts          # Helper bash scripts
```

### First time setup

The first step to running Medplum locally is downloading the code by cloning the repository:

```sh
git clone git@github.com:medplum/medplum.git
```

If you get `Permission denied` error using `ssh` refer [here](https://help.github.com/articles/error-permission-denied-publickey/)
or use `https` link as a fallback.

```sh
git clone https://github.com/medplum/medplum.git
```

#### Installation

Medplum has four big installation steps:

1. **Install PostgreSQL**: See [the PostgreSQL documentation](https://www.postgresql.org/download/) for instructions on installing it with your OS.
2. **Install Redis**: See [the Redis documentation](https://redis.io/download) for instructions on installing it with your OS.
3. **Install npm**: See [the npm documentation](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) for instructions on installing it with your OS.
4. **Install dependencies**: Our monorepo uses [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces), so installing dependencies for all projects is done using normal `npm install`:

```sh
cd medplum
npm ci
```

You've now finished installing everything! Let's migrate the database and you'll be ready to go.

### Running the app locally

#### Background services

First, make sure that PostgreSQL and Redis are running.

#### Start the servers

Start the API server:

```sh
cd packages/server
npm run dev
```

#### Develop the web UI

Start the web frontend:

```sh
cd packages/app
npm run dev
```

## License

[Apache 2.0](LICENSE.txt)

Copyright &copy; Medplum 2021

FHIR &reg; is a registered trademark of HL7.

SNOMED &reg; is a registered trademark of the International Health Terminology Standards Development Organisation.

DICOM &reg; is the registered trademark of the National Electrical Manufacturers Association (NEMA).
