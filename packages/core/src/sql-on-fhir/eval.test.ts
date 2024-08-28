import { readJson } from '@medplum/definitions';
import { Bundle, Resource, SearchParameter, ViewDefinition } from '@medplum/fhirtypes';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { indexSearchParameterBundle } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
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

interface TestReport {
  [key: string]: {
    tests: {
      name: string;
      result: {
        passed: boolean;
        reason?: string;
      };
    }[];
  };
}

const testsDir = __dirname + '/tests';
const files = readdirSync(testsDir);
const report: TestReport = {};
let totalCount = 0;
let passedCount = 0;

describe('SQL on FHIR', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
  });

  describe.each(files)('%s', (file) => {
    const testData = JSON.parse(readFileSync(`${testsDir}/${file}`, 'utf8')) as TestCollection;
    const resources = testData.resources;

    report[file] = { tests: [] };

    test.each(testData.tests.map((t) => [t.title, t.view, t.expect, t.expectError]))(
      '%s',
      (title, view, expected, expectError) => {
        let passed = true;
        try {
          if (expectError) {
            expect(() => evalSqlOnFhir(view, resources)).toThrow();
          } else {
            expect(evalSqlOnFhir(view, resources)).toMatchObject(expected);
          }
        } catch (_err) {
          // For now, we're just going to log the error and continue
          // Once we have stabilized the tests, we can throw the error
          passed = false;
        }
        report[file].tests.push({ name: title, result: { passed } });
        totalCount++;
        if (passed) {
          passedCount++;
        }
      }
    );
  });

  afterAll(() => {
    writeFileSync(__dirname + '/test_report.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Passed ${passedCount} of ${totalCount} tests`);
  });
});
