import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block deployTs
await medplum.post(medplum.fhirUrl('Bot', '[id]', '$deploy').toString(), {
  filename: 'hello-patient.js',
  // eslint-disable-next-line no-template-curly-in-string
  code: "import { BotEvent, MedplumClient } from '@medplum/core';\nimport { Patient } from '@medplum/fhirtypes';\n\nexport async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {\n  const patient = event.input as Patient;\n  const firstName = patient.name?.[0]?.given?.[0];\n  const lastName = patient.name?.[0]?.family;\n  console.log(`Hello ${firstName} ${lastName}!`);\n  return true;\n}\n",
});
// end-block deployTs

/*
// start-block deployCli
medplum post 'Bot/[id]/$deploy' '{ "filename": "hello-patient.js", "code": "import { BotEvent, MedplumClient } from '@medplum/core';\nimport { Patient } from '@medplum/fhirtypes';\n\nexport async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {\n  const patient = event.input as Patient;\n  const firstName = patient.name?.[0]?.given?.[0];\n  const lastName = patient.name?.[0]?.family;\n  console.log(`Hello ${firstName} ${lastName}!`);\n  return true;\n}\n" }'
// end-block deployCli

// start-block deployCurl
curl 'https://api.medplum.com/fhir/R4/Bot/[id]/$deploy' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{"filename":"hello-patient.js","code":"import { BotEvent, MedplumClient } from '@medplum/core';\nimport { Patient } from '@medplum/fhirtypes';\n\nexport async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {\n  const patient = event.input as Patient;\n  const firstName = patient.name?.[0]?.given?.[0];\n  const lastName = patient.name?.[0]?.family;\n  console.log(`Hello ${firstName} ${lastName}!`);\n  return true;\n}\n"}'
// end-block deployCurl
*/
