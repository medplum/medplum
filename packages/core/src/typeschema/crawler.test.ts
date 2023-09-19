import { readJson } from '@medplum/definitions';
import { Attachment, Bundle, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { indexStructureDefinitionBundle, TypedValue } from '../types';
import { arrayify } from '../utils';
import { crawlResource } from './crawler';
import { loadDataTypes } from './types';

describe('ResourceCrawler', () => {
  beforeAll(() => {
    const typesData = readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>;
    const resourcesData = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
    indexStructureDefinitionBundle(typesData);
    indexStructureDefinitionBundle(resourcesData);
    loadDataTypes(typesData);
    loadDataTypes(resourcesData);
  });

  test('Simple case', () => {
    let enteredObject = false;
    let exitedObject = false;
    let enteredResource = false;
    let exitedResource = false;

    crawlResource(
      { resourceType: 'Patient' },
      {
        onEnterObject: () => (enteredObject = true),
        onExitObject: () => (exitedObject = true),
        onEnterResource: () => (enteredResource = true),
        onExitResource: () => (exitedResource = true),
      }
    );

    expect(enteredObject).toBe(true);
    expect(exitedObject).toBe(true);
    expect(enteredResource).toBe(true);
    expect(exitedResource).toBe(true);
  });

  test('Attachment finder', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      photo: [
        {
          contentType: 'image/png',
          url: 'https://example.com/photo.png',
        },
        {
          contentType: 'image/png',
          data: 'base64data',
        },
      ],
    };

    const attachments: Attachment[] = [];
    crawlResource(patient, {
      visitProperty: (_parent, _key, _path, propertyValues) => {
        for (const propertyValue of propertyValues) {
          if (propertyValue) {
            for (const value of arrayify(propertyValue) as TypedValue[]) {
              if (value.type === 'Attachment') {
                attachments.push(value.value as Attachment);
              }
            }
          }
        }
      },
    });

    expect(attachments).toHaveLength(2);
  });
});
