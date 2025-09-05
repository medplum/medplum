<h1 align="center">Medplum ONC Certification</h1>
<p align="center">A comprehensive platform for achieving ONC (Office of the National Coordinator for Health Information Technology) certification across multiple criteria. This repository provides implementations for C1 (315.c.1) - Record and Export capability and B11 (315.b.11) - Decision Support Intervention certification requirements.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

## Overview

This application demonstrates Medplum's capabilities for ONC EHR certification through various criteria. It provides a foundation for building healthcare applications that meet ONC certification requirements while leveraging Medplum's FHIR-native platform.

### Available Certifications

- **[C1 (315.c.1)](./c1-certification.md)** - Clinical Quality Measure (CQM) - Record and Export capability
- **[B11 (315.b.11)](./b11-certification.md)** - Decision Support Intervention (DSI)

## Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

### Setup

#### Step 1: Create Bots in Medplum

For each bot in the `src/bots` directory, follow the steps below (replace `<bot-name>` with the actual bot name):

1. Go to [Medplum Project Admin](https://app.medplum.com/admin/project)
2. Find the **Bots** section and click **Create new bot**
3. Enter the `<bot-name>`
4. After creating the bot, click on the bot to open its page
5. In the Edit tab, set the **Identifier** with the following values:
   - **system**: `https://medplum.com/bots`
   - **value**: `<bot-name>`
6. Save the bot
7. **Save each bot's ID** – you'll need these for the configuration file

> [!TIP]
> You can view all your bots at [app.medplum.com/Bot](https://app.medplum.com/Bot)

#### Step 2: Update Project Configuration

Update your `medplum.config.json` file with the bot IDs from Step 1:

```json
{
  "bots": [
    {
      "name": "<bot-name>",
      "id": "<bot-id>",
      "source": "src/bots/<bot-name>.ts",
      "dist": "dist/bots/<bot-name>.js"
    }
  ]
}
```

> [!IMPORTANT]
> Replace `<bot-id>` with the actual bot ID from Step 1

#### Step 3: Upload Bot Code

For each of the bots, upload the bot code by running:

```bash
npx medplum login
npm run bots:build
npm run bots:deploy <bot-name>
```

> [!IMPORTANT]
> You must have completed Step 2 (updating `medplum.config.json` with the correct bot IDs) before running these commands.

#### Step 4: Upload Core Data

In the `data/core` directory, you will find the following FHIR resource bundles that must be imported into your Medplum project. It is important to upsert these resources into the Medplum project before running the application because the generated QRDA Cat I XML files will reference the codes in these resources.

1. Go to [Medplum Batch](https://app.medplum.com/batch)
2. Drag or select the all the files in the `data/core` directory
3. Click the "Submit" button

### Installation

If you want to change any environment variables from the defaults, copy the `.env.defaults` file to `.env`

```bash
cp .env.defaults .env
```

And make the changes you need.

Next, install the dependencies

```bash
npm install
```

Then, build the bots

> [!WARNING]
> Bots are not on by default for Medplum projects, make sure they are enabled before proceeding.

```bash
npm run bots:build
```

Then, deploy the bots

```bash
npm run bots:deploy <bot-name>
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### Project Structure

```
├── docs/                # Certification documentation
├── src/                 # Application source code
│   ├── bots/            # Medplum bots for automation
├── data/                # Sample data and resources
│   ├── core/            # Core FHIR resources
│   └── example/         # Example test data
```

## About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting, and provides a [hosted service](https://app.medplum.com/). This app uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://storybook.medplum.com/)
- Join our [Discord](https://discord.gg/medplum)
