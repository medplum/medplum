# @medplum/e2e

A collection of end-to-end tests to run against Medplum

## Getting started

Before running any tests, you have to install Playwright in your local environment. To do this, run the following command in this directory:

```bash
npm run playwright:install
```

This installs Playwright along with the required Chromium dependency.

## Running the smoke tests

To run the tests, after making sure that both `@medplum/server` and `@medplum/app` are running, run the following command:

```bash
npm run test:smoke
```

## Writing tests

Aside from writing tests manually, you can also use the Playwright codegen tool to create tests by clicking through scenarios in the actual app.

To use the tool, start both `@medplum/server` and `@medplum/app` locally on the default ports and then run the following command:

```bash
npm run playwright:codegen
```
