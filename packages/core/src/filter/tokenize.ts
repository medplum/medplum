import { Token, Tokenizer } from '../fhirlexer';
import { FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS } from '../fhirpath';

const MAPPING_LANGUAGE_OPERATORS = [...FHIRPATH_OPERATORS, 'eq', 'ne', 'co'];

export function tokenize(str: string): Token[] {
  return new Tokenizer(str, FHIRPATH_KEYWORDS, MAPPING_LANGUAGE_OPERATORS, {
    dateTimeLiterals: true,
    symbolRegex: /[^\s\])]/,
  }).tokenize();
}
