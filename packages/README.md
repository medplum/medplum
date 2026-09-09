# Folder structure

Medplum uses [npm workspaces](https://docs.npmjs.com/cli/v8/using-npm/workspaces) for a monorepo configuration.

All workspace packages are in this directory.

```sh
packages
├── agent                 # On-premise agent
├── app                   # Frontend web app
├── bot-layer             # AWS Lambda Layer for Bots
├── ccda                  # C-CDA / FHIR conversion
├── cdk                   # AWS CDK infra as code
├── cli                   # Command line interface
├── cli-wrapper           # npx wrapper for the CLI
├── core                  # Core shared library
├── create-medplum        # npm init medplum project starter
├── definitions           # Data definitions
├── docs                  # Documentation
├── dosespot-core         # DoseSpot SDK
├── dosespot-react        # DoseSpot React SDK
├── e2e                   # End-to-end tests
├── eslint-config         # Shared ESLint configuration
├── examples              # Example code used in documentation
├── fhir-router           # FHIR URL router
├── fhirtypes             # FHIR TypeScript definitions
├── generator             # Code generator utilities
├── graphiql              # Preconfigured GraphiQL
├── health-gorilla-core   # Health Gorilla SDK
├── health-gorilla-react  # Health Gorilla React SDK
├── hl7                   # HL7 client and server
├── mock                  # Mock FHIR data for testing
├── react                 # React component library
├── react-hooks           # React hooks library
├── scriptsure-react      # ScriptSure React SDK
└── server                # Backend API server
```
