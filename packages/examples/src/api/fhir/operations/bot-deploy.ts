import { MedplumClient } from '@medplum/core';

const medplum = new MedplumClient();

// start-block deployTs
await medplum.post(medplum.fhirUrl('Bot', '[id]', '$deploy').toString(), {
  filename: 'example-bot',
  code: 'example-bot-code',
});
// end-block deployTs

/*
// start-block deployCli
medplum post 'Bot/[id]/$deploy' '{ "filename": "example-bot", "code": "example-bot-code" }'
// end-block deployCli

// start-block deployCurl
curl 'https://api.medplum.com/fhir/R4/Bot/[id]/$deploy' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d '{"filename":"example-bot","code":"example-bot-code"}'
// end-block deployCurl
*/
