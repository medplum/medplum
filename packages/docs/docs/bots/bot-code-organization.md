---
sidebar_position: 3
toc_max_heading_level: 3
---

# Bot Code Organization and Build Setup

As your integration grows, you will likely end up with multiple bots that share common logic — API client setup, FHIR resource transforms, shared constants, and so on. Without a strategy, this leads to duplicated logic across bot files that become hard to maintain, quickly growing to thousands of lines.

This guide explains how to structure a multi-bot project so that shared code lives in one place, while each deployed bot remains a single self-contained file (as Medplum requires).

:::note[Prerequisites]

This guide assumes you're comfortable with the basics of writing and deploying bots. If not, start with [Bots in Production](/docs/bots/bots-in-production) first.

:::

:::note[Coming from Python or C#?]

This guide is TypeScript-only — Medplum's built-in bot runtime executes JavaScript. If you want to write bot logic in another language, see [External Lambda Functions](/docs/bots/external-function), where you host your own Lambda and Medplum calls it via HTTP.

If you're writing TypeScript for the first time, the build step may feel unfamiliar. Think of it like a compiler output: you write modular source files, and the toolchain produces a single deployable artifact per bot. You never ship your `src/` folder — only the compiled output.

:::

## The Single-File Constraint

Medplum deploys **one JavaScript file per bot**. This is by design: it keeps the deployment unit simple and portable across runtimes (Lambda, VM context). That file must contain your shared `src/` modules and any **third-party** libraries you depend on, **except** packages you mark as `external` because they are already supplied by the Medplum bot runtime (for AWS Lambda, the [bot Lambda layer](https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json)).

For a single bot this is fine. For a project with many bots sharing common logic, you need a way to write modular source code while still producing a single file per bot at deploy time. The answer is a bundler.

## Project Structure

Organize your source into two directories:

```
my-bots/
├── src/
│   ├── bots/               # One file per bot
│   │   ├── send-order.ts
│   │   ├── receive-result.ts
│   │   └── sync-patient.ts
│   └── common/             # Shared utilities imported by bots
│       ├── connection.ts
│       ├── order-utils.ts
│       └── constants.ts
├── dist/
│   └── bots/               # Compiled output — one file per bot
│       ├── send-order.js
│       ├── receive-result.js
│       └── sync-patient.js
├── esbuild.mjs
└── package.json
```

Each file in `src/bots/` exports a single `handler` function. Each file in `src/common/` is a plain TypeScript module — no bot-specific logic.

## Bundling with esbuild

[esbuild](https://esbuild.github.io/) is a fast JavaScript bundler that compiles each bot into one deployable file, inlining your `../common/` imports and (by default) **npm packages** from `node_modules`. Packages listed in **`external`** are left as `require()` calls — on AWS Lambda, Medplum resolves those from the **bot Lambda layer**, so list every layer-provided package you import to avoid bloating the bundle or duplicating runtime libraries. The layer’s package catalog is defined in Medplum’s [`packages/bot-layer/package.json`](https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json). Other bundlers work too, as long as they support inlining local imports and marking those imports as external.

### Installation

```bash
npm install --save-dev esbuild glob
```

### esbuild.mjs

```js
import esbuild from 'esbuild';
import { glob } from 'glob';

// Compile every .ts file in src/bots/ (excluding tests)
const botEntryPoints = glob.sync('./src/bots/*.ts').filter((f) => !f.endsWith('.test.ts'));

esbuild
  .build({
    entryPoints: botEntryPoints,
    outdir: './dist/bots',
    bundle: true,       // Inline local imports and npm deps not listed in external
    platform: 'node',
    format: 'cjs',
    loader: { '.ts': 'ts' },
    target: 'es2020',
    external: [
      // Every Medplum layer package you import should appear here (expand as needed).
      // Catalog: https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json
      '@medplum/core',
      '@medplum/definitions',
    ],
    footer: { js: 'Object.assign(exports, module.exports);' },
  })
  .then(() => console.log('Build complete'))
  .catch(() => process.exit(1));
```

Add a build script to `package.json`:

```json
{
  "scripts": {
    "build": "node esbuild.mjs"
  }
}
```

Run with:

```bash
npm run build
```

### What the bundler does

| Source | After bundling |
|--------|---------------|
| `import { connectToApi } from '../common/connection'` | Inlined into the bot's `.js` file |
| `import { MedplumClient } from '@medplum/core'` | Left as `require('@medplum/core')` when listed in `external` — resolved at runtime from the layer |
| `import { RRule } from 'rrule'` (after `npm install rrule`) | Inlined into the bot's `.js` file — not on the layer, so do **not** add `rrule` to `external` |

Each file under `dist/bots/` contains every **non-external** dependency (your shared modules and bundled npm libraries). Your `src/common/` folder is never deployed separately — its code is merged into each bot that imports it. Layer packages stay as `require()` calls.

### Third-party npm dependencies

To ship a one-off library (for example `rrule`, `lodash`, or a small HTTP helper):

1. **`npm install <package>`** (dependency or devDependency according to your repo conventions).
2. **`import`** it from a bot under `src/bots/` or from `src/common/` as usual.
3. **Omit it from `external`** unless that exact package is already provided by the Medplum bot Lambda layer (see the `dependencies` in the same [`bot-layer` `package.json`](https://github.com/medplum/medplum/blob/main/packages/bot-layer/package.json) linked in the esbuild example). If it is not on the layer, esbuild **bundles** it into the compiled `.js` file.

:::warning[Note] If you use **transpile-only** tooling or wrongly list a non-layer package in `external`, the output can still contain `require('some-package')`. The Medplum CLI uploads **only** that single `dist` file — there is no `node_modules` on Lambda — so the bot will **fail at runtime**. [Bots in Production](/docs/bots/bots-in-production) describes the deploy path, `medplum.config.json`, and related constraints (for example deployment size).
:::

## Writing Bots and Shared Modules

### Bot files (`src/bots/`)

Keep bot files thin. They should only contain the `handler` function and high-level orchestration:

```ts
// src/bots/send-order.ts
import { BotEvent, MedplumClient } from '@medplum/core';
import { ServiceRequest } from '@medplum/fhirtypes';
import { connectToApi } from '../common/connection';
import { buildOrderPayload } from '../common/order-utils';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<void> {
  const order = event.input as ServiceRequest;
  const client = await connectToApi(medplum);
  const payload = buildOrderPayload(order);
  await client.submitOrder(payload);
}
```

### Shared modules (`src/common/`)

Shared modules are plain TypeScript — no Medplum-specific structure required:

```ts
// src/common/connection.ts
import { MedplumClient } from '@medplum/core';

export async function connectToApi(medplum: MedplumClient): Promise<ApiClient> {
  const secret = await medplum.getProjectSecret('API_KEY');
  return new ApiClient(secret);
}
```

### What belongs in `common/`

Move code to `src/common/` when:
- Two or more bots use the same function
- The logic is independently testable (API clients, data transforms, validators)
- It's a constant or configuration value shared across bots

Keep code in the bot file when:
- It's only used by that bot
- It's thin glue logic specific to one workflow

## Deployment

The deploy workflow is the same as described in [Bots in Production](/docs/bots/bots-in-production). Your `medplum.config.json` points each bot at its source and compiled files:

```json
{
  "bots": [
    {
      "name": "send-order",
      "id": "<BOT_ID>",
      "source": "src/bots/send-order.ts",
      "dist": "dist/bots/send-order.js"
    },
    {
      "name": "receive-result",
      "id": "<BOT_ID>",
      "source": "src/bots/receive-result.ts",
      "dist": "dist/bots/receive-result.js"
    }
  ]
}
```

Deploy all bots in one command:

```bash
npm run build
npx medplum bot deploy '*'
```
