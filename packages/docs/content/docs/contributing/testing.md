---
id: testing
title: Testing
weight: 510
---

Medplum strongly believes in the importance of testing.

We use the following tools for testing:

- [Vitest](https://vitest.dev/) as the primary test runner
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) for React testing
  - [@testing-library/dom](https://www.npmjs.com/package/@testing-library/dom) - DOM testing utilities
  - [@testing-library/jest-dom](https://www.npmjs.com/package/@testing-library/jest-dom) - Custom matchers for DOM state, used with Vitest
  - [@testing-library/react](https://www.npmjs.com/package/@testing-library/react) - Ties it all together: Vitest, React, and DOM

Every pull request is analyzed by [Sonarcloud](https://sonarcloud.io/project/overview?id=medplum_medplum) and [Coveralls](https://coveralls.io/github/medplum/medplum?branch=main) for code coverage and other static analysis.

## How to test

To run all tests for all packages, use the build script:

```bash
npm t
```

To run all tests for a single package, use `npm t` inside the package folder:

```bash
cd packages/app
npm t
```

To run tests for a single file, pass in the file name:

```bash
npm t -- src/App.test.tsx
```

To run a single test in a single file, pass the file name and the test name:

```bash
npm t -- src/App.test.tsx -t 'Click logo'
```

Any time you run `npm t`, you can optionally pass in `--coverage` to collect code coverage stats. They will be printed in the terminal:

```bash
npm t -- --coverage
npm t -- src/App.test.tsx --coverage
npm t -- src/App.test.tsx -t 'Click logo' --coverage
```

When run by a coding agent, Vitest switches to its `agent` reporter, which hides console output from passing tests. Pass `--reporter=default` to see it:

```bash
npm t -- src/App.test.tsx --reporter=default
```

## Server tests: unit vs. integration

Tests in `packages/server` are split by whether they need Postgres and Redis, and the file name decides which kind a test is:

| Kind        | File name       | Needs Postgres/Redis | Vitest project           |
| ----------- | --------------- | -------------------- | ------------------------ |
| Unit        | `*.test.ts`     | No                   | `@medplum/server-unit`   |
| Integration | `*.int.test.ts` | Yes                  | `@medplum/server`        |

Unit tests run in parallel worker threads without any global setup, so they are much faster. Integration tests start from a shared global setup that connects to Postgres and Redis.

Name a test `*.int.test.ts` if it uses a database or Redis connection, calls `initApp`, or relies on test helpers that create projects, users or other resources in the database. Everything else should be a plain `*.test.ts`.

The unit project installs a guard that throws if a test opens a connection to Postgres or Redis, with the message "used in a unit test. Tests that need Postgres/Redis must be named `*.int.test.ts`". If you see it, rename the file.

A few integration tests can't run concurrently with others, for example booking tests that conflict in SERIALIZABLE transactions, or tests that delete shared Redis keys. They are listed in `serialTestFiles` in `packages/server/vite.config.ts` and run one file at a time, after everything else, in the `@medplum/server-serial` project.

To run one kind of server test from `packages/server`:

```bash
npm run test:unit          # *.test.ts only
npm run test:integration   # *.int.test.ts, including the serial project
npm t                      # everything
```

Pass a file name after `--` to run a single file, for example `npm run test:unit -- src/fhir/range-column.test.ts`. If a file is in a different project than the script you chose, Vitest reports "No test files found". When running a single file with `npx vitest`, add `--project @medplum/server-unit`, `--project @medplum/server` or `--project @medplum/server-serial` to match.

If a fresh database has never been seeded, run `npm run test:seed` once before the integration tests.
