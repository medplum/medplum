# Medplum Command Line Interface

The Medplum CLI (Command Line Interface) is a set of command line tools to quickly deploy Medplum web applications and Medplum bots.

## Installation

Add globally:

```bash
npm install --global @medplum/cli
```

Or add as a package dependency:

```bash
npm install @medplum/cli
```

## Authentication

Use one of these authentication options:

1. Stored credentials in `~/.medplum/credentials`. You can use the `medplum login` command (see below) to automatically create this file.
2. Client credentials in environment variables `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`. `dotenv` is enabled, so you can store them in a `.env` file.

## Usage

If installed globally, you can use the `medplum` command directly:

```bash
medplum <command> <args>
```

If installed as a package dependency, you can use the `medplum` command via `npx`:

```bash
npx medplum <command> <args>
```

By default, the `medplum` command uses the Medplum hosted API at "https://api.medplum.com". If you want to use the `medplum` command against your own self-hosted server, you can use the `MEDPLUM_BASE_URL` environment variable. `dotenv` is enabled, so you can store this value in a `.env` file.

### Auth

#### `login`

The `login` command opens a web browser to a Medplum authentication page.

On successful login, the command writes credentials to disk at `~/.medplum/credentials`.

The `medplum` command will then load those credentials on all future runs.

Example:

```bash
medplum login
```

#### `whoami`

The `whoami` command displays whether the client is authenticated, and, if so, the name of the current user and current Medplum project.

```bash
medplum whoami
```

### RESTful Operations

The `medplum` command can be used as a convenient tool for basic Medplum CRUD and RESTful operations.

While all API endpoints are available to any command line HTTP client such as `curl` or `wget`, there are a few advantages to using the `medplum` command:

1. Authentication and credentials - login once using the `login` command, and the `Authorization` header will be set automatically.
2. URL prefixes - adds the base URL (i.e., "https://api.medplum.com") and FHIR path prefix (i.e., "fhir/R4/").
3. Pretty print - formats the JSON with spaces and newlines.
4. Medplum extended mode - adds the `X-Medplum` HTTP header for private Medplum fields.

#### `get`

Makes an HTTP `GET` request.

```bash
medplum get <url>
```

Example: Search for patients:

```bash
medplum get 'Patient?name=homer'
```

Example: Read patient by ID:

```bash
medplum get Patient/$id
```

#### `post`

Makes an HTTP `POST` request.

```bash
medplum post <url> <body>
```

Example: Create a patient:

```bash
medplum post Patient '{"resourceType":"Patient","name":[{"family":"Simpson"}]}'
```

Example: Invoke a FHIR operation:

```bash
medplum post 'Patient/$validate' '{"resourceType":"Patient","name":[{"family":"Simpson"}]}'
```

#### `put`

Makes an HTTP `PUT` request.

```bash
medplum put <url> <body>
```

Example: Update a patient:

```bash
medplum put Patient/$id '{"resourceType":"Patient","name":[{"family":"Simpson"}]}'
```

#### `patch`

Makes an HTTP `PATCH` request.

```bash
medplum patch <url> <body>
```

Example: Update a patient with [JSONPatch](https://jsonpatch.com/):

```bash
medplum patch Patient/$id '[{"op":"add","path":"/active","value":[true]}]'
```

#### `delete`

Makes an HTTP `DELETE` request.

```bash
medplum delete <url>
```

Example: Delete patient by ID:

```bash
medplum delete Patient/$id
```

### Bots

#### Bots Config file

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

#### save-bot

Updates the `code` value on a `Bot` resource

Syntax:

```bash
npx medplum save-bot <bot name>
```

Example:

```bash
npx medplum save-bot hello-world
```

#### deploy-bot

Deploys the Bot code

Syntax:

```bash
npx medplum deploy-bot <bot name>
```

Example:

```bash
npx medplum-deploy-bot <bot name>
```

## Bots Example

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
