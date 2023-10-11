import { Token, Tokenizer } from '../fhirlexer/tokenize';

export const FHIRPATH_KEYWORDS = ['true', 'false'];
export const FHIRPATH_OPERATORS = ['!=', '!~', '<=', '>=', '{}', '->'];

export function tokenize(str: string): Token[] {
  return new Tokenizer(str, FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS).tokenize();
}
