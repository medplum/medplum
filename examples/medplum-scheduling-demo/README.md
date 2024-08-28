<h1 align="center">Medplum Scheduling Demo</h1>
<p align="center">A starter application for building a scheduling app on Medplum.</p>
<p align="center">
<a href="https://github.com/medplum/medplum-hello-world/blob/main/LICENSE.txt">
    <img src="https://img.shields.io/badge/license-Apache-blue.svg" />
  </a>
</p>

> [!WARNING]
> Under development

### Getting Started

If you haven't already done so, follow the instructions in [this tutorial](https://www.medplum.com/docs/tutorials/register) to register a Medplum project to store your data.

[Fork](https://github.com/medplum/medplum/) and clone the repo to your local machine.

Next, install the dependencies.

```bash
npm install
```

Then, build the bots

> [!WARNING]
> Bots are not on by default for Medplum projects, make sure they are enabled before proceeding.

```bash
npm run build:bots
```

Then, run the app

```bash
npm run dev
```

This app should run on `http://localhost:3000/`

### Uploading sample data

Click `Upload Core ValueSets` in the app navigation menu and then click the upload button.
Click `Upload Example Bots` in the app navigation menu and then click the upload button.

### About Medplum

[Medplum](https://www.medplum.com/) is an open-source, API-first EHR. Medplum makes it easy to build healthcare apps quickly with less code.

Medplum supports self-hosting and provides a [hosted service](https://app.medplum.com/). Medplum Hello World uses the hosted service as a backend.

- Read our [documentation](https://www.medplum.com/docs)
- Browse our [react component library](https://docs.medplum.com/storybook/index.html?)
- Join our [Discord](https://discord.gg/medplum)
