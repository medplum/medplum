import { Bundle, SearchParameter, StructureDefinition } from '@medplum/fhirtypes';

export const EmptySearchBundle: Bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 0,
  entry: [],
};

export const ObservationStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  name: 'Observation',
  snapshot: {
    element: [
      {
        path: 'Observation.id',
        type: [
          {
            code: 'code',
          },
        ],
      },
      {
        path: 'Observation.value[x]',
        min: 0,
        max: '1',
        type: [
          {
            code: 'Quantity',
          },
          {
            code: 'CodeableConcept',
          },
          {
            code: 'string',
          },
          {
            code: 'boolean',
          },
          {
            code: 'integer',
          },
          {
            code: 'Range',
          },
          {
            code: 'Ratio',
          },
          {
            code: 'SampledData',
          },
          {
            code: 'time',
          },
          {
            code: 'dateTime',
          },
          {
            code: 'Period',
          },
        ],
      },
    ],
  },
};

export const PatientStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  id: '123',
  name: 'Patient',
  snapshot: {
    element: [
      {
        id: 'Patient.name',
        path: 'Patient.name',
        type: [
          {
            code: 'HumanName',
          },
        ],
        max: '*',
      },
    ],
  },
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

export const PractitionerStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  name: 'Practitioner',
  snapshot: {
    element: [
      {
        path: 'Practitioner.id',
        type: [
          {
            code: 'code',
          },
        ],
      },
      {
        path: 'Practitioner.name',
        type: [
          {
            code: 'HumanName',
          },
        ],
        max: '*',
      },
      {
        path: 'Practitioner.gender',
        type: [
          {
            code: 'code',
          },
        ],
      },
    ],
  },
};

export const QuestionnaireStructureDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  name: 'Questionnaire',
  snapshot: {
    element: [
      {
        id: 'Questionnaire.item',
        path: 'Questionnaire.item',
        type: [
          {
            code: 'BackboneElement',
          },
        ],
      },
      {
        id: 'Questionnaire.item.answerOption',
        path: 'Questionnaire.item.answerOption',
        type: [
          {
            code: 'BackboneElement',
          },
        ],
      },
      {
        id: 'Questionnaire.item.answerOption.value[x]',
        path: 'Questionnaire.item.answerOption.value[x]',
        min: 1,
        max: '1',
        type: [
          {
            code: 'integer',
          },
          {
            code: 'date',
          },
          {
            code: 'time',
          },
          {
            code: 'string',
          },
          {
            code: 'Coding',
          },
          {
            code: 'Reference',
            targetProfile: ['http://hl7.org/fhir/StructureDefinition/Resource'],
          },
        ],
      },
    ],
  },
};

export const ServiceRequestServiceDefinition: StructureDefinition = {
  resourceType: 'StructureDefinition',
  name: 'ServiceRequest',
  snapshot: {
    element: [
      {
        path: 'ServiceRequest.id',
        type: [
          {
            code: 'code',
          },
        ],
      },
      {
        path: 'ServiceRequest.code',
        type: [
          {
            code: 'CodeableConcept',
          },
        ],
      },
    ],
  },
};

export const GraphQLSchemaResponse = {
  data: {
    StructureDefinitionList: [
      ObservationStructureDefinition,
      PatientStructureDefinition,
      PractitionerStructureDefinition,
      QuestionnaireStructureDefinition,
      ServiceRequestServiceDefinition,
    ],
    SearchParameterList: [...PatientSearchParameters],
  },
};
