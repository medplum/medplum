import { Resource, ViewDefinition } from '@medplum/fhirtypes';
import { readFileSync, readdirSync } from 'fs';
import { evalSqlOnFhir } from './eval';

interface TestCollection {
  readonly title: string;
  readonly description: string;
  readonly resources: Resource[];
  readonly tests: TestDefinition[];
}

interface TestDefinition {
  readonly title: string;
  readonly view: ViewDefinition;
  readonly expect: Record<string, any>[];
  readonly expectError?: boolean;
}

const testsDir = __dirname + '/tests';
const files = readdirSync(testsDir);

describe.each(files)('SQL on FHIR', (file) => {
  const testData = JSON.parse(readFileSync(`${testsDir}/${file}`, 'utf8')) as TestCollection;
  const resources = testData.resources;

  test.each(testData.tests.map((t) => [t.title, t.view, t.expect, t.expectError]))(
    '%s',
    (_title, view, expected, expectError) => {
      if (expectError) {
        expect(() => evalSqlOnFhir(view, resources)).toThrow();
      } else {
        expect(evalSqlOnFhir(view, resources)).toMatchObject(expected);
      }
    }
  );
});
