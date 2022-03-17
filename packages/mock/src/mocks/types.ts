import { SearchParameter } from '@medplum/fhirtypes';
import StructureDefinitionList from './structuredefinitions.json';

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
    expression: 'Patient.birthDate',
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
  {
    resourceType: 'SearchParameter',
    id: 'Patient-active',
    base: ['Patient'],
    code: 'active',
    name: 'active',
    type: 'token',
    expression: 'Patient.active',
  },
  {
    resourceType: 'SearchParameter',
    id: 'individual-telecom',
    base: ['Patient', 'Practitioner'],
    code: 'telecom',
    name: 'telecom',
    type: 'token',
    expression: 'Patient.telecom | Practitioner.telecom',
  },
  {
    resourceType: 'SearchParameter',
    id: 'individual-email',
    base: ['Patient', 'Practitioner'],
    code: 'email',
    name: 'email',
    type: 'token',
    expression: "Patient.telecom.where(system='email') | Practitioner.telecom.where(system='email')",
  },
  {
    resourceType: 'SearchParameter',
    id: 'individual-phone',
    base: ['Patient', 'Practitioner'],
    code: 'phone',
    name: 'phone',
    type: 'token',
    expression: "Patient.telecom.where(system='phone') | Practitioner.telecom.where(system='phone')",
  },
  {
    resourceType: 'SearchParameter',
    id: 'individual-address-city',
    base: ['Patient', 'Practitioner'],
    code: 'address-city',
    name: 'address-city',
    type: 'token',
    expression: 'Patient.address.city | Practitioner.address.city',
  },
  {
    resourceType: 'SearchParameter',
    id: 'individual-address-state',
    base: ['Patient', 'Practitioner'],
    code: 'address-state',
    name: 'address-state',
    type: 'token',
    expression: 'Patient.address.state | Practitioner.address.state',
  },
];

export const GraphQLSchemaResponse = {
  data: {
    StructureDefinitionList,
    SearchParameterList: [...PatientSearchParameters],
  },
};
