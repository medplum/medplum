# Website

Medplum documentation is built using [Docusaurus 2](https://docusaurus.io/).

## Installation

Medplum documentation should be installed automatically by following the instructions in the base install. See [Medplum README](https://github.com/medplum/medplum).

## Local Development

```bash
npm run docusaurus start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run docusaurus build
```

This command generates static content into the `build` directory.

The FHIR resource pages are generated automatically. In the rare event that they need to be rebuilt, do the following

```bash
cd packages/generator
npm run docs
```

## Deployment

Deployment scripts can be found in `scripts/deploy-docs.sh`
