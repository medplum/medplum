// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ElmFile } from '../types';

export const BasicPractitionerInfoPrepopulation: ElmFile = {
  library: {
    annotation: [
      {
        translatorOptions: 'EnableDateRangeOptimization',
        type: 'CqlToElmInfo',
      },
      {
        libraryId: 'BasicPractitionerInfoPrepopulation',
        libraryVersion: '0.1.0',
        startLine: 16,
        startChar: 123,
        endLine: 16,
        endChar: 127,
        message: 'List-valued expression was demoted to a singleton.',
        errorType: 'semantic',
        errorSeverity: 'warning',
        type: 'CqlToElmError',
      },
      {
        libraryId: 'BasicPractitionerInfoPrepopulation',
        libraryVersion: '0.1.0',
        startLine: 16,
        startChar: 123,
        endLine: 16,
        endChar: 127,
        message: 'List-valued expression was demoted to a singleton.',
        errorType: 'semantic',
        errorSeverity: 'warning',
        type: 'CqlToElmError',
      },
    ],
    identifier: {
      id: 'BasicPractitionerInfoPrepopulation',
      version: '0.1.0',
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
          name: 'SigningProviderReference',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Coalesce',
            operand: [
              {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'reference',
                  type: 'Property',
                  source: {
                    path: 'performer',
                    type: 'Property',
                    source: {
                      name: 'device_request',
                      type: 'ParameterRef',
                    },
                  },
                },
              },
              {
                type: 'SingletonFrom',
                operand: {
                  type: 'Query',
                  source: [
                    {
                      alias: '$this',
                      expression: {
                        type: 'Query',
                        source: [
                          {
                            alias: '$this',
                            expression: {
                              path: 'performer',
                              type: 'Property',
                              source: {
                                name: 'service_request',
                                type: 'ParameterRef',
                              },
                            },
                          },
                        ],
                        where: {
                          type: 'Not',
                          operand: {
                            type: 'IsNull',
                            operand: {
                              path: 'reference',
                              type: 'Property',
                              source: {
                                name: '$this',
                                type: 'AliasRef',
                              },
                            },
                          },
                        },
                        return: {
                          distinct: false,
                          expression: {
                            path: 'reference',
                            type: 'Property',
                            source: {
                              name: '$this',
                              type: 'AliasRef',
                            },
                          },
                        },
                      },
                    },
                  ],
                  where: {
                    type: 'Not',
                    operand: {
                      type: 'IsNull',
                      operand: {
                        path: 'value',
                        type: 'Property',
                        source: {
                          name: '$this',
                          type: 'AliasRef',
                        },
                      },
                    },
                  },
                  return: {
                    distinct: false,
                    expression: {
                      path: 'value',
                      type: 'Property',
                      source: {
                        name: '$this',
                        type: 'AliasRef',
                      },
                    },
                  },
                },
              },
              {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'reference',
                  type: 'Property',
                  source: {
                    path: 'requester',
                    type: 'Property',
                    source: {
                      name: 'medication_request',
                      type: 'ParameterRef',
                    },
                  },
                },
              },
            ],
          },
        },
        {
          name: 'OrderingProvider',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Query',
              source: [
                {
                  alias: 'practitioner',
                  expression: {
                    dataType: '{http://hl7.org/fhir}Practitioner',
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
                        value: 'Practitioner/',
                        type: 'Literal',
                      },
                      {
                        name: 'ToString',
                        libraryName: 'FHIRHelpers',
                        type: 'FunctionRef',
                        operand: [
                          {
                            path: 'id',
                            scope: 'practitioner',
                            type: 'Property',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    name: 'SigningProviderReference',
                    type: 'ExpressionRef',
                  },
                ],
              },
            },
          },
        },
        {
          name: 'Name',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Union',
              operand: [
                {
                  type: 'Query',
                  source: [
                    {
                      alias: 'name',
                      expression: {
                        path: 'name',
                        type: 'Property',
                        source: {
                          name: 'OrderingProvider',
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
                {
                  path: 'name',
                  type: 'Property',
                  source: {
                    name: 'OrderingProvider',
                    type: 'ExpressionRef',
                  },
                },
              ],
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
          name: 'NPI',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'value',
              type: 'Property',
              source: {
                type: 'SingletonFrom',
                operand: {
                  type: 'Query',
                  source: [
                    {
                      alias: 'identifier',
                      expression: {
                        path: 'identifier',
                        type: 'Property',
                        source: {
                          name: 'OrderingProvider',
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
                          scope: 'identifier',
                          type: 'Property',
                        },
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'http://hl7.org/fhir/sid/us-npi',
                        type: 'Literal',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        {
          name: 'Address',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'SingletonFrom',
            operand: {
              type: 'Union',
              operand: [
                {
                  type: 'Query',
                  source: [
                    {
                      alias: 'address',
                      expression: {
                        path: 'address',
                        type: 'Property',
                        source: {
                          name: 'OrderingProvider',
                          type: 'ExpressionRef',
                        },
                      },
                    },
                  ],
                  relationship: [],
                  where: {
                    type: 'Or',
                    operand: [
                      {
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
                            value: 'postal',
                            type: 'Literal',
                          },
                        ],
                      },
                      {
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
                            value: 'work',
                            type: 'Literal',
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  path: 'address',
                  type: 'Property',
                  source: {
                    name: 'OrderingProvider',
                    type: 'ExpressionRef',
                  },
                },
              ],
            },
          },
        },
        {
          name: 'Line',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            type: 'Query',
            source: [
              {
                alias: '$this',
                expression: {
                  path: 'line',
                  type: 'Property',
                  source: {
                    name: 'Address',
                    type: 'ExpressionRef',
                  },
                },
              },
            ],
            where: {
              type: 'Not',
              operand: {
                type: 'IsNull',
                operand: {
                  path: 'value',
                  type: 'Property',
                  source: {
                    name: '$this',
                    type: 'AliasRef',
                  },
                },
              },
            },
            return: {
              distinct: false,
              expression: {
                path: 'value',
                type: 'Property',
                source: {
                  name: '$this',
                  type: 'AliasRef',
                },
              },
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
                name: 'Address',
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
                name: 'Address',
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
                name: 'Address',
                type: 'ExpressionRef',
              },
            },
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
                type: 'SingletonFrom',
                operand: {
                  type: 'Query',
                  source: [
                    {
                      alias: 'telecom',
                      expression: {
                        path: 'telecom',
                        type: 'Property',
                        source: {
                          name: 'OrderingProvider',
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
              },
            },
          },
        },
        {
          name: 'Email',
          context: 'Patient',
          accessLevel: 'Public',
          expression: {
            path: 'value',
            type: 'Property',
            source: {
              path: 'value',
              type: 'Property',
              source: {
                type: 'SingletonFrom',
                operand: {
                  type: 'Query',
                  source: [
                    {
                      alias: 'telecom',
                      expression: {
                        path: 'telecom',
                        type: 'Property',
                        source: {
                          name: 'OrderingProvider',
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
                        value: 'email',
                        type: 'Literal',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
    },
  },
};
