import { Token, Tokenizer } from '../fhirlexer';
import { FHIRPATH_KEYWORDS, FHIRPATH_OPERATORS } from '../fhirpath';

const MAPPING_LANGUAGE_KEYWORDS = [
  ...FHIRPATH_KEYWORDS,
  'map',
  'uses',
  'alias',
  'imports',
  'group',
  'extends',
  'default',
  'where',
  'check',
  'log',
  'then',
  'types',
  'type',
  'first',
  'not_first',
  'last',
  'not_last',
  'only_one',
  'share',
  'collate',
  'source',
  'target',
  'queried',
  'produced',
  'conceptMap',
  'prefix',
];
const MAPPING_LANGUAGE_OPERATORS = [...FHIRPATH_OPERATORS, '->'];

export function tokenize(str: string): Token[] {
  return new Tokenizer(str, MAPPING_LANGUAGE_KEYWORDS, MAPPING_LANGUAGE_OPERATORS).tokenize();
}
