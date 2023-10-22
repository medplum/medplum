# Medplum · GitHub | License, NPM Version, Quality Gate Status, Coverage Status

## Medplum

Medplum is a developer platform that enables flexible and rapid development of healthcare apps.

### Medplum Auth
End-to-end identity solution for easy user authentication, sign-in, and permissions using OAuth, OpenID, and SMART-on-FHIR.

### Medplum Clinical Data Repository (CDR)
Backend server that hosts your healthcare data in a secure, compliant, and standards-based repository.

### Medplum API
FHIR-based API for sending, receiving, and manipulating data.

### Medplum SDK
Client libraries that simplify the process of interacting with the Medplum API.

### Medplum App
Web application where you can view your data and perform basic editing tasks. You can also use the Medplum App to manage basic workflows.

## Medplum Bots
Write and run application logic server-side without needing to set up your own server.

## UI Component Library
React components designed to help you quickly develop custom healthcare applications.

## Docs
Contributing

### Ground Rules
Contributions and discussion guidelines:

By making a contribution to this project, you are deemed to have accepted the Developer Certificate of Origin (DCO).

All conversations and communities on Medplum are expected to follow GitHub's Community Guidelines and Acceptable Use Policies. We expect discussions on issues and pull requests to stay positive, productive, and respectful. Remember: there are real people on the other side of the screen!

### Reporting a Bug or Proposing a New Feature
If you found a technical bug on Medplum or have ideas for features we should implement, the issue tracker is the best place to share with us. [Open a new issue here](link).

### Writing Documentation or Blog Content
Did you learn how to do something using Medplum that wasn't obvious on your first try? By contributing your new knowledge to our documentation, you can help others who might have a similar use case!

Our documentation is hosted on [medplum.com/docs](link), but it is built from Markdown files in our docs package.

For relatively small changes, you can edit files directly from your web browser on Github.dev without needing to clone the repository.

### Fixing a Bug or Implementing a New Feature
If you find a bug and open a Pull Request that fixes it, we'll review it as soon as possible to ensure it meets our engineering standards.

If you want to implement a new feature, open an issue first to discuss with us how the feature might work, and to ensure it fits into our roadmap and plans for the app.

If you want to contribute but are unsure how to start, we have a "good first issue" label which is applied to newcomer-friendly issues. Take a look at the full list of good first issues and pick something you like!

Ready to get started writing code? Follow the local setup instructions and jump in!

## Codebase
Technologies

With the ground rules out of the way, let's talk about the coarse architecture of this mono repo:

Full-stack TypeScript: We use Node.js to power our servers, and React to power our frontend apps. Almost all of the code you'll touch in this codebase will be TypeScript.

Here is a list of all the big technologies we use:

- PostgreSQL: Data storage
- Redis: Background jobs and caching
- Express: API server
- TypeScript: Type-safe JavaScript
- React: Frontend React app

## Folder Structure
`\`medplum/\`
├── `packages`
│   ├── `agent`        # On-premise agent
│   ├── `app`          # Frontend web app
│   ├── `bot-layer`    # AWS Lambda Layer for Bots
│   ├── `cdk`          # AWS CDK infra as code
│   ├── `cli`          # Command line interface
│   ├── `core`         # Core shared library
│   ├── `definitions`  # Data definitions
│   ├── `docs`         # Documentation
│   ├── `examples`     # Example code used in documentation
│   ├── `fhir-router`  # FHIR URL router
│   ├── `fhirtypes`    # FHIR TypeScript definitions
│   ├── `generator`    # Code generator utilities
│   ├── `graphiql`     # Preconfigured GraphiQL
│   ├── `hl7`          # HL7 client and server
│   ├── `mock`         # Mock FHIR data for testing
│   ├── `react`        # React component library
│   └── `server`       # Backend API server
└── `scripts`          # Helper bash scripts

## License
Apache 2.0

Copyright © Medplum 2023

Trademarks:
- FHIR® is a registered trademark of HL7.
- SNOMED® is a registered trademark of the International Health Terminology Standards Development Organisation.
- LOINC® is a registered trademark of Regenstrief Institute, Inc.
- DICOM® is the registered trademark of the National Electrical Manufacturers Association (NEMA).
