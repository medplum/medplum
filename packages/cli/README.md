# Medplum Command Line Interface

The Medplum CLI (Command Line Interface) is a set of command line tools to quickly deploy Medplum web applications and Medplum bots.

## Usage

Add as a dependency:

```bash
npm i -D @medplum/cli
```

Syntax:

```bash
medplum <command> <args>
```

At present, there is only one command called `deploy-bot`.  Syntax:

```bash
medplum deploy-bot <filename> <bot-id>
```

Example:

```bash
medplum deploy-bot dist/hello-world.js e54fa800-02ab-41be-8d48-8c027dd85ccc
```

In practice, consider adding the command to the `"scripts"` section of your package.json:

```json
  "scripts": {
    "build": "tsc",
    "deploy:hello-world": "medplum deploy-bot dist/hello-world.js e54fa800-02ab-41be-8d48-8c0200000000"
  },
```

Then, from the command line, run:

```bash
npm run deploy:hello-world
```

Authentication requires client credentials in the form of environment variables `MEDPLUM_CLIENT_ID` and `MEDPLUM_CLIENT_SECRET`.  This supports most use cases, including secrets from CI/CD.  `dotenv` is enabled, so you could store them in `.env` file.

## Example

Write your bot.  This can be TypeScript.  It can reference `@medplum/core` and `node-fetch`:

```typescript
import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, input: Resource): Promise<any> {
  console.log('Hello world');
}
```

Compile with vanilla `tsc` (no build tools required)

```bash
npx tsc
```

Or:

```bash
npm run build
```

You get sensible plain old JavaScript output:

```javascript
export async function handler(medplum, input) {
    console.log('Hello world');
}
```

You can then use the Medplum CLI to deploy it.

```bash
npm run deploy:hello-world
```

## License

Apache 2.0. Copyright &copy; Medplum 2022
