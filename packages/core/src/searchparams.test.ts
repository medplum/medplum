import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Bundle, BundleEntry, Resource, SearchParameter } from './fhir';
import { getSearchParameterDetails, SearchParameterType } from './searchparams';
import { IndexedStructureDefinition, indexStructureDefinition } from './types';
import { isLowerCase } from './utils';

const searchParams = readJson('fhir/r4/search-parameters.json');
const structureDefinitions = { types: {} } as IndexedStructureDefinition;

describe('SearchParameterDetails', () => {

  beforeAll(() => {
    buildStructureDefinitions('profiles-types.json');
    buildStructureDefinitions('profiles-resources.json');
    buildStructureDefinitions('profiles-medplum.json');
  });

  test('Get details', () => {
    const individualPhoneticParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'phonetic',
      type: 'string',
      expression: 'Patient.name | Person.name | Practitioner.name | RelatedPerson.name'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', individualPhoneticParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('phonetic');
    expect(details.array).toEqual(true);
  });

  test('Boolean param', () => {
    const activeParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'active',
      type: 'token',
      expression: 'Patient.active'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', activeParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('active');
    expect(details.type).toEqual(SearchParameterType.BOOLEAN);
    expect(details.array).toEqual(false);
  });

  test('Date param', () => {
    const birthDateParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'birthdate',
      type: 'date',
      expression: 'Patient.birthDate'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', birthDateParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('birthdate');
    expect(details.type).toEqual(SearchParameterType.DATE);
    expect(details.array).toEqual(false);
  });

  test('Get nested details', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'link',
      type: 'reference',
      expression: 'Patient.link.other'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('link');
    expect(details.type).toEqual(SearchParameterType.REFERENCE);
  });

  test('Missing expression for resource type', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'OtherType.test'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('test');
  });

  test('Property not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'Patient.unknown'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('test');
  });

  test('Subtype not found', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'Patient.unknown'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).toBeDefined();
    expect(details.columnName).toEqual('test');
  });

  test('Everything', () => {
    // Make sure that getSearchParameterDetails returns successfully for all known parameters.
    for (const resourceType of Object.keys(structureDefinitions.types)) {
      for (const entry of searchParams.entry) {
        const searchParam = entry.resource;
        if (searchParam.base?.includes(resourceType)) {
          const details = getSearchParameterDetails(structureDefinitions, resourceType, searchParam);
          expect(details).toBeDefined();
        }
      }
    }
  });

});

function buildStructureDefinitions(fileName: string): void {
  const resourceDefinitions = readJson(`fhir/r4/${fileName}`) as Bundle;
  for (const entry of (resourceDefinitions.entry as BundleEntry[])) {
    const resource = entry.resource as Resource;
    if (resource.resourceType === 'StructureDefinition' &&
      resource.name &&
      resource.name !== 'Resource' &&
      resource.name !== 'BackboneElement' &&
      resource.name !== 'DomainResource' &&
      resource.name !== 'MetadataResource' &&
      !isLowerCase(resource.name[0])) {
      indexStructureDefinition(resource, structureDefinitions);
    }
  }
}

function readJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(__dirname, '../../definitions/dist/', filename), 'utf8'));
}
