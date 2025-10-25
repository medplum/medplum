---
sidebar_position: 100
---

# Upgrading Dependencies

Medplum upgrades dependencies regularly to ensure we have the latest security patches and bug fixes. This document describes the process for upgrading dependencies.

Every Monday at 9:00 AM UTC, the "Upgrade Dependencies" Github Action runs automatically (see `.github/workflows/upgrade-dependencies.yml`). This action does the following:

1. Runs the `upgrade.sh` script, which updates all dependencies to the latest versions.
2. Runs the `reinstall.sh` script, which reinstalls all dependencies.
3. Creates a new branch and opens a pull request.

## Exceptions

This is a list of dependencies that have known issues with automated upgrades.

### node-fetch

At the time of this writing, we use node-fetch version 2.7.0. The developers of node-fetch have admirably taken the position that ESM-only libs are the future. The version 3 series is ESM-only. Unfortunately, our current server configuration is not yet compatible with ESM-only modules (despite many attempts).

Therefore, for now, we keep node-fetch pinned at the latest version in the version 2 series, which continues to receive security fixes.

In the future, there are 3 possibilities:

- As the ESM ecosystem matures, we eventually support an ESM-only dependency.
- Move to built-in `fetch` which requires Node.js 20 ([#1563](https://github.com/medplum/medplum/issues/1563))
- For completely unrelated reasons (i.e., upload progress monitoring), we may move to [Axios](https://www.npmjs.com/package/axios), which would eliminate this exception entirely.
