import { indexStructureDefinitionBundle, validateResource } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { AuditEvent, Bundle, Patient, StructureDefinition } from '@medplum/fhirtypes';
import { Bench } from 'tinybench';

const resourcesData = readJson('fhir/r4/profiles-resources.json') as Bundle<StructureDefinition>;
const typesData = readJson('fhir/r4/profiles-types.json') as Bundle<StructureDefinition>;
const medplumResourcesData = readJson('fhir/r4/profiles-medplum.json') as Bundle<StructureDefinition>;

type BenchmarkFn = (b: Bench) => Promise<void>;
interface Benchmark {
  fn: BenchmarkFn;
  title?: string;
}

async function runBenchmarks(...benchmarks: Benchmark[]): Promise<void> {
  indexStructureDefinitionBundle(typesData);
  indexStructureDefinitionBundle(resourcesData);
  indexStructureDefinitionBundle(medplumResourcesData);

  for (const bench of benchmarks) {
    const b = new Bench({
      iterations: 100,
    });
    b.addEventListener('error', (err: Error) => {
      throw err;
    });
    await bench.fn(b);
    printBenchmarkResults(b, bench.title);
  }
}

if (require.main === module) {
  runBenchmarks(
    { title: 'Patient resource validation', fn: validatePatient },
    { title: 'StructureDefinition Bundle validation', fn: validateBundle },
    { title: 'AuditEvent validation', fn: validateAuditEvent }
  ).catch((err: Error) => {
    throw err;
  });
}

function printBenchmarkResults(b: Bench, title?: string): void {
  const table = b.results.map((result, i) => ({
    Benchmark: b.tasks[i].name,
    'ops/second': Math.floor(result?.hz ?? 0),
    'avg latency': formatDuration(result?.mean),
    'margin of error': `±${result?.rme.toPrecision(3)}%`,
    'p75 latency': formatDuration(result?.p75),
    'p99 latency': formatDuration(result?.p99),
  }));
  if (title) {
    console.log(`=== ${title} ===`);
  }
  console.table(table);
}

const PREFIXES = ['ms', 'µs', 'ns'];
function formatDuration(ms: number | undefined): string {
  if (!ms) {
    return '-';
  }
  let i = 0,
    time = ms;
  while (time < 1 && PREFIXES[i + 1]) {
    time *= 1000;
    i++;
  }
  return `${time.toPrecision(3)} ${PREFIXES[i]}`;
}

