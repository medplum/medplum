// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block input
import { MedplumClient } from '@medplum/core';
import type { CodeSystem, Coding, Parameters, ValueSet } from '@medplum/fhirtypes';
import { CodingInput } from '@medplum/react';

<CodingInput
  name="vital-sign-code"
  binding="http://example.com/ValueSet/vitals"
  path="Observation.code"
  onChange={(c: Coding) => {
    console.log('User selected: ' + c.display + ' (' + c.system + '|' + c.code + ')');
  }}
/>
// end-block input
;

const valueSet: ValueSet = 
// start-block valueSet
{
  "resourceType": "ValueSet",
  "url": "http://example.com/ValueSet/vitals",
  "name": "vitals",
  "title": "Vital Signs",
  "status": "active",
  "compose": {
    "include": [
      {
        "system": "http://loinc.org",
        "concept": [
          { "code": "8310-5", "display": "Body temperature" },
          { "code": "8462-4", "display": "Diastolic blood pressure" },
          { "code": "8480-6", "display": "Systolic blood pressure" },
          { "code": "8867-4", "display": "Heart rate" },
          { "code": "9279-1", "display": "Respiratory rate" }
        ]
      }
    ]
  }
}
// end-block valueSet
;

const codeSystem: CodeSystem = 
// start-block codeSystem
{
  "resourceType": "CodeSystem",
  "url": "http://loinc.org",
  "name": "LOINC",
  "status": "active",
  "content": "example",
  "concept": [
    { "code": "8310-5", "display": "Body temperature" },
    { "code": "8462-4", "display": "Diastolic blood pressure" },
    { "code": "8480-6", "display": "Systolic blood pressure" },
    { "code": "8867-4", "display": "Heart rate" },
    { "code": "9279-1", "display": "Respiratory rate" }
  ]
}
// end-block codeSystem
;

const translatedCodes: CodeSystem =
// start-block translatedCodeSystem
{
  "resourceType": "CodeSystem",
  "status": "draft",
  "url": "http://example.com/CodeSystem/translated",
  "content": "example",
  "concept": [
    {
      "code": "HR",
      // Primary display string
      "display": "Heart rate",
      "designation": [
        // Synonym
        { "value": "Cardiac rate" },
        // Translation
        { "language": "fr", "value": "fréquence cardiaque" }
      ]
    }
  ]
}
// end-block translatedCodeSystem
;

const medplum = new MedplumClient();
// start-block importDesignation
await medplum.post(medplum.fhirUrl('CodeSystem/$import'), {
  resourceType: 'Parameters',
  parameter: [
    { "name": "url", "valueUri": "http://example.com/CodeSystem/translated" },
    // Synonym in primary language
    { "name": "designation", "part": [
      { "name": "code", "valueCode": "HR" },
      { "name": "value", "valueString": "Pulse rate" }
    ]},
    // Translation into other language
    { "name": "designation", "part": [
      { "name": "code", "valueCode": "HR" },
      { "name": "language", "valueCode": "es" },
      { "name": "value", "valueString": "frecuencia cardíaca" }
    ]}
  ]
} satisfies Parameters);
// end-block importDesignation

// start-block expandLanguage
const vs = await medplum.createResource<ValueSet>({
  resourceType: 'ValueSet',
  status: 'draft',
  url: 'http://example.com/ValueSet/translated',
  compose: {
    include: [{ system: 'http://example.com/CodeSystem/translated' }]
  }
});

const expansion = await medplum.valueSetExpand({
  url: vs.url,
  filter: 'card',
  displayLanguage: 'fr',
});

/* Returns:
{
  "resourceType": "ValueSet",
  "status": "draft",
  "url": "http://example.com/ValueSet/translated",
  "compose": {
    "include": [{ "system": "http://example.com/CodeSystem/translated" }]
  },
  "expansion": {
    "total": 1,
    "contains": [
      {
        "system": "http://example.com/CodeSystem/translated",
        "code": "HR",
        "display": "fréquence cardiaque"
      }
    ]
  }
}
*/

// end-block expandLanguage

console.log(valueSet, codeSystem, translatedCodes, expansion);