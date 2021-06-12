import { HumanName } from './fhir';

export interface HumanNameFormatOptions {
  all?: boolean;
  prefix?: boolean;
  suffix?: boolean;
  use?: boolean;
}

export function formatHumanName(name: HumanName, options?: HumanNameFormatOptions): string {
  const builder = [];

  if (name.prefix && (options?.all || options?.prefix)) {
    builder.push(...name.prefix);
  }

  if (name.given) {
    builder.push(...name.given);
  }

  if (name.family) {
    builder.push(name.family);
  }

  if (name.suffix && (options?.all || options?.suffix)) {
    builder.push(...name.suffix);
  }

  if (name.use && (options?.all || options?.use)) {
    builder.push('[' + name.use + ']');
  }

  return builder.join(' ').trim();
}

export function formatGivenName(name: HumanName): string {
  const builder: string[] = [];
  if (name.given) {
    builder.push(...name.given);
  }
  return builder.join(' ').trim();
}

export function formatFamilyName(name: HumanName): string {
  return name.family || '';
}
