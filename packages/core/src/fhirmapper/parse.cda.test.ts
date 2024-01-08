import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { parseMappingLanguage } from './parse';

// Based on: https://github.com/hl7ch/cda-fhir-maps/blob/master/input/maps/BundleToCda.map
// Apache 2.0 License

describe('FHIR Mapping Language parser - C-CDA maps', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('CdaToBundle setup', () => {
    // https://build.fhir.org/mapping-tutorial.html#step1

    const map = `
    group CdaToBundle(source cda : ClinicalDocument, target bundle : Bundle) {
      cda ->  bundle.entry as e, 
        e.resource = create('Composition') as composition, 
        composition.id = uuid() as uuid,
        e.fullUrl = append('urn:uuid:',uuid),
        bundle.entry as e2, 
        e2.resource = create('Patient') as patient,
        patient.id = uuid() as uuid2,
        e2.fullUrl = append('urn:uuid:',uuid2)
        then {
          cda then ClinicalDocumentToBundle(cda, patient, composition, bundle) "cdatobundle";
        } "ClinicalDocumentToBody";
    }
    `;

    expect(parseMappingLanguage(map)).toBeDefined();
  });
});
