// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ElmFile } from '../types';

export const CdsConnectCommonsForFHIRv400: ElmFile = {
  library: {
    annotation: [
      {
        translatorOptions: 'EnableDateRangeOptimization',
        type: 'CqlToElmInfo',
      },
    ],
    identifier: {
      id: 'CDS_Connect_Commons_for_FHIRv400',
      version: '1.0.2',
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
    codeSystems: {
      def: [
        {
          name: 'AIVERSTATUS',
          id: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          accessLevel: 'Public',
        },
        {
          name: 'AICLINSTATUS',
          id: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          accessLevel: 'Public',
        },
        {
          name: 'CONDVERSTATUS',
          id: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          accessLevel: 'Public',
        },
        {
          name: 'CONDCLINSTATUS',
          id: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          accessLevel: 'Public',
        },
      ],
    },
    codes: {
      def: [
        {
          name: 'AllergyIntolerance Confirmed code',
          id: 'confirmed',
          display: 'Confirmed',
          accessLevel: 'Public',
          codeSystem: {
            name: 'AIVERSTATUS',
          },
        },
        {
          name: 'AllergyIntolerance Active code',
          id: 'active',
          display: 'Active',
          accessLevel: 'Public',
          codeSystem: {
            name: 'AICLINSTATUS',
          },
        },
        {
          name: 'Condition Confirmed code',
          id: 'confirmed',
          display: 'Confirmed',
          accessLevel: 'Public',
          codeSystem: {
            name: 'CONDVERSTATUS',
          },
        },
        {
          name: 'Condition Active code',
          id: 'active',
          display: 'Active',
          accessLevel: 'Public',
          codeSystem: {
            name: 'CONDCLINSTATUS',
          },
        },
        {
          name: 'Condition Recurrence code',
          id: 'recurrence',
          display: 'Recurrence',
          accessLevel: 'Public',
          codeSystem: {
            name: 'CONDCLINSTATUS',
          },
        },
        {
          name: 'Condition Relapse code',
          id: 'relapse',
          display: 'Relapse',
          accessLevel: 'Public',
          codeSystem: {
            name: 'CONDCLINSTATUS',
          },
        },
      ],
    },
    concepts: {
      def: [
        {
          name: 'AllergyIntolerance Confirmed',
          display: 'Confirmed',
          accessLevel: 'Public',
          code: [
            {
              name: 'AllergyIntolerance Confirmed code',
            },
          ],
        },
        {
          name: 'AllergyIntolerance Active',
          display: 'Active',
          accessLevel: 'Public',
          code: [
            {
              name: 'AllergyIntolerance Active code',
            },
          ],
        },
        {
          name: 'Condition Confirmed',
          display: 'Confirmed',
          accessLevel: 'Public',
          code: [
            {
              name: 'Condition Confirmed code',
            },
          ],
        },
        {
          name: 'Condition Active',
          display: 'Active',
          accessLevel: 'Public',
          code: [
            {
              name: 'Condition Active code',
            },
          ],
        },
        {
          name: 'Condition Recurrence',
          display: 'Recurrence',
          accessLevel: 'Public',
          code: [
            {
              name: 'Condition Recurrence code',
            },
          ],
        },
        {
          name: 'Condition Relapse',
          display: 'Relapse',
          accessLevel: 'Public',
          code: [
            {
              name: 'Condition Relapse code',
            },
          ],
        },
      ],
    },
    statements: {
      def: [
        {
          name: 'PeriodToInterval',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'If',
            condition: {
              asType: '{urn:hl7-org:elm-types:r1}Boolean',
              type: 'As',
              operand: {
                type: 'IsNull',
                operand: {
                  name: 'period',
                  type: 'OperandRef',
                },
              },
            },
            then: {
              type: 'As',
              operand: {
                type: 'Null',
              },
              asTypeSpecifier: {
                type: 'IntervalTypeSpecifier',
                pointType: {
                  name: '{urn:hl7-org:elm-types:r1}DateTime',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
            else: {
              lowClosed: true,
              highClosed: true,
              type: 'Interval',
              low: {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'start',
                  type: 'Property',
                  source: {
                    name: 'period',
                    type: 'OperandRef',
                  },
                },
              },
              high: {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'end',
                  type: 'Property',
                  source: {
                    name: 'period',
                    type: 'OperandRef',
                  },
                },
              },
            },
          },
          operand: [
            {
              name: 'period',
              operandTypeSpecifier: {
                name: '{http://hl7.org/fhir}Period',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'RangeToInterval',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'If',
            condition: {
              asType: '{urn:hl7-org:elm-types:r1}Boolean',
              type: 'As',
              operand: {
                type: 'IsNull',
                operand: {
                  name: 'range',
                  type: 'OperandRef',
                },
              },
            },
            then: {
              type: 'As',
              operand: {
                type: 'Null',
              },
              asTypeSpecifier: {
                type: 'IntervalTypeSpecifier',
                pointType: {
                  name: '{urn:hl7-org:elm-types:r1}Quantity',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
            else: {
              lowClosed: true,
              highClosed: true,
              type: 'Interval',
              low: {
                name: 'ToQuantity',
                libraryName: 'FHIRHelpers',
                type: 'FunctionRef',
                operand: [
                  {
                    path: 'low',
                    type: 'Property',
                    source: {
                      name: 'range',
                      type: 'OperandRef',
                    },
                  },
                ],
              },
              high: {
                name: 'ToQuantity',
                libraryName: 'FHIRHelpers',
                type: 'FunctionRef',
                operand: [
                  {
                    path: 'high',
                    type: 'Property',
                    source: {
                      name: 'range',
                      type: 'OperandRef',
                    },
                  },
                ],
              },
            },
          },
          operand: [
            {
              name: 'range',
              operandTypeSpecifier: {
                name: '{http://hl7.org/fhir}Range',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ObservationsByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'O',
                expression: {
                  dataType: '{http://hl7.org/fhir}Observation',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'code',
                      scope: 'O',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'Verified',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
            where: {
              type: 'In',
              operand: [
                {
                  path: 'value',
                  type: 'Property',
                  source: {
                    path: 'status',
                    scope: 'O',
                    type: 'Property',
                  },
                },
                {
                  type: 'List',
                  element: [
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'final',
                      type: 'Literal',
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'corrected',
                      type: 'Literal',
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'amended',
                      type: 'Literal',
                    },
                  ],
                },
              ],
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
          name: 'WithUnit',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
                        path: 'unit',
                        type: 'Property',
                        source: {
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
                      },
                    },
                    {
                      name: 'Unit',
                      type: 'OperandRef',
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
                        path: 'code',
                        type: 'Property',
                        source: {
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
                      },
                    },
                    {
                      name: 'Unit',
                      type: 'OperandRef',
                    },
                  ],
                },
              ],
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
            {
              name: 'Unit',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}String',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ObservationLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
                  type: 'Or',
                  operand: [
                    {
                      type: 'Or',
                      operand: [
                        {
                          type: 'In',
                          operand: [
                            {
                              path: 'value',
                              type: 'Property',
                              source: {
                                strict: false,
                                type: 'As',
                                operand: {
                                  path: 'effective',
                                  scope: 'O',
                                  type: 'Property',
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
                          type: 'In',
                          operand: [
                            {
                              path: 'value',
                              type: 'Property',
                              source: {
                                strict: false,
                                type: 'As',
                                operand: {
                                  path: 'effective',
                                  scope: 'O',
                                  type: 'Property',
                                },
                                asTypeSpecifier: {
                                  name: '{http://hl7.org/fhir}instant',
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
                      ],
                    },
                    {
                      type: 'Overlaps',
                      operand: [
                        {
                          name: 'PeriodToInterval',
                          type: 'FunctionRef',
                          operand: [
                            {
                              strict: false,
                              type: 'As',
                              operand: {
                                path: 'effective',
                                scope: 'O',
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
                {
                  type: 'In',
                  operand: [
                    {
                      path: 'value',
                      type: 'Property',
                      source: {
                        path: 'issued',
                        scope: 'O',
                        type: 'Property',
                      },
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
              name: 'ObsList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Observation',
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
          name: 'MostRecent',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Last',
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
              sort: {
                by: [
                  {
                    direction: 'asc',
                    type: 'ByExpression',
                    expression: {
                      type: 'Coalesce',
                      operand: [
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            strict: false,
                            type: 'As',
                            operand: {
                              name: 'effective',
                              type: 'IdentifierRef',
                            },
                            asTypeSpecifier: {
                              name: '{http://hl7.org/fhir}dateTime',
                              type: 'NamedTypeSpecifier',
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            strict: false,
                            type: 'As',
                            operand: {
                              name: 'effective',
                              type: 'IdentifierRef',
                            },
                            asTypeSpecifier: {
                              name: '{http://hl7.org/fhir}instant',
                              type: 'NamedTypeSpecifier',
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'end',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'effective',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'start',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'effective',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            name: 'issued',
                            type: 'IdentifierRef',
                          },
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
          name: 'QuantityValue',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
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
          name: 'ConceptValue',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            name: 'ToConcept',
            libraryName: 'FHIRHelpers',
            type: 'FunctionRef',
            operand: [
              {
                strict: false,
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
                  name: '{http://hl7.org/fhir}CodeableConcept',
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
          name: 'FindDate',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Coalesce',
            operand: [
              {
                path: 'value',
                type: 'Property',
                source: {
                  strict: false,
                  type: 'As',
                  operand: {
                    path: 'effective',
                    type: 'Property',
                    source: {
                      name: 'Obs',
                      type: 'OperandRef',
                    },
                  },
                  asTypeSpecifier: {
                    name: '{http://hl7.org/fhir}dateTime',
                    type: 'NamedTypeSpecifier',
                  },
                },
              },
              {
                path: 'value',
                type: 'Property',
                source: {
                  strict: false,
                  type: 'As',
                  operand: {
                    path: 'effective',
                    type: 'Property',
                    source: {
                      name: 'Obs',
                      type: 'OperandRef',
                    },
                  },
                  asTypeSpecifier: {
                    name: '{http://hl7.org/fhir}instant',
                    type: 'NamedTypeSpecifier',
                  },
                },
              },
              {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'end',
                  type: 'Property',
                  source: {
                    strict: false,
                    type: 'As',
                    operand: {
                      path: 'effective',
                      type: 'Property',
                      source: {
                        name: 'Obs',
                        type: 'OperandRef',
                      },
                    },
                    asTypeSpecifier: {
                      name: '{http://hl7.org/fhir}Period',
                      type: 'NamedTypeSpecifier',
                    },
                  },
                },
              },
              {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'start',
                  type: 'Property',
                  source: {
                    strict: false,
                    type: 'As',
                    operand: {
                      path: 'effective',
                      type: 'Property',
                      source: {
                        name: 'Obs',
                        type: 'OperandRef',
                      },
                    },
                    asTypeSpecifier: {
                      name: '{http://hl7.org/fhir}Period',
                      type: 'NamedTypeSpecifier',
                    },
                  },
                },
              },
              {
                path: 'value',
                type: 'Property',
                source: {
                  path: 'issued',
                  type: 'Property',
                  source: {
                    name: 'Obs',
                    type: 'OperandRef',
                  },
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
          name: 'HighestObservation',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Max',
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
          name: 'ConditionsByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'C',
                expression: {
                  dataType: '{http://hl7.org/fhir}Condition',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'code',
                      scope: 'C',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'Confirmed',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'verificationStatus',
                      scope: 'C',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Condition Confirmed',
                  type: 'ConceptRef',
                },
              ],
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
          name: 'ActiveCondition',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
            relationship: [],
            where: {
              type: 'And',
              operand: [
                {
                  type: 'Equivalent',
                  operand: [
                    {
                      name: 'ToConcept',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          path: 'clinicalStatus',
                          scope: 'C',
                          type: 'Property',
                        },
                      ],
                    },
                    {
                      name: 'Condition Active',
                      type: 'ConceptRef',
                    },
                  ],
                },
                {
                  type: 'IsNull',
                  operand: {
                    path: 'abatement',
                    scope: 'C',
                    type: 'Property',
                  },
                },
              ],
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
          name: 'ActiveOrRecurring',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
            relationship: [],
            where: {
              type: 'Or',
              operand: [
                {
                  type: 'Or',
                  operand: [
                    {
                      type: 'Equivalent',
                      operand: [
                        {
                          name: 'ToConcept',
                          libraryName: 'FHIRHelpers',
                          type: 'FunctionRef',
                          operand: [
                            {
                              path: 'clinicalStatus',
                              scope: 'C',
                              type: 'Property',
                            },
                          ],
                        },
                        {
                          name: 'Condition Active',
                          type: 'ConceptRef',
                        },
                      ],
                    },
                    {
                      type: 'Equivalent',
                      operand: [
                        {
                          name: 'ToConcept',
                          libraryName: 'FHIRHelpers',
                          type: 'FunctionRef',
                          operand: [
                            {
                              path: 'clinicalStatus',
                              scope: 'C',
                              type: 'Property',
                            },
                          ],
                        },
                        {
                          name: 'Condition Recurrence',
                          type: 'ConceptRef',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'Equivalent',
                  operand: [
                    {
                      name: 'ToConcept',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          path: 'clinicalStatus',
                          scope: 'C',
                          type: 'Property',
                        },
                      ],
                    },
                    {
                      name: 'Condition Relapse',
                      type: 'ConceptRef',
                    },
                  ],
                },
              ],
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
          name: 'ConditionLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
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
                  type: 'Or',
                  operand: [
                    {
                      type: 'In',
                      operand: [
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            strict: false,
                            type: 'As',
                            operand: {
                              path: 'onset',
                              scope: 'C',
                              type: 'Property',
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
                          type: 'FunctionRef',
                          operand: [
                            {
                              strict: false,
                              type: 'As',
                              operand: {
                                path: 'onset',
                                scope: 'C',
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
                {
                  type: 'In',
                  operand: [
                    {
                      path: 'value',
                      type: 'Property',
                      source: {
                        path: 'recordedDate',
                        scope: 'C',
                        type: 'Property',
                      },
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
              name: 'CondList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Condition',
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
          name: 'MostRecentCondition',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Last',
            source: {
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
              relationship: [],
              sort: {
                by: [
                  {
                    direction: 'asc',
                    type: 'ByExpression',
                    expression: {
                      type: 'Coalesce',
                      operand: [
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            strict: false,
                            type: 'As',
                            operand: {
                              name: 'onset',
                              type: 'IdentifierRef',
                            },
                            asTypeSpecifier: {
                              name: '{http://hl7.org/fhir}dateTime',
                              type: 'NamedTypeSpecifier',
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'end',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'onset',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'start',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'onset',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            name: 'recordedDate',
                            type: 'IdentifierRef',
                          },
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
          name: 'ProceduresByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'P',
                expression: {
                  dataType: '{http://hl7.org/fhir}Procedure',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'code',
                      scope: 'P',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'Completed',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'P',
                expression: {
                  name: 'ProcList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'P',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'completed',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'ProcList',
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
          name: 'ProcedureInProgress',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'P',
                expression: {
                  name: 'ProcList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'P',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'in-progress',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'ProcList',
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
          name: 'ProcedurePerformance',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'P',
                expression: {
                  name: 'ProcList',
                  type: 'OperandRef',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Not',
              operand: {
                type: 'In',
                operand: [
                  {
                    path: 'value',
                    type: 'Property',
                    source: {
                      path: 'status',
                      scope: 'P',
                      type: 'Property',
                    },
                  },
                  {
                    type: 'List',
                    element: [
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'preparation',
                        type: 'Literal',
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'not-done',
                        type: 'Literal',
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'entered-in-error',
                        type: 'Literal',
                      },
                      {
                        valueType: '{urn:hl7-org:elm-types:r1}String',
                        value: 'unknown',
                        type: 'Literal',
                      },
                    ],
                  },
                ],
              },
            },
          },
          operand: [
            {
              name: 'ProcList',
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
          name: 'ProcedureLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'P',
                expression: {
                  name: 'ProcList',
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
                        strict: false,
                        type: 'As',
                        operand: {
                          path: 'performed',
                          scope: 'P',
                          type: 'Property',
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
                      type: 'FunctionRef',
                      operand: [
                        {
                          strict: false,
                          type: 'As',
                          operand: {
                            path: 'performed',
                            scope: 'P',
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
              name: 'ProcList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Procedure',
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
          name: 'MostRecentProcedure',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Last',
            source: {
              type: 'Query',
              source: [
                {
                  alias: 'P',
                  expression: {
                    name: 'ProcList',
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
                      type: 'Coalesce',
                      operand: [
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            strict: false,
                            type: 'As',
                            operand: {
                              name: 'performed',
                              type: 'IdentifierRef',
                            },
                            asTypeSpecifier: {
                              name: '{http://hl7.org/fhir}dateTime',
                              type: 'NamedTypeSpecifier',
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'end',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'performed',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
                        },
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'start',
                            type: 'Property',
                            source: {
                              strict: false,
                              type: 'As',
                              operand: {
                                name: 'performed',
                                type: 'IdentifierRef',
                              },
                              asTypeSpecifier: {
                                name: '{http://hl7.org/fhir}Period',
                                type: 'NamedTypeSpecifier',
                              },
                            },
                          },
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
              name: 'ProcList',
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
          name: 'ServiceRequestActiveOrCompleted',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'S',
                expression: {
                  name: 'ServiceRequestList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'S',
                    type: 'Property',
                  },
                },
                {
                  type: 'List',
                  element: [
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'active',
                      type: 'Literal',
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'completed',
                      type: 'Literal',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'ServiceRequestList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}ServiceRequest',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ServiceRequestLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'S',
                expression: {
                  name: 'ServiceRequestList',
                  type: 'OperandRef',
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
                    path: 'authoredOn',
                    scope: 'S',
                    type: 'Property',
                  },
                },
                {
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
              ],
            },
          },
          operand: [
            {
              name: 'ServiceRequestList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}ServiceRequest',
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
          name: 'MedicationStatementsByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  dataType: '{http://hl7.org/fhir}MedicationStatement',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      strict: false,
                      type: 'As',
                      operand: {
                        path: 'medication',
                        scope: 'M',
                        type: 'Property',
                      },
                      asTypeSpecifier: {
                        name: '{http://hl7.org/fhir}CodeableConcept',
                        type: 'NamedTypeSpecifier',
                      },
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'MedicationRequestsByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  dataType: '{http://hl7.org/fhir}MedicationRequest',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      strict: false,
                      type: 'As',
                      operand: {
                        path: 'medication',
                        scope: 'M',
                        type: 'Property',
                      },
                      asTypeSpecifier: {
                        name: '{http://hl7.org/fhir}CodeableConcept',
                        type: 'NamedTypeSpecifier',
                      },
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ActiveMedicationStatement',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
                  type: 'OperandRef',
                },
              },
            ],
            let: [
              {
                identifier: 'EffectivePeriod',
                expression: {
                  name: 'PeriodToInterval',
                  type: 'FunctionRef',
                  operand: [
                    {
                      strict: false,
                      type: 'As',
                      operand: {
                        path: 'effective',
                        scope: 'M',
                        type: 'Property',
                      },
                      asTypeSpecifier: {
                        name: '{http://hl7.org/fhir}Period',
                        type: 'NamedTypeSpecifier',
                      },
                    },
                  ],
                },
              },
            ],
            relationship: [],
            where: {
              type: 'And',
              operand: [
                {
                  type: 'Equal',
                  operand: [
                    {
                      path: 'value',
                      type: 'Property',
                      source: {
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'active',
                      type: 'Literal',
                    },
                  ],
                },
                {
                  type: 'Or',
                  operand: [
                    {
                      type: 'IsNull',
                      operand: {
                        type: 'End',
                        operand: {
                          name: 'EffectivePeriod',
                          type: 'QueryLetRef',
                        },
                      },
                    },
                    {
                      type: 'After',
                      operand: [
                        {
                          type: 'End',
                          operand: {
                            name: 'EffectivePeriod',
                            type: 'QueryLetRef',
                          },
                        },
                        {
                          type: 'Now',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationStatement',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ActiveMedicationRequest',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'M',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'active',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationRequest',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ActiveOrCompletedMedicationRequest',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
                  type: 'OperandRef',
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
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'active',
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
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'completed',
                      type: 'Literal',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationRequest',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ActiveOrCompletedMedicationStatement',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
                  type: 'OperandRef',
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
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'active',
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
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'completed',
                      type: 'Literal',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationStatement',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ActiveCompletedOrStoppedMedicationRequest',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
                  type: 'OperandRef',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Or',
              operand: [
                {
                  type: 'Or',
                  operand: [
                    {
                      type: 'Equal',
                      operand: [
                        {
                          path: 'value',
                          type: 'Property',
                          source: {
                            path: 'status',
                            scope: 'M',
                            type: 'Property',
                          },
                        },
                        {
                          valueType: '{urn:hl7-org:elm-types:r1}String',
                          value: 'active',
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
                            path: 'status',
                            scope: 'M',
                            type: 'Property',
                          },
                        },
                        {
                          valueType: '{urn:hl7-org:elm-types:r1}String',
                          value: 'completed',
                          type: 'Literal',
                        },
                      ],
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
                        path: 'status',
                        scope: 'M',
                        type: 'Property',
                      },
                    },
                    {
                      valueType: '{urn:hl7-org:elm-types:r1}String',
                      value: 'stopped',
                      type: 'Literal',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationRequest',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'MedicationRequestLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
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
              type: 'In',
              operand: [
                {
                  path: 'value',
                  type: 'Property',
                  source: {
                    path: 'authoredOn',
                    scope: 'M',
                    type: 'Property',
                  },
                },
                {
                  name: 'LookBackInterval',
                  type: 'QueryLetRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationRequest',
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
          name: 'MedicationStatementLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'M',
                expression: {
                  name: 'MedList',
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
                        strict: false,
                        type: 'As',
                        operand: {
                          path: 'effective',
                          scope: 'M',
                          type: 'Property',
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
                      type: 'FunctionRef',
                      operand: [
                        {
                          strict: false,
                          type: 'As',
                          operand: {
                            path: 'effective',
                            scope: 'M',
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
              name: 'MedList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}MedicationStatement',
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
          name: 'EncountersByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'E',
                expression: {
                  dataType: '{http://hl7.org/fhir}Encounter',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Exists',
              operand: {
                type: 'Query',
                source: [
                  {
                    alias: 'ET',
                    expression: {
                      path: 'type',
                      scope: 'E',
                      type: 'Property',
                    },
                  },
                ],
                relationship: [],
                where: {
                  type: 'Equivalent',
                  operand: [
                    {
                      name: 'ToConcept',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          name: 'ET',
                          type: 'AliasRef',
                        },
                      ],
                    },
                    {
                      name: 'Koncept',
                      type: 'OperandRef',
                    },
                  ],
                },
              },
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'InProgress',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'E',
                expression: {
                  name: 'EncList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'E',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'in-progress',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'EncList',
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
          name: 'AllergyIntolerancesByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'A',
                expression: {
                  dataType: '{http://hl7.org/fhir}AllergyIntolerance',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'code',
                      scope: 'A',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ActiveOrConfirmedAllergyIntolerance',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'A',
                expression: {
                  name: 'AllergyIntolList',
                  type: 'OperandRef',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Or',
              operand: [
                {
                  type: 'Equivalent',
                  operand: [
                    {
                      name: 'ToConcept',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          path: 'clinicalStatus',
                          scope: 'A',
                          type: 'Property',
                        },
                      ],
                    },
                    {
                      name: 'AllergyIntolerance Active',
                      type: 'ConceptRef',
                    },
                  ],
                },
                {
                  type: 'Equivalent',
                  operand: [
                    {
                      name: 'ToConcept',
                      libraryName: 'FHIRHelpers',
                      type: 'FunctionRef',
                      operand: [
                        {
                          path: 'verificationStatus',
                          scope: 'A',
                          type: 'Property',
                        },
                      ],
                    },
                    {
                      name: 'AllergyIntolerance Confirmed',
                      type: 'ConceptRef',
                    },
                  ],
                },
              ],
            },
          },
          operand: [
            {
              name: 'AllergyIntolList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}AllergyIntolerance',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'GoalLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'G',
                expression: {
                  name: 'GoalList',
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
              {
                identifier: 'StartDate',
                expression: {
                  path: 'value',
                  type: 'Property',
                  source: {
                    strict: false,
                    type: 'As',
                    operand: {
                      path: 'start',
                      scope: 'G',
                      type: 'Property',
                    },
                    asTypeSpecifier: {
                      name: '{http://hl7.org/fhir}date',
                      type: 'NamedTypeSpecifier',
                    },
                  },
                },
              },
              {
                identifier: 'StatusDate',
                expression: {
                  path: 'value',
                  type: 'Property',
                  source: {
                    path: 'statusDate',
                    scope: 'G',
                    type: 'Property',
                  },
                },
              },
              {
                identifier: 'TargetDates',
                expression: {
                  type: 'Query',
                  source: [
                    {
                      alias: 'T',
                      expression: {
                        path: 'target',
                        scope: 'G',
                        type: 'Property',
                      },
                    },
                  ],
                  relationship: [],
                  return: {
                    expression: {
                      path: 'value',
                      type: 'Property',
                      source: {
                        strict: false,
                        type: 'As',
                        operand: {
                          path: 'due',
                          scope: 'T',
                          type: 'Property',
                        },
                        asTypeSpecifier: {
                          name: '{http://hl7.org/fhir}date',
                          type: 'NamedTypeSpecifier',
                        },
                      },
                    },
                  },
                },
              },
              {
                identifier: 'TargetQuantities',
                expression: {
                  type: 'Query',
                  source: [
                    {
                      alias: 'T',
                      expression: {
                        path: 'target',
                        scope: 'G',
                        type: 'Property',
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
                            path: 'due',
                            scope: 'T',
                            type: 'Property',
                          },
                          asTypeSpecifier: {
                            name: '{http://hl7.org/fhir}Duration',
                            type: 'NamedTypeSpecifier',
                          },
                        },
                      ],
                    },
                  },
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Or',
              operand: [
                {
                  type: 'Or',
                  operand: [
                    {
                      type: 'Or',
                      operand: [
                        {
                          type: 'In',
                          operand: [
                            {
                              type: 'ToDateTime',
                              operand: {
                                name: 'StartDate',
                                type: 'QueryLetRef',
                              },
                            },
                            {
                              name: 'LookBackInterval',
                              type: 'QueryLetRef',
                            },
                          ],
                        },
                        {
                          type: 'In',
                          operand: [
                            {
                              type: 'ToDateTime',
                              operand: {
                                name: 'StatusDate',
                                type: 'QueryLetRef',
                              },
                            },
                            {
                              name: 'LookBackInterval',
                              type: 'QueryLetRef',
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: 'Exists',
                      operand: {
                        type: 'Query',
                        source: [
                          {
                            alias: 'TD',
                            expression: {
                              name: 'TargetDates',
                              type: 'QueryLetRef',
                            },
                          },
                        ],
                        relationship: [],
                        where: {
                          type: 'In',
                          operand: [
                            {
                              type: 'ToDateTime',
                              operand: {
                                name: 'TD',
                                type: 'AliasRef',
                              },
                            },
                            {
                              name: 'LookBackInterval',
                              type: 'QueryLetRef',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
                {
                  type: 'Exists',
                  operand: {
                    type: 'Query',
                    source: [
                      {
                        alias: 'TQ',
                        expression: {
                          name: 'TargetQuantities',
                          type: 'QueryLetRef',
                        },
                      },
                    ],
                    relationship: [],
                    where: {
                      type: 'In',
                      operand: [
                        {
                          type: 'ToDateTime',
                          operand: {
                            type: 'Add',
                            operand: [
                              {
                                name: 'StartDate',
                                type: 'QueryLetRef',
                              },
                              {
                                name: 'TQ',
                                type: 'AliasRef',
                              },
                            ],
                          },
                        },
                        {
                          name: 'LookBackInterval',
                          type: 'QueryLetRef',
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
          operand: [
            {
              name: 'GoalList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Goal',
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
          name: 'ImmunizationsByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'I',
                expression: {
                  dataType: '{http://hl7.org/fhir}Immunization',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'vaccineCode',
                      scope: 'I',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'CompletedImmunization',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'I',
                expression: {
                  name: 'ImmunizationList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'I',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'completed',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'ImmunizationList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Immunization',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'ImmunizationLookBack',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'I',
                expression: {
                  name: 'ImmunizationList',
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
              type: 'In',
              operand: [
                {
                  path: 'value',
                  type: 'Property',
                  source: {
                    strict: false,
                    type: 'As',
                    operand: {
                      path: 'occurrence',
                      scope: 'I',
                      type: 'Property',
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
          },
          operand: [
            {
              name: 'ImmunizationList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Immunization',
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
          name: 'MostRecentImmunization',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Last',
            source: {
              type: 'Query',
              source: [
                {
                  alias: 'I',
                  expression: {
                    name: 'ImmunizationList',
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
                      path: 'value',
                      type: 'Property',
                      source: {
                        strict: false,
                        type: 'As',
                        operand: {
                          name: 'occurrence',
                          type: 'IdentifierRef',
                        },
                        asTypeSpecifier: {
                          name: '{http://hl7.org/fhir}dateTime',
                          type: 'NamedTypeSpecifier',
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
          operand: [
            {
              name: 'ImmunizationList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Immunization',
                  type: 'NamedTypeSpecifier',
                },
              },
            },
          ],
        },
        {
          name: 'DevicesByConcept',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'D',
                expression: {
                  dataType: '{http://hl7.org/fhir}Device',
                  type: 'Retrieve',
                },
              },
            ],
            relationship: [],
            where: {
              type: 'Equivalent',
              operand: [
                {
                  name: 'ToConcept',
                  libraryName: 'FHIRHelpers',
                  type: 'FunctionRef',
                  operand: [
                    {
                      path: 'type',
                      scope: 'D',
                      type: 'Property',
                    },
                  ],
                },
                {
                  name: 'Koncept',
                  type: 'OperandRef',
                },
              ],
            },
          },
          operand: [
            {
              name: 'Koncept',
              operandTypeSpecifier: {
                name: '{urn:hl7-org:elm-types:r1}Concept',
                type: 'NamedTypeSpecifier',
              },
            },
          ],
        },
        {
          name: 'ActiveDevice',
          context: 'Patient',
          accessLevel: 'Public',
          type: 'FunctionDef',
          expression: {
            type: 'Query',
            source: [
              {
                alias: 'D',
                expression: {
                  name: 'DeviceList',
                  type: 'OperandRef',
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
                    path: 'status',
                    scope: 'D',
                    type: 'Property',
                  },
                },
                {
                  valueType: '{urn:hl7-org:elm-types:r1}String',
                  value: 'active',
                  type: 'Literal',
                },
              ],
            },
          },
          operand: [
            {
              name: 'DeviceList',
              operandTypeSpecifier: {
                type: 'ListTypeSpecifier',
                elementType: {
                  name: '{http://hl7.org/fhir}Device',
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
