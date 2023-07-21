# Folder structure

Medplum uses [npm workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces) for a monorepo configuration.

All workspace packages are in this directory.

```sh
packages
├── agent        # On-premise agent
├── app          # Frontend web app
├── bot-layer    # AWS Lambda Layer for Bots
├── cdk          # AWS CDK infra as code
├── cli          # Command line interface
├── core         # Core shared library
├── definitions  # Data definitions
├── docs         # Documentation
├── examples     # Example code used in documentation
├── fhir-router  # FHIR URL router
├── fhirtypes    # FHIR TypeScript definitions
├── generator    # Code generator utilities
├── graphiql     # Preconfigured GraphiQL
├── hl7          # HL7 client and server
├── mock         # Mock FHIR data for testing
├── react        # React component library
└── server       # Backend API server
```
