import { Token, Tokenizer } from '../fhirlexer';

export const FHIRPATH_KEYWORDS = ['true', 'false', 'and', 'as', 'contains', 'div', 'in', 'is', 'mod', 'or', 'xor'];
export const FHIRPATH_OPERATORS = ['!=', '!~', '<=', '>=', '{}', '->'];

export function tokenize(str: string): Token[] {
  return new Tokenizer(str, FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS).tokenize();
}
