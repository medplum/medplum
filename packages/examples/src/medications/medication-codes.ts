import { CodeableConcept } from '@medplum/fhirtypes';

const tylenol: CodeableConcept =
  // start-block tylenol-example
  {
    text: 'Tylenol 325 MG Oral Tablet',
    coding: [
      {
        system: 'http://hl7.org/fhir/sid/ndc',
        code: '50580045850',
      },
      {
        system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
        code: '209387',
      },
    ],
  };
// end-block tylenol-example

console.log(tylenol);
