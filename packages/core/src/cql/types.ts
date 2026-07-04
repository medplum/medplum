// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// =============================================================================
// CQL
// =============================================================================

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

// =============================================================================
// ELM — Library structure
// =============================================================================

export interface ElmFile {
  library: ElmLibrary;
}

export interface ElmLibrary {
  annotation: ElmAnnotation[];
  identifier: ElmIdentifier;
  schemaIdentifier: ElmIdentifier;
  usings: ElmUsings;
  includes?: ElmIncludes;
  parameters?: ElmParameters;
  codeSystems?: ElmCodeSystems;
  valueSets?: ElmValueSets;
  codes?: ElmCodes;
  concepts?: ElmConcepts;
  contexts?: ElmContexts;
  statements: ElmStatements;
}

export interface ElmCqlToElmInfoAnnotation {
  type: 'CqlToElmInfo';
  translatorOptions: string;
}

export interface ElmCqlToElmErrorAnnotation {
  type: 'CqlToElmError';
  libraryId?: string;
  libraryVersion?: string;
  startLine?: number;
  startChar?: number;
  endLine?: number;
  endChar?: number;
  message?: string;
  errorType?: string;
  errorSeverity?: string;
}

export type ElmAnnotation = ElmCqlToElmInfoAnnotation | ElmCqlToElmErrorAnnotation;

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

export interface ElmCodeSystems {
  def: ElmCodeSystemDef[];
}

export interface ElmCodeSystemDef {
  name: string;
  id: string;
  version?: string;
  accessLevel?: string;
}

export interface ElmValueSets {
  def: ElmValueSetDef[];
}

export interface ElmValueSetDef {
  name: string;
  id: string;
  version?: string;
  accessLevel?: string;
}

export interface ElmCodes {
  def: ElmCodeDef[];
}

export interface ElmCodeDef {
  name: string;
  id: string;
  display?: string;
  accessLevel?: string;
  codeSystem: { name: string; version?: string };
}

export interface ElmConcepts {
  def: ElmConceptDef[];
}

export interface ElmConceptDef {
  name: string;
  display: string;
  accessLevel?: string;
  code: [{ name: string; version?: string }];
}

