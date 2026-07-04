// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ElmFile } from '../types';

export const DTRHelpers: ElmFile = {
  library: {
    annotation: [
      {
        translatorOptions: 'EnableDateRangeOptimization',
        type: 'CqlToElmInfo',
      },
    ],
    identifier: {
      id: 'DTRHelpers',
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
        {
          localIdentifier: 'CDS',
          path: 'CDS_Connect_Commons_for_FHIRv400',
          version: '1.0.2',
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
          name: 'CodesFromConditions',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Distinct',
            operand: {
              type: 'Flatten',
              operand: {
                type: 'Query',
                source: [
                  {
                    alias: 'C',
                    expression: {
                      name: 'CondList',
                      type: 'OperandRef',
                    },
                  },
                ],
                let: [
                  {
                    identifier: 'DiagnosesCodings',
                    expression: {
                      type: 'Query',
                      source: [
                        {
                          alias: 'CODING',
                          expression: {
                            path: 'coding',
                            type: 'Property',
                            source: {
                              path: 'code',
                              scope: 'C',
                              type: 'Property',
                            },
                          },
                        },
                      ],
                      relationship: [],
                      where: {
                        type: 'In',
                        operand: [
                          {
                            path: 'value',
                            type: 'Property',
                            source: {
                              path: 'system',
                              scope: 'CODING',
                              type: 'Property',
                            },
                          },
                          {
                            type: 'List',
                            element: [
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://hl7.org/fhir/sid/icd-10',
                                type: 'Literal',
                              },
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://hl7.org/fhir/sid/icd-10-cm',
                                type: 'Literal',
                              },
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://snomed.info/sct',
                                type: 'Literal',
                              },
                            ],
                          },
                        ],
                      },
                      return: {
                        expression: {
                          name: 'ToCode',
                          libraryName: 'FHIRHelpers',
                          type: 'FunctionRef',
                          operand: [
                            {
                              name: 'CODING',
                              type: 'AliasRef',
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
                relationship: [],
                return: {
                  expression: {
                    name: 'DiagnosesCodings',
                    type: 'QueryLetRef',
                  },
                },
              },
            },
          },
          operand: [
            {
              name: 'CondList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Condition',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'FirstDateConditionRecorded',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'First',
            source: {
              type: 'Query',
              source: [
                {
                  alias: 'C',
                  expression: {
                    name: 'ConditionList',
                    type: 'OperandRef',
                  },
                },
              ],
              relationship: [],
              sort: {
                by: [
                  {
                    direction: 'asc',
                    type: 'ByExpression',
                    expression: {
                      name: 'ToDateTime',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          name: 'recordedDate',
                          type: 'IdentifierRef',
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
          operand: [
            {
              name: 'ConditionList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Condition',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'LowestObservation',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Min',
            source: {
              type: 'Query',
              source: [
                {
                  alias: 'O',
                  expression: {
                    name: 'ObsList',
                    type: 'OperandRef',
                  },
                },
              ],
              relationship: [],
              return: {
                expression: {
                  name: 'ToQuantity',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      strict: false,
                      type: 'As',
                      operand: {
                        path: 'value',
                        scope: 'O',
                        type: 'Property',
                      },
                      asTypeSpecifier: {
                        name: '{http://hl7.org/fhir}Quantity',
                        type: 'NamedTypeSpecifier',
                      },
                    },
                  ],
                },
              },
            },
          },
          operand: [
            {
              name: 'ObsList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Observation',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'NullSafeToQuantityWithoutUnit',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'If',
            condition: {
              asType: '{urn:hl7-org:elm-types:r1}Boolean',
              type: 'As',
              operand: {
                type: 'Not',
                operand: {
                  type: 'IsNull',
                  operand: {
                    name: 'Qty',
                    type: 'OperandRef',
                  },
                },
              },
            },
            then: {
              path: 'value',
              type: 'Property',
              source: {
                path: 'value',
                type: 'Property',
                source: {
                  name: 'Qty',
                  type: 'OperandRef',
                },
              },
            },
            else: {
              asType: '{urn:hl7-org:elm-types:r1}Decimal',
              type: 'As',
              operand: {
                type: 'Null',
              },
            },
          },
          operand: [
            {
              name: 'Qty',
              operandTypeSpecifier: {
                name: '{http://hl7.org/fhir}Quantity',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'GetObservationValue',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            name: 'NullSafeToQuantityWithoutUnit',
            type: 'FunctionRef',
            operand: [
              {
                strict: true,
                type: 'As',
                operand: {
                  path: 'value',
                  type: 'Property',
                  source: {
                    name: 'Obs',
                    type: 'OperandRef',
                  },
                },
                asTypeSpecifier: {
                  name: '{http://hl7.org/fhir}Quantity',
                  type: 'NamedTypeSpecifier',
                },
              },
            ],
          },
          operand: [
            {
              name: 'Obs',
              operandTypeSpecifier: {
                name: '{http://hl7.org/fhir}Observation',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'EncounterLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'E',
                expression: {
                  name: 'EncounterList',
                  type: 'OperandRef',
                },
              },
            ],
            let: [
              {
                identifier: 'LookBackInterval',
                expression: {
                  lowClosed: true,
                  highClosed: true,
                  type: 'Interval',
                  low: {
                    type: 'Subtract',
                    operand: [
                      {
                        type: 'Now',
                      },
                      {
                        name: 'LookBack',
                        type: 'OperandRef',
                      },
                    ],
                  },
                  high: {
                    type: 'Now',
                  },
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Or',
              operand: [
                {
                  type: 'In',
                  operand: [
                    {
                      path: 'value',
                      type: 'Property',
                      source: {
                        strict: true,
                        type: 'As',
                        operand: {
                          path: 'start',
                          type: 'Property',
                          source: {
                            path: 'period',
                            scope: 'E',
                            type: 'Property',
                          },
                        },
                        asTypeSpecifier: {
                          name: '{http://hl7.org/fhir}dateTime',
                          type: 'NamedTypeSpecifier',
                        },
                      },
                    },
                    {
                      name: 'LookBackInterval',
                      type: 'QueryLetRef',
                    },
                  ],
                },
                {
                  type: 'Overlaps',
                  operand: [
                    {
                      name: 'PeriodToInterval',
                      libraryName: 'CDS',
                      type: 'FunctionRef',
                      operand: [
                        {
                          strict: true,
                          type: 'As',
                          operand: {
                            path: 'period',
                            scope: 'E',
                            type: 'Property',
                          },
                          asTypeSpecifier: {
                            name: '{http://hl7.org/fhir}Period',
                            type: 'NamedTypeSpecifier',
                          },
                        },
                      ],
                    },
                    {
                      name: 'LookBackInterval',
                      type: 'QueryLetRef',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'EncounterList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Encounter',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
            {
              name: 'LookBack',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Quantity',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ConvertEncounterDetails',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Distinct',
            operand: {
              type: 'Flatten',
              operand: {
                type: 'Query',
                source: [
                  {
                    alias: 'E',
                    expression: {
                      name: 'EncounterList',
                      type: 'OperandRef',
                    },
                  },
                ],
                let: [
                  {
                    identifier: 'EncounterCodings',
                    expression: {
                      type: 'Query',
                      source: [
                        {
                          alias: 'CODING',
                          expression: {
                            type: 'Flatten',
                            operand: {
                              type: 'Query',
                              source: [
                                {
                                  alias: '$this',
                                  expression: {
                                    path: 'type',
                                    scope: 'E',
                                    type: 'Property',
                                  },
                                },
                              ],
                              where: {
                                type: 'Not',
                                operand: {
                                  type: 'IsNull',
                                  operand: {
                                    path: 'coding',
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
                                  path: 'coding',
                                  type: 'Property',
                                  source: {
                                    name: '$this',
                                    type: 'AliasRef',
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                      relationship: [],
                      return: {
                        expression: {
                          type: 'Tuple',
                          element: [
                            {
                              name: 'code',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'code',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                            {
                              name: 'system',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'system',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                            {
                              name: 'display',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'display',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                            {
                              name: 'periodStart',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'start',
                                  type: 'Property',
                                  source: {
                                    path: 'period',
                                    scope: 'E',
                                    type: 'Property',
                                  },
                                },
                              },
                            },
                            {
                              name: 'encounterReason',
                              value: {
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
                                            path: 'coding',
                                            type: 'Property',
                                            source: {
                                              type: 'Indexer',
                                              operand: [
                                                {
                                                  path: 'reasonCode',
                                                  scope: 'E',
                                                  type: 'Property',
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
                                      where: {
                                        type: 'Not',
                                        operand: {
                                          type: 'IsNull',
                                          operand: {
                                            path: 'display',
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
                                          path: 'display',
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
                              name: 'type',
                              value: {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'encounter',
                                type: 'Literal',
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
                relationship: [],
                return: {
                  expression: {
                    name: 'EncounterCodings',
                    type: 'QueryLetRef',
                  },
                },
              },
            },
          },
          operand: [
            {
              name: 'EncounterList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Encounter',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ProcedureCoding',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Distinct',
            operand: {
              type: 'Flatten',
              operand: {
                type: 'Query',
                source: [
                  {
                    alias: 'P',
                    expression: {
                      name: 'ProcedureList',
                      type: 'OperandRef',
                    },
                  },
                ],
                let: [
                  {
                    identifier: 'DiagnosesCodings',
                    expression: {
                      type: 'Query',
                      source: [
                        {
                          alias: 'CODING',
                          expression: {
                            path: 'coding',
                            type: 'Property',
                            source: {
                              path: 'code',
                              scope: 'P',
                              type: 'Property',
                            },
                          },
                        },
                      ],
                      relationship: [],
                      return: {
                        expression: {
                          type: 'Tuple',
                          element: [
                            {
                              name: 'code',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'code',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                            {
                              name: 'system',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'system',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                            {
                              name: 'display',
                              value: {
                                path: 'value',
                                type: 'Property',
                                source: {
                                  path: 'display',
                                  scope: 'CODING',
                                  type: 'Property',
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
                relationship: [],
                return: {
                  expression: {
                    name: 'DiagnosesCodings',
                    type: 'QueryLetRef',
                  },
                },
              },
            },
          },
          operand: [
            {
              name: 'ProcedureList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Procedure',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'CodesFromProcedures',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Distinct',
            operand: {
              type: 'Flatten',
              operand: {
                type: 'Query',
                source: [
                  {
                    alias: 'P',
                    expression: {
                      name: 'ProcedureList',
                      type: 'OperandRef',
                    },
                  },
                ],
                let: [
                  {
                    identifier: 'DiagnosesCodings',
                    expression: {
                      type: 'Query',
                      source: [
                        {
                          alias: 'CODING',
                          expression: {
                            path: 'coding',
                            type: 'Property',
                            source: {
                              path: 'code',
                              scope: 'P',
                              type: 'Property',
                            },
                          },
                        },
                      ],
                      relationship: [],
                      where: {
                        type: 'In',
                        operand: [
                          {
                            path: 'value',
                            type: 'Property',
                            source: {
                              path: 'system',
                              scope: 'CODING',
                              type: 'Property',
                            },
                          },
                          {
                            type: 'List',
                            element: [
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://hl7.org/fhir/sid/icd-10',
                                type: 'Literal',
                              },
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://hl7.org/fhir/sid/icd-10-cm',
                                type: 'Literal',
                              },
                              {
                                valueType: '{urn:hl7-org:elm-types:r1}String',
                                value: 'http://snomed.info/sct',
                                type: 'Literal',
                              },
                            ],
                          },
                        ],
                      },
                      return: {
                        expression: {
                          name: 'ToCode',
                          libraryName: 'FHIRHelpers',
                          type: 'FunctionRef',
                          operand: [
                            {
                              name: 'CODING',
                              type: 'AliasRef',
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
                relationship: [],
                return: {
                  expression: {
                    name: 'DiagnosesCodings',
                    type: 'QueryLetRef',
                  },
                },
              },
            },
          },
          operand: [
            {
              name: 'ProcedureList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Procedure',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
      ],
    },
  },
};
