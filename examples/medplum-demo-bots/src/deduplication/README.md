# Deduplication Demo

This repo contains code for deploying bots on [Deduplication](https://www.medplum.com/docs/fhir-datastore/patient-deduplication#architecture-overview). 


## Setup

For deduplication - we have two bots, one for identifying a duplicated resource and creating a task, and the other that merges the two resources into one.

You will need to do the following:
* [Create a Bot](https://app.medplum.com/admin/project) on Medplum and note its `id`. (All Bots in your account can be found [here](https://app.medplum.com/Bot))
* Go to medplum.config.json in this repo and find the object with `name: patient-deduplication` and add the id of your new bot where it says "id"
* Go back and [Create a Second Bot](https://app.medplum.com/admin/project) on Medplum and note its `id`.
* Go to medplum.config.json in this repo and find the object with `name: merge-bot` and add the id of your new bot where it says "id"

## Installation

To run and deploy your Bot do the following steps:

Install:

```bash
npm i
```

Build:

```bash
npm run build
```

Test:

```bash
npm t
```

Deploy first bot:

```bash 
npx medplum bot deploy patient-deduplication
```

Deploy second bot:
```bash 
npx medplum bot deploy merge-bot
```

You will see the following in your command prompt if all goes well:

```bash
Update bot code.....
Success! New bot version: 7fcbc375-4192-471c-b874-b3f0d4676226
Deploying bot...
Deploy result: All OK
```