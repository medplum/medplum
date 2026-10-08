# Medplum Code Examples

This is a directory of code examples used in our documentation. Our goal is to keep examples fresh compiling them as part of our build process

Run the behavioral examples with `npm test --workspace=@medplum/examples`. The package uses Vitest and is included in the repository's Turbo test task and CI test script. TypeScript checks include the tests; the inherited `noEmit` setting keeps the build from emitting them.
