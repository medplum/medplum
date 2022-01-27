import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import StructureDefinitionList from './structuredefinitions.json';

export const EmptySearchBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 0,
  entry: [],
};

export const PatientSearchParameters: SearchParameter[] = [
  {
    resourceType: 'SearchParameter',
    id: 'Patient-name',
    base: ['Patient'],
    code: 'name',
    name: 'name',
    type: 'string',
    expression: 'Patient.name',
  },
  {
    resourceType: 'SearchParameter',
    id: 'Patient-birthdate',
    base: ['Patient'],
    code: 'birthdate',
    name: 'birthdate',
    type: 'date',
    expression: 'Patient.birthdate',
  },
  {
    resourceType: 'SearchParameter',
    id: 'Patient-organization',
    base: ['Patient'],
    code: 'organization',
    name: 'organization',
    type: 'reference',
    expression: 'Patient.organization',
    target: ['Organization'],
  },
];

export const GraphQLSchemaResponse = {
  data: {
    StructureDefinitionList,
    SearchParameterList: [...PatientSearchParameters],
  },
};