export interface ElmTypeSpecifier {
  type: string;
  name?: string;
  elementType?: ElmTypeSpecifier;
  pointType?: ElmTypeSpecifier;
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

// =============================================================================
// ELM — Expression shapes
//
// Structural building blocks. The generic type parameter T constrains `type`
// so that narrowing (`if (expr.type === 'Not')`) still works on the union.
// =============================================================================

/** Nullary ops: no operands, no additional fields. */
export interface ElmNullaryOp<T extends string> {
  type: T;
}

/** Single `operand: ElmExpression` — no other unique fields. */
export interface ElmUnaryOp<T extends string> {
  type: T;
  operand: ElmExpression;
}

/** Array `operand: ElmExpression[]` — no other unique fields. */
export interface ElmNaryOp<T extends string> {
  type: T;
  operand: ElmExpression[];
}

/** Single `name` field used for all *Ref node types. */
export interface ElmNameRef<T extends string> {
  type: T;
  name: string;
}

/** Single `source: ElmExpression` field (Last, Max, Distinct, Flatten use this in actual translator output). */
export interface ElmSourceOp<T extends string> {
  type: T;
  source: ElmExpression;
}

// =============================================================================
// ELM — Collapsed union members
// =============================================================================

export type ElmNullaryExpression = ElmNullaryOp<'Null' | 'Today' | 'Now'>;

/** Unary ops: single `operand`, no additional fields. */
export type ElmUnaryExpression = ElmUnaryOp<
  | 'Not'
  | 'IsNull'
  | 'Exists'
  | 'Flatten'
  | 'Distinct'
  | 'End'
  | 'SingletonFrom'
  | 'ExpandValueSet'
  | 'ToDateTime'
  | 'ToList'
>;

/** N-ary ops: `operand` array, no additional fields. */
export type ElmNaryExpression = ElmNaryOp<
  | 'Equal'
  | 'And'
  | 'Or'
  | 'Add'
  | 'Union'
  | 'Coalesce'
  | 'Concatenate'
  | 'In'
  | 'Overlaps'
  | 'Subtract'
  | 'After'
  | 'Equivalent'
  | 'Except'
  | 'EndsWith'
>;

/** Ref nodes: just a `name`, optionally a `libraryName` is handled by ElmFunctionRef separately. */
export type ElmRefExpression = ElmNameRef<
  | 'ExpressionRef'
  | 'OperandRef'
  | 'AliasRef'
  | 'QueryLetRef'
  | 'CodeRef'
  | 'ConceptRef'
  | 'ParameterRef'
  | 'IdentifierRef'
  | 'ValueSetRef'
>;

/** Source ops: single `source` field rather than `operand`. */
export type ElmSourceExpression = ElmSourceOp<'First' | 'Last' | 'Min' | 'Max'>;

// =============================================================================
// ELM — Individual expression interfaces (unique fields)
// =============================================================================

export interface ElmLiteral {
  type: 'Literal';
  valueType: string;
  value: string;
}

export interface ElmProperty {
  type: 'Property';
  path: string;
  scope?: string;
  source?: ElmExpression;
}

export interface ElmRetrieve {
  type: 'Retrieve';
  dataType: string;
  codeProperty?: string;
  codeComparator?: string;
  codes?: ElmExpression;
}

/** FunctionRef gets its own interface because of the optional `libraryName`. */
export interface ElmFunctionRef {
  type: 'FunctionRef';
  libraryName?: string;
  name: string;
  operand: ElmExpression[];
}

export interface ElmIndexer {
  type: 'Indexer';
  operand: [ElmExpression, ElmExpression];
}

export interface ElmAs {
  type: 'As';
  operand: ElmExpression;
  asType?: string;
  asTypeSpecifier?: ElmTypeSpecifier;
  strict?: boolean;
}

export interface ElmIf {
  type: 'If';
  condition: ElmExpression;
  then: ElmExpression;
  else: ElmExpression;
}

export interface ElmInterval {
  type: 'Interval';
  lowClosed: boolean;
  highClosed: boolean;
  low: ElmExpression;
  high: ElmExpression;
}

export interface ElmList {
  type: 'List';
  element: ElmExpression[];
}

export interface ElmInstance {
  type: 'Instance';
  classType: string;
  // element: ElmExpression[];
  element: ElmTupleElement[];
}

export interface ElmTuple {
  type: 'Tuple';
  element: ElmTupleElement[];
}

export interface ElmTupleElement {
  name: string;
  value: ElmExpression;
}

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
  let?: ElmQueryLet[];
  relationship?: [];
  sort?: ElmQuerySort;
  where?: ElmExpression;
  return?: ElmQueryReturn;
}

export interface ElmQuerySource {
  alias: string;
  expression: ElmExpression;
}

export interface ElmQueryLet {
  identifier: string;
  expression: ElmExpression;
}

export interface ElmQuerySort {
  by: ElmQuerySortBy[];
}

export interface ElmQuerySortBy {
  type: 'ByExpression';
  direction: 'asc' | 'desc';
  expression: ElmExpression;
}

export interface ElmQueryReturn {
  distinct?: boolean;
  expression: ElmExpression;
}

// =============================================================================
// ELM — Top-level expression union
// =============================================================================

export type ElmExpression =
  | ElmNullaryExpression
  | ElmUnaryExpression
  | ElmNaryExpression
  | ElmRefExpression
  | ElmSourceExpression
  | ElmLiteral
  | ElmProperty
  | ElmRetrieve
  | ElmFunctionRef
  | ElmIndexer
  | ElmAs
  | ElmIf
  | ElmInterval
  | ElmList
  | ElmInstance
  | ElmTuple
  | ElmSubstring
  | ElmCombine
  | ElmQuery;
