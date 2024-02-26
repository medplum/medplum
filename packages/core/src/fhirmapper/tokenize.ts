import { Token, Tokenizer } from '../fhirlexer/tokenize';
import { FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS } from '../fhirpath/tokenize';

const MAPPING_LANGUAGE_OPERATORS = [...FHIRPATH_OPERATORS, '->', '<<', '>>', '=='];

export function tokenize(str: string): Token[] {
  return new Tokenizer(str, FHIRPATH_KEYWORDS, MAPPING_LANGUAGE_OPERATORS).tokenize();
}
