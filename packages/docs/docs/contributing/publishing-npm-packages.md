---
sidebar_position: 101
---

# Publishing NPM Packages

This is the process we use to publish new versions of JS/TS NPM packages.

Note that this is separate from deploying code to production.

## Background

This document assumes basic familiarity with NPM dependencies, how `package.json` and `package-lock.json` work, and the difference between `npm install` and `npm ci`.

- [npm ci](https://docs.npmjs.com/cli/v8/commands/npm-ci)
- [Difference between npm i and npm ci in Node.js](https://www.geeksforgeeks.org/difference-between-npm-i-and-npm-ci-in-node-js/)

Publishing NPM dependencies requires being a member of the [NPM Medplum organization](https://www.npmjs.com/org/medplum).

## Steps

First, run the `version.sh` script in the project root directory:

```bash
./scripts/version.sh $OLD_VERSION $NEW_VERSION
```

(TODO: The `version.sh` script should extract `$OLD_VERSION` from package.json).

This script sets `$NEW_VERSION` in all of the necessary places:

- Updates `version` in `package.json` files
- Updates dependency versions for dependencies within the repo
- Updates the version in `sonar-project.properties`

Next, reinstall the package dependencies using the `reinstall.sh` script in the project root directory:

```bash
./scripts/reinstall.sh
```

This purges the `node_modules` directory and `package-lock.json` file, and reinstalls all dependencies. This may sound extreme, but it is a consistent method to ensure reproducible behavior, and avoid configuration drift.

Then, run a full build and test using the `build.sh` script in the project root directory:

```bash
./scripts/build.sh
```

This cleans, builds, tests, and lints all subprojects. Given our strict TypeScript configuration and high test coverage, a passing build typically indicates a high level of confidence that the upgrades were successful.

Finally, run the server and the app for a basic sanity check. While we do have high test coverage, it is not 100%, and tests cannot cover everything. It may take an extra few minutes, but it is always better to be sure.

If all of these steps complete successfully, then prepare a PR for a review.

If the PR is approved, then you can take the final step of actually publishing packages to NPM:

```bash
./scripts/publish.sh
```

This will publish new versions of all of our publicly available NPM packages:

- [@medplum/core](https://www.npmjs.com/package/@medplum/core) - Core library and FHIR client
- [@medplum/definitions](https://www.npmjs.com/package/@medplum/definitions) - FHIR data definitions in JSON form
- [@medplum/fhirtypes](https://www.npmjs.com/package/@medplum/fhirtypes) - FHIR definitions as TypeScript .d.ts
- [@medplum/mock](https://www.npmjs.com/package/@medplum/mock) - Mock FHIR data and mock Medplum client
- [@medplum/react](https://www.npmjs.com/package/@medplum/react) - React component library
