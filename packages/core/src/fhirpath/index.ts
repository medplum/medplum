import { Atom, parse } from './parse';

export function parseFhirPath(input: string): Atom {
  return parse(input);
}