async function validatePatient(b: Bench): Promise<void> {
  const patient: Patient = {
    resourceType: 'Patient',
    id: 'example',
    text: {
      status: 'generated',
      div: '<div xmlns="http://www.w3.org/1999/xhtml"><p style="border: 1px #661aff solid; background-color: #e6e6ff; padding: 10px;"><b>Jim </b> male, DoB: 1974-12-25 ( Medical record number: 12345\u00a0(use:\u00a0USUAL,\u00a0period:\u00a02001-05-06 --&gt; (ongoing)))</p><hr/><table class="grid"><tr><td style="background-color: #f3f5da" title="Record is active">Active:</td><td>true</td><td style="background-color: #f3f5da" title="Known status of Patient">Deceased:</td><td colspan="3">false</td></tr><tr><td style="background-color: #f3f5da" title="Alternate names (see the one above)">Alt Names:</td><td colspan="3"><ul><li>Peter James Chalmers (OFFICIAL)</li><li>Peter James Windsor (MAIDEN)</li></ul></td></tr><tr><td style="background-color: #f3f5da" title="Ways to contact the Patient">Contact Details:</td><td colspan="3"><ul><li>-unknown-(HOME)</li><li>ph: (03) 5555 6473(WORK)</li><li>ph: (03) 3410 5613(MOBILE)</li><li>ph: (03) 5555 8834(OLD)</li><li>534 Erewhon St PeasantVille, Rainbow, Vic  3999(HOME)</li></ul></td></tr><tr><td style="background-color: #f3f5da" title="Nominated Contact: Next-of-Kin">Next-of-Kin:</td><td colspan="3"><ul><li>Bénédicte du Marché  (female)</li><li>534 Erewhon St PleasantVille Vic 3999 (HOME)</li><li><a href="tel:+33(237)998327">+33 (237) 998327</a></li><li>Valid Period: 2012 --&gt; (ongoing)</li></ul></td></tr><tr><td style="background-color: #f3f5da" title="Patient Links">Links:</td><td colspan="3"><ul><li>Managing Organization: <a href="organization-example-gastro.html">Organization/1</a> &quot;Gastroenterology&quot;</li></ul></td></tr></table></div>',
    },
    identifier: [
      {
        use: 'usual',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'MR',
            },
          ],
        },
        system: 'urn:oid:1.2.36.146.595.217.0.1',
        value: '12345',
        period: {
          start: '2001-05-06',
        },
        assigner: {
          display: 'Acme Healthcare',
        },
      },
    ],
    active: true,
    name: [
      {
        use: 'official',
        family: 'Chalmers',
        given: ['Peter', 'James'],
      },
      {
        use: 'usual',
        given: ['Jim'],
      },
      {
        use: 'maiden',
        family: 'Windsor',
        given: ['Peter', 'James'],
        period: {
          end: '2002',
        },
      },
    ],
    telecom: [
      {
        use: 'home',
      },
      {
        system: 'phone',
        value: '(03) 5555 6473',
        use: 'work',
        rank: 1,
      },
      {
        system: 'phone',
        value: '(03) 3410 5613',
        use: 'mobile',
        rank: 2,
      },
      {
        system: 'phone',
        value: '(03) 5555 8834',
        use: 'old',
        period: {
          end: '2014',
        },
      },
    ],
    gender: 'male',
    birthDate: '1974-12-25',
    _birthDate: {
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/patient-birthTime',
          valueDateTime: '1974-12-25T14:35:45-05:00',
        },
      ],
    },
    deceasedBoolean: false,
    address: [
      {
        use: 'home',
        type: 'both',
        text: '534 Erewhon St PeasantVille, Rainbow, Vic  3999',
        line: ['534 Erewhon St'],
        city: 'PleasantVille',
        district: 'Rainbow',
        state: 'Vic',
        postalCode: '3999',
        period: {
          start: '1974-12-25',
        },
      },
    ],
    contact: [
      {
        relationship: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'N',
              },
            ],
          },
        ],
        name: {
          family: 'du Marché',
          _family: {
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/humanname-own-prefix',
                valueString: 'VV',
              },
            ],
          },
          given: ['Bénédicte'],
        },
        telecom: [
          {
            system: 'phone',
            value: '+33 (237) 998327',
          },
        ],
        address: {
          use: 'home',
          type: 'both',
          line: ['534 Erewhon St'],
          city: 'PleasantVille',
          district: 'Rainbow',
          state: 'Vic',
          postalCode: '3999',
          period: {
            start: '1974-12-25',
          },
        },
        gender: 'female',
        period: {
          start: '2012',
        },
      },
    ],
    managingOrganization: {
      reference: 'Organization/1',
    },
  } as unknown as Patient;
  b.add('New validator', () => {
    validateResource(patient);
  });
  await b.run();
}

async function validateBundle(b: Bench): Promise<void> {
  b.add('New validator', () => {
    validateResource(resourcesData);
  });
  await b.run();
}

async function validateAuditEvent(b: Bench): Promise<void> {
  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    meta: {
      project: '3b84b30b-0798-4f70-9139-5164d3da3071',
      versionId: '530a0c3f-a2a6-4411-aa3c-f78f03ed1283',
      lastUpdated: '2023-07-05T22:17:14.907Z',
      author: { reference: 'system' },
      compartment: [
        { reference: 'Project/3b84b30b-0798-4f70-9139-5164d3da3071' },
        { reference: 'Patient/2a38b3ad-7ceb-43ff-b240-c29ac9804671', display: 'Alice Smith' },
      ],
    },
    period: { start: '2023-07-05T22:17:14.895Z', end: '2023-07-05T22:17:14.903Z' },
    recorded: '2023-07-05T22:17:14.903Z',
    type: { code: 'transmit' },
    agent: [{ type: { text: 'Subscription' }, requestor: false }],
    source: { observer: { reference: 'Subscription/72d0713a-408d-42a6-a04d-6771b87f0d24' } },
    entity: [
      {
        what: { reference: 'Patient/2a38b3ad-7ceb-43ff-b240-c29ac9804671', display: 'Alice Smith' },
        role: { code: '4', display: 'Domain' },
      },
      {
        what: { reference: 'Subscription/72d0713a-408d-42a6-a04d-6771b87f0d24' },
        role: { code: '9', display: 'Subscriber' },
      },
      {
        what: { reference: 'Bot/d95a3153-e942-4fe9-92af-399c674372b6', display: 'Test Bot' },
        role: { code: '9', display: 'Subscriber' },
      },
    ],
    outcome: '0',
    outcomeDesc: '2022-05-30T16:12:22.685Z\t146fcfcf-c32b-43f5-82a6-ee0f3132d873\tINFO test',
    id: 'afb77bbf-60d1-4703-a038-75f969837a7d',
  };
  b.add('New validator', () => {
    validateResource(auditEvent);
  });
  await b.run();
}
