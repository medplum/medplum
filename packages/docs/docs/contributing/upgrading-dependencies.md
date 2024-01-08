---
sidebar_position: 100
---

# Upgrading Dependencies

This is the process we use to upgrade dependencies. This should approximately once per week to ensure we safely apply all of the latest security patches and upgrades.

## Background

This document assumes basic familiarity with NPM dependencies, how `package.json` and `package-lock.json` work, and the difference between `npm install` and `npm ci`.

- [npm ci](https://docs.npmjs.com/cli/v8/commands/npm-ci)
- [Difference between npm i and npm ci in Node.js](https://www.geeksforgeeks.org/difference-between-npm-i-and-npm-ci-in-node-js/)

Medplum is a monorepo using [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces). That means there is one shared `node_modules` for all subprojects.

As a convention, we pin all dependency versions in `package.json`.

- [How should you pin dependencies and why?](https://www.the-guild.dev/blog/how-should-you-pin-dependencies-and-why)
- [Should you Pin your JavaScript Dependencies?](https://docs.renovatebot.com/dependency-pinning/)

## Steps

First, run the `upgrade.sh` script in the project root directory:

```bash
./scripts/upgrade.sh
```

This runs [npm-check-updates](https://www.npmjs.com/package/npm-check-updates) for the parent project and all subprojects, updating all dependency versions.

Second, apply any exceptions noted below. Some package upgrades are known to be incompatible for various reasons, and they must be addressed manually.

Third, reinstall the package dependencies using the `reinstall.sh` script in the project root directory:

```bash
./scripts/reinstall.sh
```

This purges the `node_modules` directory and `package-lock.json` file, and reinstalls all dependencies. This may sound extreme, but it is a consistent method to ensure reproducible behavior, and avoid configuration drift.

Fourth, run a full build and test using the `build.sh` script in the project root directory:

```bash
./scripts/build.sh
```

This cleans, builds, tests, and lints all subprojects. Given our strict TypeScript configuration and high test coverage, a passing build typically indicates a high level of confidence that the upgrades were successful.

Finally, run the server and the app for a basic sanity check. While we do have high test coverage, it is not 100%, and tests cannot cover everything. It may take an extra few minutes, but it is always better to be sure.

If all of these steps complete successfully, then prepare a PR for a review.

Congratulations, you upgraded dependencies.

## Exceptions

This is a list of dependencies that have known issues with automated upgrades.

### node-fetch

At the time of this writing, we use node-fetch version 2.6.7. The developers of node-fetch have admirably taken the position that ESM-only libs are the future. The version 3 series is ESM-only. Unfortunately, our current server configuration is not yet compatible with ESM-only modules (despite many attempts).

Therefore, for now, we keep node-fetch pinned at the latest version in the version 2 series, which continues to receive security fixes.

In the future, there are 2 possibilities:

- As the ESM ecosystem matures, we eventually support an ESM-only dependency.
- For completely unrelated reasons (i.e., upload progress monitoring), we may move to [Axios](https://www.npmjs.com/package/axios), which would eliminate this exception entirely.
