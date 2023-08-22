# Patient Deduplication Demo

This folder contains a reference implementation for a simple, human-in-the-loop patient deduplication pipeline, based on the guidance in [Patient Deduplication Architectures](https://www.medplum.com/docs/fhir-datastore/patient-deduplication#architecture-overview).

The implementation consists of two bots:

- [`find-matching-patients`](./find-matching-patients.ts) - Identifies duplicated Patients and performs a series of steps:
  - Check for the first name, last name, birth date, and zip code.
  - If it's a match, it will check a list to see if it's not on the doNotMatch list
  - Creates a `RiskAssessment`, with a numeric score, representing the candidate match.
  - Creates a `Task` for a human to review the match
- [`merge-matching-patients`](./merge-matching-patients.ts) -The other that merges the two Patients into one
  - [Link the Patient records](https://www.medplum.com/docs/fhir-datastore/patient-deduplication#linking-patient-records-in-fhir)
  - [Merge the Contact info](https://www.medplum.com/docs/fhir-datastore/patient-deduplication#merge-rules)
  - [Rewrite Clinical Resource](https://www.medplum.com/docs/fhir-datastore/patient-deduplication#rewriting-references-from-clinical-data)
  - Delete the source record, if the user has requested it

This implementation also consists of FHIR bundles with sample data, which can be uploaded using the [batch upload tool](https://www.medplum.com/docs/tutorials/importing-sample-data):

- [patient-data.json](./patient-data.json) - Three sample `Patient` resources, two of whom are known duplicates, and one of which is a false positive
- [merge-questionnaire.json](./merge-questionnaire.json) - An example `Questionnaire` resource that describes a form that a reviewer might use to evaluate a candidate match.

## Setup

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

[Create first Bot](https://www.medplum.com/docs/cli#bots) :

```bash
npx medplum bot create find-matching-patients <project id> "src/deduplication/find-matching-patients.ts" "dist/deduplication/find-matching-patients.js"
```

[Deploy first Bot](https://www.medplum.com/docs/cli#bots) :

```bash
npx medplum bot deploy find-matching-patients
```

```bash
Update bot code.....
Success! New bot version: <botID>
Deploying bot...
Deploy result: All OK
```

Set up a `Subscription` following the instructions [here](https://www.medplum.com/docs/bots/bot-basics#executing-automatically-using-a-subscription) to trigger the Bot when a `Patient` record is updated.

- Critera: `Patient?active=true`
- Endpoint: `Bot/:find-matching-patients-bot-id`

[Create second Bot](https://www.medplum.com/docs/cli#bots) :

```bash
npx medplum bot create merge-matching-patients <project id> "src/deduplication/merge-matching-patients.ts" "dist/deduplication/merge-matching-patients.js"
```

[Deploy second Bot](https://www.medplum.com/docs/cli#bots) :

```bash
npx medplum bot deploy merge-matching-patients
```

You will see the following in your command prompt if all goes well:

```bash
Update bot code.....
Success! New bot version: <botID>
Deploying bot...
Deploy result: All OK
```

Use the [batch upload tool](https://www.medplum.com/docs/tutorials/importing-sample-data) to import the [merge questionnaire](./merge-questionnaire.json)

Set up a `Subscription` following the instructions [here](https://www.medplum.com/docs/bots/bot-basics#executing-automatically-using-a-subscription) to trigger the bot when the questionnaire is submitted.

- Critera: `QuestionnaireResponse?questionnaire=Questionnaire/:merge-questionnaire-id`
- Endpoint: `Bot/:merge-matching-patients-bot-id`
