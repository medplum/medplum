// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ElmFile } from '../types';

export const BasicPatientInfoPrepopulation: ElmFile = {
  library: {
    annotation: [
      {
        translatorOptions: 'EnableDateRangeOptimization',
        type: 'CqlToElmInfo',
      },
    ],
    identifier: {
      id: 'BasicPatientInfoPrepopulation',
      version: '0.2.0',
    },
    schemaIdentifier: {
      id: 'urn:hl7-org:elm',
      version: 'r1',
    },
    usings: {
      def: [
        {
          localIdentifier: 'System',
          uri: 'urn:hl7-org:elm-types:r1',
        },
        {
          localIdentifier: 'FHIR',
          uri: 'http://hl7.org/fhir',
          version: '4.0.0',
        },
      ],
    },
    includes: {
      def: [
        {
          localIdentifier: 'FHIRHelpers',
          path: 'FHIRHelpers',
          version: '4.0.0',
        },
      ],
    },
    parameters: {
      def: [
        {
          name: 'device_request',
          accessLevel: 'Public',
          parameterTypeSpecifier: {
            name: '{http://hl7.org/fhir}DeviceRequest',
            type: 'NamedTypeSpecifier',
          },
        },
        {
          name: 'service_request',
          accessLevel: 'Public',
          parameterTypeSpecifier: {
            name: '{http://hl7.org/fhir}ServiceRequest',
            type: 'NamedTypeSpecifier',
          },
        },
        {
          name: 'medication_request',
          accessLevel: 'Public',
          parameterTypeSpecifier: {
            name: '{http://hl7.org/fhir}MedicationRequest',
            type: 'NamedTypeSpecifier',
          },
        },
      ],
    },
    contexts: {
      def: [
        {
          name: 'Patient',
        },
      ],
    },
    statements: {
      def: [
        {
          name: 'Patient',
          context: 'Patient',
          expression: {
            type: 'SingletonFrom',
            operand: {
              dataType: '{http://hl7.org/fhir}Patient',
              type: 'Retrieve',
            },
          },
        },
        {
          name: 'GetMiddleInitials',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Substring',
            stringToSub: {
              type: 'Combine',
              source: {
                type: 'Query',
                source: [
                  {
                    alias: 'given',
                    expression: {
                      path: 'given',
                      type: 'Property',
                      source: {
                        name: 'name',
                        type: 'OperandRef',
                      },
                    },
                  },
                ],
                relationship: [],
                return: {
                  expression: {
                    type: 'Substring',
                    stringToSub: {
                      path: 'value',
                      scope: 'given',
                      type: 'Property',
                    },
                    startIndex: {
                      valueType: '{urn:hl7-org:elm-types:r1}Integer',
                      value: '0',
                      type: 'Literal',
                    },
                    length: {
                      valueType: '{urn:hl7-org:elm-types:r1}Integer',
                      value: '1',
                      type: 'Literal',
                    },
                  },
                },
              },
              separator: {
                valueType: '{urn:hl7-org:elm-types:r1}String',
                value: ', ',
                type: 'Literal',
              },
            },
            startIndex: {
              valueType: '{urn:hl7-org:elm-types:r1}Integer',
              value: '3',
              type: 'Literal',
            },
          },
          operand: [
            {
              name: 'name',
              operandTypeSpecifier: {
                name: '{http://hl7.org/fhir}HumanName',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'Today',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Today',
          },
        },
        {
          name: 'Name',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Query',
              source: [
                {
                  alias: 'name',
                  expression: {
                    path: 'name',
                    type: 'Property',
                    source: {
                      name: 'Patient',
                      type: 'ExpressionRef',
                    },
                  },
                },
              ],
              relationship: [],
              where: {
                type: 'Equal',
                operand: [
                  {
                    path: 'value',
                    type: 'Property',
                    source: {
                      path: 'use',
                      scope: 'name',
                      type: 'Property',
                    },
                  },
                  {
                    valueType: '{urn:hl7-org:elm-types:r1}String',
                    value: 'official',
                    type: 'Literal',
                  },
                ],
              },
            },
          },
        },
        {
          name: 'LastName',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'family',
              type: 'Property',
              source: {
                name: 'Name',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'MiddleInitial',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            name: 'GetMiddleInitials',
            type: 'FunctionRef',
            operand: [
              {
                name: 'Name',
                type: 'ExpressionRef',
              },
            ],
          },
        },
        {
          name: 'FirstName',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              type: 'Indexer',
              operand: [
                {
                  path: 'given',
                  type: 'Property',
                  source: {
                    name: 'Name',
                    type: 'ExpressionRef',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}Integer',
                  value: '0',
                  type: 'Literal',
                },
              ],
            },
          },
        },
        {
          name: 'FullName',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Coalesce',
            operand: [
              {
                type: 'Concatenate',
                operand: [
                  {
                    type: 'Concatenate',
                    operand: [
                      {
                        type: 'Concatenate',
                        operand: [
                          {
                            type: 'Concatenate',
                            operand: [
                              {
                                name: 'FirstName',
                                type: 'ExpressionRef',
                              },
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: ' ',
                                type: 'Literal',
                              },
                            ],
                          },
                          {
                            name: 'MiddleInitial',
                            type: 'ExpressionRef',
                          },
                        ],
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: ' ',
                        type: 'Literal',
                      },
                    ],
                  },
                  {
                    name: 'LastName',
                    type: 'ExpressionRef',
                  },
                ],
              },
              {
                type: 'Concatenate',
                operand: [
                  {
                    type: 'Concatenate',
                    operand: [
                      {
                        name: 'FirstName',
                        type: 'ExpressionRef',
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: ' ',
                        type: 'Literal',
                      },
                    ],
                  },
                  {
                    name: 'LastName',
                    type: 'ExpressionRef',
                  },
                ],
              },
            ],
          },
        },
        {
          name: 'Gender',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'gender',
              type: 'Property',
              source: {
                name: 'Patient',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'DateOfBirth',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'birthDate',
              type: 'Property',
              source: {
                name: 'Patient',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'RequestCoverage',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Coalesce',
            operand: [
              {
                path: 'insurance',
                type: 'Property',
                source: {
                  name: 'device_request',
                  type: 'ParameterRef',
                },
              },
              {
                path: 'insurance',
                type: 'Property',
                source: {
                  name: 'service_request',
                  type: 'ParameterRef',
                },
              },
              {
                path: 'insurance',
                type: 'Property',
                source: {
                  name: 'medication_request',
                  type: 'ParameterRef',
                },
              },
            ],
          },
        },
        {
          name: 'CoverageResource',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Query',
              source: [
                {
                  alias: 'coverage',
                  expression: {
                    dataType: '{http://hl7.org/fhir}Coverage',
                    type: 'Retrieve',
                  },
                },
              ],
              relationship: [],
              where: {
                type: 'Equal',
                operand: [
                  {
                    type: 'Concatenate',
                    operand: [
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'Coverage/',
                        type: 'Literal',
                      },
                      {
                        name: 'ToString',
                        libraryName: 'FHIRHelpers',
                        type: 'FunctionRef',
                        operand: [
                          {
                            path: 'id',
                            scope: 'coverage',
                            type: 'Property',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    path: 'value',
                    type: 'Property',
                    source: {
                      path: 'reference',
                      type: 'Property',
                      source: {
                        type: 'Indexer',
                        operand: [
                          {
                            name: 'RequestCoverage',
                            type: 'ExpressionRef',
                          },
                          {
                            valueType: '{urn:hl7-org:elm-types:r1}Integer',
                            value: '0',
                            type: 'Literal',
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        {
          name: 'MedicareId',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'subscriberId',
              type: 'Property',
              source: {
                name: 'CoverageResource',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'HomeAddress',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Query',
              source: [
                {
                  alias: 'address',
                  expression: {
                    path: 'address',
                    type: 'Property',
                    source: {
                      name: 'Patient',
                      type: 'ExpressionRef',
                    },
                  },
                },
              ],
              relationship: [],
              where: {
                type: 'Equal',
                operand: [
                  {
                    path: 'value',
                    type: 'Property',
                    source: {
                      path: 'use',
                      scope: 'address',
                      type: 'Property',
                    },
                  },
                  {
                    valueType: '{urn:hl7-org:elm-types:r1}String',
                    value: 'home',
                    type: 'Literal',
                  },
                ],
              },
            },
          },
        },
        {
          name: 'Line',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              type: 'Indexer',
              operand: [
                {
                  path: 'line',
                  type: 'Property',
                  source: {
                    name: 'HomeAddress',
                    type: 'ExpressionRef',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}Integer',
                  value: '0',
                  type: 'Literal',
                },
              ],
            },
          },
        },
        {
          name: 'City',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'city',
              type: 'Property',
              source: {
                name: 'HomeAddress',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'State',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'state',
              type: 'Property',
              source: {
                name: 'HomeAddress',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'Zip',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'postalCode',
              type: 'Property',
              source: {
                name: 'HomeAddress',
                type: 'ExpressionRef',
              },
            },
          },
        },
        {
          name: 'Telecom',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Coalesce',
            operand: [
              {
                type: 'Query',
                source: [
                  {
                    alias: 'telecom',
                    expression: {
                      path: 'telecom',
                      type: 'Property',
                      source: {
                        name: 'Patient',
                        type: 'ExpressionRef',
                      },
                    },
                  },
                ],
                relationship: [],
                where: {
                  type: 'Equal',
                  operand: [
                    {
                      path: 'value',
                      type: 'Property',
                      source: {
                        path: 'system',
                        scope: 'telecom',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'phone',
                      type: 'Literal',
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          name: 'Phone',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'value',
              type: 'Property',
              source: {
                name: 'Telecom',
                type: 'ExpressionRef',
              },
            },
          },
        },
      ],
    },
  },
};
