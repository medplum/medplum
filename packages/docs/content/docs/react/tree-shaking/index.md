---
id: tree-shaking
title: Tree Shaking
weight: 110
---

Tree shaking, also known as dead code elimination, is a technique to keep JavaScript bundle sizes as small as possible.

Removing such code has several benefits: it shrinks program size, an important consideration in some contexts, and it allows the running program to avoid executing irrelevant operations, which reduces its running time.

## How to use Tree Shaking

Step 1 - Use a bundler that supports tree shaking, such as Webpack, Rollup, or Vite.

Step 2 - Preserve ES Modules (ESM) in the JavaScript sent to your bundler so it can analyze imports and remove unused exports.

- TypeScript: Use [`"module": "esnext"`](https://www.typescriptlang.org/tsconfig#module)
- Webpack: [ECMAScript Modules](https://webpack.js.org/guides/ecma-script-modules/)
- Rollup uses ESM automatically
- Vite uses ESM automatically

## How to verify it is working

We recommend using the [`source-map-explorer`](https://www.npmjs.com/package/source-map-explorer) tool to analyze which dependencies end up in your production build. `source-map-explorer` reviews build output, so it represents the code that will actually be shipped to the browser.

## Example

The [Medplum Hello World](https://github.com/medplum/medplum/tree/main/examples/medplum-hello-world) project uses tree shaking. Build the application with source maps enabled and use a bundle analyzer to inspect which dependencies are included.

![Medplum Hello World Tree Shaking](./tree-shaking.png)

## Behind the scenes

Medplum libraries such as `@medplum/core` and `@medplum/react` follow best practices, so tree shaking should work automatically for most build tools.

- Libraries expose an ESM entry point that lets bundlers analyze named imports
- Package metadata identifies side effects; `@medplum/react` preserves CSS imports with `"sideEffects": ["*.css"]`

## Additional reading

- [Dead-code elimination](https://en.wikipedia.org/wiki/Dead-code_elimination)
- [Webpack Tree Shaking](https://webpack.js.org/guides/tree-shaking/)
- [Rollup Tree Shaking](https://rollupjs.org/guide/en/#tree-shaking)
