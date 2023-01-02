# Medplum Command Line Interface

The Medplum CLI (Command Line Interface) is a set of command line tools to quickly deploy Medplum web applications and Medplum bots.

## Installation

Add as a dependency:

```bash
npm install @medplum/cli
```

## Config file

Create a Medplum config file called `medplum.config.json`:

```json
{
  "bots": [
    {
      "name": "hello-world",
      "id": "f0465c2e-11d4-4c36-b834-8e86f7472b4b",
      "source": "src/index.ts",
      "dist": "dist/index.js"
    }
  ]
}
```

The `name` property is a friendly name you can use to reference the Bot in commands.

The `id` property refers to the Bot ID in your Medplum project.

The `source` property is the file path to the original source. When you "save" the Bot, the contents of this file will be saved to the Bot `code` property. This file can be JavaScript or TypeScript.

The `dist` property is the optional file path to the compiled source. If omitted, the command falls back to using the `source` property. When you "deploy" the Bot, the contents of this file will be deployed to the Bot runtime. This file must be JavaScript.

## Usage

Syntax:

```bash
npx medplum <command> <args>
```

### save-bot

Updates the `code` value on a `Bot` resource

Syntax:

```bash
npx medplum save-bot <bot name>
```

Example:

```bash
npx medplum save-bot hello-world
```

### deploy-bot

Deploys the Bot code

Syntax:

```bash
npx medplum deploy-bot <bot name>
```

Example:

```bash
npx medplum-deploy-bot <bot name>
```

## Authentication

Authentication requires client credentials in environment variables `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`. This supports most use cases, including secrets from CI/CD. `dotenv` is enabled, so you can store them in a `.env` file.

## Example

Create a Medplum config file `medplum.config.json`:

```json
{
  "bots": [
    {
      "name": "hello-world",
      "id": "f0465c2e-11d4-4c36-b834-8e86f7472b4b",
      "source": "src/hello-world.ts",
      "dist": "dist/hello-world.js"
    }
  ]
}
```

Replace the sample `id` with your Bot's ID.

Write your bot in `src/hello-world.ts`. This can be TypeScript. It can reference `@medplum/core` and `node-fetch`:

```ts
import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('Hello world');
}
```

You can use the Medplum CLI to save it:

```bash
npx medplum save-bot hello-world
```

Compile with vanilla `tsc` (no bundler required)

```bash
npx tsc
```

The result will be JavaScript output in `dist/hello-world.js`:

```javascript
export async function handler(medplum, input) {
  console.log('Hello world');
}
```

You can then use the Medplum CLI to deploy it.

```bash
npx medplum deploy-bot hello-world
```

## About Medplum

Medplum is a healthcare platform that helps you quickly develop high-quality compliant applications. Medplum includes a FHIR server, React component library, and developer app.

## License

Apache 2.0. Copyright &copy; Medplum 2023
