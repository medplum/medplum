// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The root production rule is library, which specifies the overall structure for a library file.
 *
 * See: https://build.fhir.org/ig/HL7/cql/08-a-cqlsyntax.html#declarations-2
 */
export interface CqlLibrary {
  qualifiedIdentifier?: string;
  versionSpecifier?: string;
  directives?: CqlDirective[];
  definitions?: CqlDefinition[];
  statements?: CqlStatement[];
}

export interface CqlDirective {
  identifier: string;
  value?: string;
}

export interface CqlUsingDefinition {
  qualifiedIdentifier: string;
  versionSpecifier?: string;
  localIdentifier?: string;
}

export interface CqlIncludeDefinition {
  qualifiedIdentifier: string;
  versionSpecifier?: string;
  localIdentifier?: string;
  tupleSelector?: string;
}

export interface CqlCodeSystemDefinition {
  accessModifier?: string;
  identifier: string;
  codeSystemId: string;
  versionSpecifier?: string;
}

export interface CqlValueSetDefinition {
  accessModifier?: string;
  identifier: string;
  valueSetId: string;
  versionSpecifier?: string;
}

export type CqlDefinition = CqlUsingDefinition | CqlIncludeDefinition | CqlCodeSystemDefinition | CqlValueSetDefinition;

export type CqlAccessModifier = 'public' | 'private';

export interface CqlExpressionDefinition {
  accessModifier?: CqlAccessModifier;
  identifier: string;
  expression?: any;
}

export interface CqlContextDefinition {
  modelIdentifier?: string;
  identifier: string;
}

export interface CqlFunctionDefinition {
  accessModifier?: CqlAccessModifier;
  fluent?: boolean;
  identifier: string;
  operands: CqlOperandDefinition[];
  returnType?: string;
  functionBody?: any;
  isExternal?: boolean;
}

export interface CqlOperandDefinition {
  referentialIdentifier: string;
  typeSpecifier: string;
}

export type CqlStatement = CqlExpressionDefinition | CqlContextDefinition | CqlFunctionDefinition;

/*
 * ELM
 */

export interface ElmFile {
  library: ElmLibrary;
}

export interface ElmLibrary {
  annotation: ElmAnnotation[];
  identifier: ElmIdentifier;
  schemaIdentifier: ElmIdentifier;
  usings: ElmUsings;
  includes: ElmIncludes;
  parameters: ElmParameters;
  contexts: ElmContexts;
  statements: ElmStatements;
}

export interface ElmAnnotation {
  translatorOptions: string;
  type: string;
}

export interface ElmIdentifier {
  id: string;
  version: string;
}

export interface ElmUsings {
  def: ElmUsingDef[];
}

export interface ElmUsingDef {
  localIdentifier: string;
  uri: string;
  version?: string;
}

export interface ElmIncludes {
  def: ElmIncludeDef[];
}

export interface ElmIncludeDef {
  localIdentifier: string;
  path: string;
  version?: string;
}

export interface ElmParameters {
  def: ElmParameterDef[];
}

export interface ElmParameterDef {
  name: string;
  accessLevel: string;
  parameterTypeSpecifier: ElmTypeSpecifier;
}

export interface ElmTypeSpecifier {
  name: string;
  type: string;
}

export interface ElmContexts {
  def: ElmContextDef[];
}

export interface ElmContextDef {
  name: string;
}

export interface ElmStatements {
  def: ElmStatementDef[];
}

export interface ElmStatementDef {
  name: string;
  context: string;
  accessLevel?: string;
  type?: string;
  operand?: ElmOperand[];
  expression: ElmExpression;
}

export interface ElmOperand {
  name: string;
  operandTypeSpecifier: ElmTypeSpecifier;
}

export interface ElmSingletonFrom {
  type: 'SingletonFrom';
  operand: ElmExpression;
}

// export interface ElmOperand {
//   dataType: string;
//   type: string;
// }

export interface ElmSubstring {
  type: 'Substring';
  stringToSub: ElmExpression;
  startIndex?: ElmExpression;
  length?: ElmExpression;
}

export interface ElmCombine {
  type: 'Combine';
  source: ElmExpression;
  separator: ElmExpression;
}

export interface ElmQuery {
  type: 'Query';
  source: ElmQuerySource[];
  relationship: [];
  where?: ElmExpression;
  return?: ElmQueryReturn;
}

export interface ElmQuerySource {
  alias: string;
  expression: ElmExpression;
}

export interface ElmQueryReturn {
  expression: ElmExpression;
}

export interface ElmProperty {
  type: 'Property';
  path: string;
  scope?: string;
  source?: ElmExpression;
}

export interface ElmOperandRef {
  type: 'OperandRef';
  name: string;
}

export interface ElmToday {
  type: 'Today';
}

export interface ElmExpressionRef {
  type: 'ExpressionRef';
  name: string;
}

export interface ElmRetrieve {
  type: 'Retrieve';
  dataType: string;
}

export interface ElmFunctionRef {
  type: 'FunctionRef';
  libraryName?: string;
  name: string;
  operand: ElmExpression[];
}

export interface ElmIndexer {
  type: 'Indexer';
  operand: ElmExpression[];
}

export interface ElmLiteral {
  type: 'Literal';
  valueType: string;
  value: string;
}

export interface ElmCoalesce {
  type: 'Coalesce';
  operand: ElmExpression[];
}

export interface ElmConcatenate {
  type: 'Concatenate';
  operand: ElmExpression[];
}

export interface ElmParameterRef {
  type: 'ParameterRef';
  name: string;
}

export interface ElmEqual {
  type: 'Equal';
  operand: ElmExpression[];
}

export type ElmExpression =
  | ElmSingletonFrom
  | ElmSubstring
  | ElmCombine
  | ElmQuery
  | ElmProperty
  | ElmOperandRef
  | ElmToday
  | ElmExpressionRef
  | ElmRetrieve
  | ElmFunctionRef
  | ElmIndexer
  | ElmLiteral
  | ElmCoalesce
  | ElmConcatenate
  | ElmParameterRef
  | ElmEqual;
