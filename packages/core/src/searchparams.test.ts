import { SearchParameter } from '.';
import { getSearchParameterDetails, SearchParameterType } from './searchparams';
import { IndexedStructureDefinition } from './types';

const structureDefinitions: IndexedStructureDefinition = {
  types: {
    'Patient': {
      display: 'Patient',
      properties: {
        'name': {
          path: 'Patient.name',
          max: '*'
        },
        'active': {
          path: 'Patient.active',
          max: '1',
          type: [{
            code: 'boolean'
          }]
        },
        'birthDate': {
          path: 'Patient.birthDate',
          max: '1',
          type: [{
            code: 'date'
          }]
        },
        'link': {
          path: 'Patient.link',
          max: '*',
          type: [{
            code: 'BackboneElement'
          }]
        }
      }
    },
    'PatientLink': {
      display: 'Patient Link',
      properties: {
        'other': {
          path: 'Patient.link.other',
          max: '1',
          type: [{
            code: 'Reference'
          }]
        }
      }
    }
  }
};

describe('SearchParameterDetails', () => {

  test('Get details', () => {
    const individualPhoneticParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'phonetic',
      type: 'string',
      expression: 'Patient.name | Person.name | Practitioner.name | RelatedPerson.name'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', individualPhoneticParam);
    expect(details).not.toBeUndefined();
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
    expect(details).not.toBeUndefined();
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
    expect(details).not.toBeUndefined();
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
    expect(details).not.toBeUndefined();
    expect(details.columnName).toEqual('link');
    expect(details.type).toEqual(SearchParameterType.REFERENCE);
  });

  test('Missing expression', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).not.toBeUndefined();
    expect(details.columnName).toEqual('test');
  });

  test('Missing expression for resource type', () => {
    const missingExpressionParam: SearchParameter = {
      resourceType: 'SearchParameter',
      code: 'test',
      type: 'string',
      expression: 'OtherType.test'
    };

    const details = getSearchParameterDetails(structureDefinitions, 'Patient', missingExpressionParam);
    expect(details).not.toBeUndefined();
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
    expect(details).not.toBeUndefined();
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
    expect(details).not.toBeUndefined();
    expect(details.columnName).toEqual('test');
  });

});
