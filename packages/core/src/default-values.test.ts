import { USCoreStructureDefinitionList } from '@medplum/mock';
import { getDataType, loadDataType } from './typeschema/types';
import { isPopulated } from './utils';
import { Patient, StructureDefinition } from '@medplum/fhirtypes';
import { applyDefaultValues } from './default-values';

// const medplum = new MockClient();

describe('applyDefaultValues', () => {
  test('new Patient', async () => {
    const sds = [
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-genderIdentity',
    ]
      .map((profileUrl) => {
        return USCoreStructureDefinitionList.find((sd) => sd.url === profileUrl);
      })
      .filter((sd): sd is StructureDefinition => isPopulated(sd));

    expect(sds.length).toEqual(5);

    for (const sd of sds) {
      loadDataType(sd, sd?.url);
    }

    const resource: Patient = { resourceType: 'Patient' };
    const patientSchema = getDataType(sds[0].name, sds[0].url);

    applyDefaultValues(resource, patientSchema, { debug: true });
  });
});
