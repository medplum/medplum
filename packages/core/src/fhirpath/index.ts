import { Atom, parse } from './parse';

export function parseFhirPath(input: string): Atom {
  // try {
  //   return parse(input);
  // } catch (error) {
  //   console.log(`Parse error "${error}" on "${input}`);
  //   throw error;
  // }
  return parse(input);
}
