# Website

Medplum documentation is built using [Docusaurus 2](https://docusaurus.io/).

## Installation

Medplum documentation should be installed automatically by following the instructions in the base install. See [Medplum README](https://github.com/medplum/medplum).

## Local Development

```bash
npm run dev
```

This command generates the SDK reference pages (`docs/sdk`, from `@medplum/core`), starts a local development server with an increased Node heap, and opens up a browser window. Most changes are reflected live without having to restart the server.

The server listens on port `3100`, which is kept clear of the rest of the Medplum stack (the app uses `3000` and the provider example uses `3001`), so it can run alongside them. To use a different port:

```bash
npm run dev -- --port 3200
```

> The raw `npm run docusaurus start` still works, but it skips the SDK-docs generation, heap tuning, and port choice that `npm run dev` handles for you. On a fresh checkout it fails with `Invalid sidebar file at "sidebars.ts"` (missing `sdk/core*` pages) and may run out of memory, so prefer `npm run dev`.

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
