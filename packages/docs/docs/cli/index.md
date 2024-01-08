# Intro

The Medplum CLI (Command Line Interface) is a set of command line tools to quickly deploy Medplum web applications and Medplum bots.

## Prerequisites

The Medplum CLI requires [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) version 18+

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
3. Client credentials in optional command flags.

- `--client-id <clientId>`
  - FHIR server client id
- `--client-secret <clientSecret>`
  - FHIR server client secret

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

### optional flags for medplum commands

- `--base-url <baseUrl>`
  - FHIR server base url
- `--fhir-url-path <fhirUrlPath>`
  - FHIR server url path
- `--tokenUrl <tokenUrl>`
  - FHIR server token url
- `--authorizeUrl <authorizeUrl>`
  - FHIR server authorize url

```bash
medplum get --base-url https://api.example.com 'Patient/homer-simpson'
```

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

#### flags

- `--as-transaction`
  - Convert the output response to a transaction bundle

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

### Project

`project` will have administration commands for visibility and management

#### `current`

Sees your current project

```bash
medplum project current
```

#### `list`

Sees your list of project ids and names

```bash
medplum project list
```

#### `switch`

Switching to another project from the current one

```bash
medplum project switch <projectId>
```

#### `invite`

Invite a user to a project

```bash
medplum project invite <firstName> <lastName> <email>
```

#### optional flags for `invite`

- `--send-email`

  - If you want to send the email when inviting the user

- `--admin`

  - If the user you are inviting is an admin

- `--role` `-r` `<role>`
  - The type of role the new user will have
  - Choices are Patient, Practitioner, and RelatedPerson
    - Default will be Practitioner

### AWS

`aws` includes commands for creating and managing AWS resources.

The AWS commands require [AWS authentication and access credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html). Please make sure your credentials are configured before using the `aws` commands.

:::caution

The `aws` commands are in beta, and likely to change.

:::

#### list

List your Medplum deployments. This command lists AWS CloudFormation stacks with the `medplum:environment` tag.

```bash
medplum aws list
```

#### describe

Describe a Medplum deployment. Displays select AWS resources such as ECS Cluster, ECS Service, and S3 buckets from the AWS CloudFormation stack with the corresponding `medplum:environment` tag.

```bash
medplum aws describe <name>
```

#### update-app

Updates the app S3 bucket in a Medplum deployment to the latest version.

```bash
medplum aws update-app <name>
```

#### update-server

Updates the ECS Service in a Medplum deployment to the latest version.

```bash
medplum aws update-server <name>
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

#### bot save

Updates the `code` value on a `Bot` resource

Syntax:

```bash
npx medplum bot save <bot name>
```

Example:

```bash
npx medplum bot save hello-world
```

#### bot deploy

Deploys the Bot code

Syntax:

```bash
npx medplum bot deploy <bot name>
```

Example:

```bash
npx medplum bot deploy hello-world
```

#### bot create

Creates a bot and saves it

Syntax:

```bash
npx medplum bot create <bot name> <project id> <source file> <dist file>
```

#### Bots Example

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
npx medplum bot save hello-world
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
npx medplum bot deploy hello-world
```

### Bulk

`bulk` includes commands for requesting bulk data export from a FHIR resource server. `bulk` also includes the functionality to import ndjson files generated by bulk data exports from other systems.

#### export

`bulk export` handles the request flows documented at https://build.fhir.org/ig/HL7/bulk-data/export.html and downloads all attachment files.

```bash
medplum bulk export [options]
```

##### optional flags for `bulk export`

- `-e, --export-level <exportLevel>`

  - Export level. Defaults to system level export.

    - "Group/:id" - Group of Patients
    - "Patient" - All Patients.

- `-t, --types <types>`

  - Resource types to export

- `-s, --since <since>`

  - Resources will be included in the response if their state has changed after the supplied time (e.g. if Resource.meta.lastUpdated is later than the supplied \_since time).

- `-d, --target-directory <targetDirectory>`

  - Target directory to save files from the bulk export operations.

#### import

`bulk import` imports ndjson files generated by bulk data exports.

```bash
medplum bulk import [options] <filename>
```

##### optional flags for `bulk import`

- `--num-resources-per-request <numResourcesPerRequest>`

  - number of resources to import per batch request. Defaults to 25.

- `-d, --target-directory <targetDirectory>`

  - Target directory of file to be imported.
