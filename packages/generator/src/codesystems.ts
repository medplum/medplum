import { Bundle, CodeSystem } from '@medplum/fhirtypes';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const bcp13: CodeSystem = {
  resourceType: 'CodeSystem',
  status: 'active',
  url: 'urn:ietf:bcp:13',
  content: 'complete',
};

export function main(): void {
  const sourceData = readFileSync(resolve(__dirname, 'bcp13.xml'), 'utf8');
  const source = new XMLParser().parse(sourceData, false);
  const registry = source.registry.registry;

  const mimeTypes = new Set<string>();
  for (const category of registry) {
    for (const record of category.record ?? []) {
      if (record.file) {
        mimeTypes.add(record.file);
      } else {
        mimeTypes.add(`${category.title}/${record.name}`);
      }
    }
  }

  const codings = [];
  for (const code of mimeTypes.values()) {
    codings.push({ code });
  }
  const codeSystem = { ...bcp13, concept: codings };

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [{ resource: codeSystem }],
  };
  writeFileSync(
    resolve(__dirname, '../../definitions/dist/fhir/r4/valuesets-generated.json'),
    JSON.stringify(bundle, null, 2),
    'utf8'
  );
}

if (require.main === module) {
  main();
}
