// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readJson } from '@medplum/definitions';
import { Bundle } from '@medplum/fhirtypes';
import { LOINC, SNOMED, UCUM } from '../constants';
import { PropertyType, TypedValue } from '../types';
import { indexStructureDefinitionBundle } from '../typeschema/types';
import { evalFhirPath, evalFhirPathTyped } from './parse';
import { toTypedValue } from './utils';

const observation = {
  resourceType: 'Observation',
  id: 'example',
  text: {
    status: 'generated',
    div: "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p><b>Generated Narrative with Details</b></p><p><b>id</b>: example</p><p><b>status</b>: final</p><p><b>category</b>: Vital Signs <span>(Details : {http://terminology.hl7.org/CodeSystem/observation-category code 'vital-signs' = 'Vital Signs', given as 'Vital Signs'})</span></p><p><b>code</b>: Body Weight <span>(Details : {LOINC code '29463-7' = 'Body weight', given as 'Body Weight'}; {LOINC code '3141-9' = 'Body weight Measured', given as 'Body weight Measured'}; {SNOMED CT code '27113001' = 'Body weight', given as 'Body weight'}; {http://acme.org/devices/clinical-codes code 'body-weight' = 'body-weight', given as 'Body Weight'})</span></p><p><b>subject</b>: <a>Patient/example</a></p><p><b>encounter</b>: <a>Encounter/example</a></p><p><b>effective</b>: 28/03/2016</p><p><b>value</b>: 185 lbs<span> (Details: UCUM code [lb_av] = 'lb_av')</span></p></div>",
  },
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ],
  code: {
    coding: [
      {
        system: LOINC,
        code: '29463-7',
        display: 'Body Weight',
      },
      {
        system: LOINC,
        code: '3141-9',
        display: 'Body weight Measured',
      },
      {
        system: SNOMED,
        code: '27113001',
        display: 'Body weight',
      },
      {
        system: 'http://acme.org/devices/clinical-codes',
        code: 'body-weight',
        display: 'Body Weight',
      },
    ],
  },
  subject: {
    reference: 'Patient/example',
  },
  encounter: {
    reference: 'Encounter/example',
  },
  effectiveDateTime: '2016-03-28',
  valueQuantity: {
    value: 185,
    unit: 'lbs',
    system: UCUM,
    code: '[lb_av]',
  },
};

const patient = {
  resourceType: 'Patient',
  id: 'example',
  text: {
    status: 'generated',
    div: '<div xmlns="http://www.w3.org/1999/xhtml"><table><tbody><tr><td>Name</td><td>Peter James \n              <b>Chalmers</b> ("Jim")\n            </td></tr><tr><td>Address</td><td>534 Erewhon, Pleasantville, Vic, 3999</td></tr><tr><td>Contacts</td><td>Home: unknown. Work: (03) 5555 6473</td></tr><tr><td>Id</td><td>MRN: 12345 (Acme Healthcare)</td></tr></tbody></table></div>',
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
  _birthDate: {
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/patient-birthTime',
        valueDateTime: '1974-12-25T14:35:45-05:00',
      },
    ],
  },
  birthDate: '1974-12-25',
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
        _family: {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/humanname-own-prefix',
              valueString: 'VV',
            },
          ],
        },
        family: 'du Marché',
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
};

const questionnaire = {
  resourceType: 'Questionnaire',
  id: '3141',
  text: {
    status: 'generated',
    div: '<div xmlns="http://www.w3.org/1999/xhtml"><pre>\n            1.Comorbidity?\n              1.1 Cardial Comorbidity\n                1.1.1 Angina?\n                1.1.2 MI?\n              1.2 Vascular Comorbidity?\n              ...\n            Histopathology\n              Abdominal\n                pT category?\n              ...\n          </pre></div>',
  },
  url: 'http://hl7.org/fhir/Questionnaire/3141',
  title: 'Cancer Quality Forum Questionnaire 2012',
  status: 'draft',
  subjectType: ['Patient'],
  date: '2012-01',
  item: [
    {
      linkId: '1',
      code: [
        {
          system: 'http://example.org/system/code/sections',
          code: 'COMORBIDITY',
        },
      ],
      type: 'group',
      item: [
        {
          linkId: '1.1',
          code: [
            {
              system: 'http://example.org/system/code/questions',
              code: 'COMORB',
            },
          ],
          prefix: '1',
          type: 'choice',
          answerValueSet: 'http://hl7.org/fhir/ValueSet/yesnodontknow',
          item: [
            {
              linkId: '1.1.1',
              code: [
                {
                  system: 'http://example.org/system/code/sections',
                  code: 'CARDIAL',
                },
              ],
              type: 'group',
              enableWhen: [
                {
                  question: '1.1',
                  operator: '=',
                  answerCoding: {
                    system: 'http://terminology.hl7.org/CodeSystem/v2-0136',
                    code: 'Y',
                  },
                },
              ],
              item: [
                {
                  linkId: '1.1.1.1',
                  code: [
                    {
                      system: 'http://example.org/system/code/questions',
                      code: 'COMORBCAR',
                    },
                  ],
                  prefix: '1.1',
                  type: 'choice',
                  answerValueSet: 'http://hl7.org/fhir/ValueSet/yesnodontknow',
                  item: [
                    {
                      linkId: '1.1.1.1.1',
                      code: [
                        {
                          system: 'http://example.org/system/code/questions',
                          code: 'COMCAR00',
                          display: 'Angina Pectoris',
                        },
                        {
                          system: SNOMED,
                          code: '194828000',
                          display: 'Angina (disorder)',
                        },
                      ],
                      prefix: '1.1.1',
                      type: 'choice',
                      answerValueSet: 'http://hl7.org/fhir/ValueSet/yesnodontknow',
                    },
                    {
                      linkId: '1.1.1.1.2',
                      code: [
                        {
                          system: SNOMED,
                          code: '22298006',
                          display: 'Myocardial infarction (disorder)',
                        },
                      ],
                      prefix: '1.1.2',
                      type: 'choice',
                      answerValueSet: 'http://hl7.org/fhir/ValueSet/yesnodontknow',
                    },
                  ],
                },
                {
                  linkId: '1.1.1.2',
                  code: [
                    {
                      system: 'http://example.org/system/code/questions',
                      code: 'COMORBVAS',
                    },
                  ],
                  prefix: '1.2',
                  type: 'choice',
                  answerValueSet: 'http://hl7.org/fhir/ValueSet/yesnodontknow',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      linkId: '2',
      code: [
        {
          system: 'http://example.org/system/code/sections',
          code: 'HISTOPATHOLOGY',
        },
      ],
      type: 'group',
      item: [
        {
          linkId: '2.1',
          code: [
            {
              system: 'http://example.org/system/code/sections',
              code: 'ABDOMINAL',
            },
          ],
          type: 'group',
          item: [
            {
              linkId: '2.1.2',
              code: [
                {
                  system: 'http://example.org/system/code/questions',
                  code: 'STADPT',
                  display: 'pT category',
                },
              ],
              type: 'choice',
            },
          ],
        },
      ],
    },
  ],
};

const valueset = {
  resourceType: 'ValueSet',
  id: 'example-expansion',
  meta: {
    profile: ['http://hl7.org/fhir/StructureDefinition/shareablevalueset'],
  },
  text: {
    status: 'generated',
    div: '<div xmlns="http://www.w3.org/1999/xhtml"><table class="grid"><tr><td>http://loinc.org</td><td>14647-2</td><td>Cholesterol [Moles/volume] in Serum or Plasma</td></tr><tr><td colspan="3"><b>Additional Cholesterol codes</b></td></tr><tr><td>http://loinc.org</td><td>2093-3</td><td>Cholesterol [Mass/volume] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>48620-9</td><td>Cholesterol [Mass/volume] in Serum or Plasma ultracentrifugate</td></tr><tr><td>http://loinc.org</td><td>9342-7</td><td>Cholesterol [Percentile]</td></tr><tr><td colspan="3"><b>Cholesterol Ratios</b></td></tr><tr><td>http://loinc.org</td><td>2096-6</td><td>Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>35200-5</td><td>Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>48089-7</td><td>Cholesterol/Apolipoprotein B [Molar ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>55838-7</td><td>Cholesterol/Phospholipid [Molar ratio] in Serum or Plasma</td></tr></table></div>',
  },
  url: 'http://hl7.org/fhir/ValueSet/example-expansion',
  version: '20150622',
  name: 'LOINC Codes for Cholesterol in Serum/Plasma',
  status: 'draft',
  experimental: true,
  date: '2015-06-22',
  publisher: 'FHIR Project team',
  contact: [
    {
      telecom: [
        {
          system: 'url',
          value: 'http://hl7.org/fhir',
        },
      ],
    },
  ],
  description:
    'This is an example value set that includes all the LOINC codes for serum/plasma cholesterol from v2.36.',
  copyright:
    'This content from LOINC® is copyright © 1995 Regenstrief Institute, Inc. and the LOINC Committee, and available at no cost under the license at http://loinc.org/terms-of-use.',
  compose: {
    include: [
      {
        system: LOINC,
        filter: [
          {
            property: 'parent',
            op: '=',
            value: 'LP43571-6',
          },
        ],
      },
    ],
  },
  expansion: {
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/valueset-expansionSource',
        valueUri: 'http://hl7.org/fhir/ValueSet/example-extensional',
      },
    ],
    identifier: 'urn:uuid:42316ff8-2714-4680-9980-f37a6d1a71bc',
    timestamp: '2015-06-22T13:56:07Z',
    total: 8,
    offset: 0,
    parameter: [
      {
        name: 'version',
        valueString: '2.50',
      },
    ],
    contains: [
      {
        system: LOINC,
        version: '2.50',
        code: '14647-2',
        display: 'Cholesterol [Moles/volume] in Serum or Plasma',
      },
      {
        abstract: true,
        display: 'Cholesterol codes',
        contains: [
          {
            system: LOINC,
            version: '2.50',
            code: '2093-3',
            display: 'Cholesterol [Mass/volume] in Serum or Plasma',
          },
          {
            system: LOINC,
            version: '2.50',
            code: '48620-9',
            display: 'Cholesterol [Mass/volume] in Serum or Plasma ultracentrifugate',
          },
          {
            system: LOINC,
            version: '2.50',
            code: '9342-7',
            display: 'Cholesterol [Percentile]',
          },
        ],
      },
      {
        abstract: true,
        display: 'Cholesterol Ratios',
        contains: [
          {
            system: LOINC,
            version: '2.50',
            code: '2096-6',
            display: 'Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma',
          },
          {
            system: LOINC,
            version: '2.50',
            code: '35200-5',
            display: 'Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma',
          },
          {
            system: LOINC,
            version: '2.50',
            code: '48089-7',
            display: 'Cholesterol/Apolipoprotein B [Molar ratio] in Serum or Plasma',
          },
          {
            system: LOINC,
            version: '2.50',
            code: '55838-7',
            display: 'Cholesterol/Phospholipid [Molar ratio] in Serum or Plasma',
          },
        ],
      },
    ],
  },
};

const diagnosticReport = {
  resourceType: 'DiagnosticReport',
  id: 'example',
  status: 'preliminary',
  code: {
    coding: [
      {
        system: 'https://example.com',
        code: 'example_report',
        display: 'Example Report',
      },
    ],
  },
  result: [
    {
      reference: 'Observation/obs1',
      display: 'TESTOSTERONE',
      resource: {
        resourceType: 'Observation',
        id: 'obs1',
        code: {
          coding: [
            {
              system: 'https://example.com',
              code: 'TESTOSTERONE',
            },
          ],
          text: 'TESTOSTERONE',
        },
        valueQuantity: {
          value: 216,
          unit: 'ng/dL',
        },
      },
    },
    {
      reference: 'Observation/obs2',
      display: 'EGFR',
      resource: {
        resourceType: 'Observation',
        id: 'obs2',
        code: {
          coding: [
            {
              system: 'https://example.com',
              code: 'EGFR',
            },
          ],
          text: 'EGFR',
        },
        valueQuantity: {
          value: 1,
          unit: 'ng/dL',
        },
      },
    },
  ],
};

describe('FHIRPath Test Suite', () => {
  beforeAll(() => {
    console.log = jest.fn();
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  describe('Miscellaneous accessor tests', () => {
    test('Extract birthDate', () => {
      expect(evalFhirPath('birthDate', patient)).toStrictEqual(['1974-12-25']);
    });

    test('patient telecom types', () => {
      expect(evalFhirPath('telecom.use', patient)).toStrictEqual(['home', 'work', 'mobile', 'old']);
    });
  });

  describe('Tests ported from the Java Unit Tests', () => {
    test('testSimple', () => {
      expect(evalFhirPath('name.given', patient)).toStrictEqual(['Peter', 'James', 'Jim', 'Peter', 'James']);
    });

    test('testSimpleNone', () => {
      expect(() => evalFhirPath('name.suffix', patient)).not.toThrow();
    });

    test('testEscapedIdentifier', () => {
      expect(evalFhirPath('name.`given`', patient)).toStrictEqual(['Peter', 'James', 'Jim', 'Peter', 'James']);
    });

    test('testSimpleBackTick1', () => {
      expect(evalFhirPath('`Patient`.name.`given`', patient)).toStrictEqual([
        'Peter',
        'James',
        'Jim',
        'Peter',
        'James',
      ]);
    });

    test('testSimpleFail', () => {
      // Undefined behavior - copying FHIRPath.js
      expect(evalFhirPath('name.given1', patient)).toStrictEqual([]);
    });

    test('testSimpleWithContext', () => {
      expect(evalFhirPath('Patient.name.given', patient)).toStrictEqual(['Peter', 'James', 'Jim', 'Peter', 'James']);
    });

    test('testSimpleWithWrongContext', () => {
      // Undefined behavior - copying FHIRPath.js
      expect(evalFhirPath('Encounter.name.given', patient)).toStrictEqual([]);
    });
  });

  describe('testObservations', () => {
    test('testPolymorphismA', () => {
      expect(evalFhirPath('Observation.value.unit', observation)).toStrictEqual(['lbs']);
    });

    test.skip('testPolymorphismB', () => {
      expect(() => evalFhirPath('Observation.valueQuantity.unit', observation)).toThrow();
    });

    test('testPolymorphismIsA', () => {
      expect(evalFhirPath('Observation.value.is(Quantity)', observation)).toStrictEqual([true]);
    });

    test('testPolymorphismIsA', () => {
      expect(evalFhirPath('Observation.value is Quantity', observation)).toStrictEqual([true]);
    });

    test('testPolymorphismIsB', () => {
      expect(evalFhirPath('Observation.value.is(Period).not()', observation)).toStrictEqual([true]);
    });

    test('testPolymorphismAsA', () => {
      expect(evalFhirPath('Observation.value.as(Quantity).unit', observation)).toStrictEqual(['lbs']);
    });

    test('testPolymorphismAsAFunction', () => {
      expect(evalFhirPath('(Observation.value as Quantity).unit', observation)).toStrictEqual(['lbs']);
    });

    test.skip('testPolymorphismAsB', () => {
      expect(() => evalFhirPath('(Observation.value as Period).unit', observation)).toThrow();
    });

    test('testPolymorphismAsBFunction', () => {
      expect(() => evalFhirPath('Observation.value.as(Period).start', observation)).not.toThrow();
    });
  });

  describe('testDollar', () => {
    test('testDollarThis1', () => {
      expect(() =>
        evalFhirPath("Patient.name.given.where(substring($this.length()-3) = 'out')", patient)
      ).not.toThrow();
    });

    test('testDollarThis2', () => {
      expect(evalFhirPath("Patient.name.given.where(substring($this.length()-3) = 'ter')", patient)).toStrictEqual([
        'Peter',
        'Peter',
      ]);
    });

    test('testDollarOrderAllowed', () => {
      expect(evalFhirPath('Patient.name.skip(1).given', patient)).toStrictEqual(['Jim', 'Peter', 'James']);
    });

    test('testDollarOrderAllowedA', () => {
      expect(() => evalFhirPath('Patient.name.skip(3).given', patient)).not.toThrow();
    });

    test.skip('testDollarOrderNotAllowed', () => {
      expect(() => evalFhirPath('Patient.children().skip(1)', patient)).toThrow();
    });
  });

  describe('testLiterals', () => {
    test('testLiteralTrue', () => {
      expect(evalFhirPath('Patient.name.exists() = true', patient)).toStrictEqual([true]);
    });

    test('testLiteralFalse', () => {
      expect(evalFhirPath('Patient.name.empty() = false', patient)).toStrictEqual([true]);
    });

    test('testLiteralString', () => {
      expect(evalFhirPath("Patient.name.given.first() = 'Peter'", patient)).toStrictEqual([true]);
    });

    test('testLiteralInteger1', () => {
      expect(evalFhirPath('1.convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test('testLiteralInteger0', () => {
      expect(evalFhirPath('0.convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerNegative1', () => {
      expect(evalFhirPath('(-1).convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test.skip('testLiteralIntegerNegative1Invalid', () => {
      expect(() => evalFhirPath('-1.convertsToInteger()', patient)).toThrow();
    });

    test('testLiteralIntegerMax', () => {
      expect(evalFhirPath('2147483647.convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test('testLiteralString', () => {
      expect(evalFhirPath("'test'.convertsToString()", patient)).toStrictEqual([true]);
    });

    test('testLiteralStringEscapes', () => {
      expect(evalFhirPath("'\\\\\\/\\f\\r\\n\\t\\\"\\`\\'\\u002a'.convertsToString()", patient)).toStrictEqual([true]);
    });

    test('testLiteralBooleanTrue', () => {
      expect(evalFhirPath('true.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testLiteralBooleanFalse', () => {
      expect(evalFhirPath('false.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimal10', () => {
      expect(evalFhirPath('1.0.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimal01', () => {
      expect(evalFhirPath('0.1.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimal00', () => {
      expect(evalFhirPath('0.0.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimalNegative01', () => {
      expect(evalFhirPath('(-0.1).convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test.skip('testLiteralDecimalNegative01Invalid', () => {
      expect(() => evalFhirPath('-0.1.convertsToDecimal()', patient)).toThrow();
    });

    test('testLiteralDecimalMax', () => {
      expect(evalFhirPath('1234567890987654321.0.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimalStep', () => {
      expect(evalFhirPath('0.00000001.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateYear', () => {
      expect(evalFhirPath('@2015.is(Date)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateMonth', () => {
      expect(evalFhirPath('@2015-02.is(Date)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateDay', () => {
      expect(evalFhirPath('@2015-02-04.is(Date)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeYear', () => {
      expect(evalFhirPath('@2015T.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeMonth', () => {
      expect(evalFhirPath('@2015-02T.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeDay', () => {
      expect(evalFhirPath('@2015-02-04T.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeHour', () => {
      expect(evalFhirPath('@2015-02-04T14.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeMinute', () => {
      expect(evalFhirPath('@2015-02-04T14:34.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeSecond', () => {
      expect(evalFhirPath('@2015-02-04T14:34:28.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeMillisecond', () => {
      expect(evalFhirPath('@2015-02-04T14:34:28.123.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeUTC', () => {
      expect(evalFhirPath('@2015-02-04T14:34:28Z.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeTimezoneOffset', () => {
      expect(evalFhirPath('@2015-02-04T14:34:28+10:00.is(DateTime)', patient)).toStrictEqual([true]);
    });

    test('testLiteralTimeHour', () => {
      expect(evalFhirPath('@T14.is(Time)', patient)).toStrictEqual([true]);
    });

    test('testLiteralTimeMinute', () => {
      expect(evalFhirPath('@T14:34.is(Time)', patient)).toStrictEqual([true]);
    });

    test('testLiteralTimeSecond', () => {
      expect(evalFhirPath('@T14:34:28.is(Time)', patient)).toStrictEqual([true]);
    });

    test('testLiteralTimeMillisecond', () => {
      expect(evalFhirPath('@T14:34:28.123.is(Time)', patient)).toStrictEqual([true]);
    });

    test.skip('testLiteralTimeUTC', () => {
      expect(() => evalFhirPath('@T14:34:28Z.is(Time)', patient)).toThrow();
    });

    test.skip('testLiteralTimeTimezoneOffset', () => {
      expect(() => evalFhirPath('@T14:34:28+10:00.is(Time)', patient)).toThrow();
    });

    test('testLiteralQuantityDecimal', () => {
      expect(evalFhirPath("10.1 'mg'.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test('testLiteralQuantityInteger', () => {
      expect(evalFhirPath("10 'mg'.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test('testLiteralQuantityDay', () => {
      expect(evalFhirPath('4 days.convertsToQuantity()', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerNotEqual', () => {
      expect(evalFhirPath('-3 != 3', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerEqual', () => {
      expect(evalFhirPath('Patient.name.given.count() = 5', patient)).toStrictEqual([true]);
    });

    test('testPolarityPrecedence', () => {
      expect(evalFhirPath('-Patient.name.given.count() = -5', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerGreaterThan', () => {
      expect(evalFhirPath('Patient.name.given.count() > -3', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerCountNotEqual', () => {
      expect(evalFhirPath('Patient.name.given.count() != 0', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerLessThanTrue', () => {
      expect(evalFhirPath('1 < 2', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerLessThanFalse', () => {
      expect(evalFhirPath('1 < -2', patient)).toStrictEqual([false]);
    });

    test('testLiteralIntegerLessThanPolarityTrue', () => {
      expect(evalFhirPath('+1 < +2', patient)).toStrictEqual([true]);
    });

    test('testLiteralIntegerLessThanPolarityFalse', () => {
      expect(evalFhirPath('-1 < 2', patient)).toStrictEqual([true]);
    });

    test('testLiteralDecimalGreaterThanNonZeroTrue', () => {
      expect(evalFhirPath('Observation.value.value > 180.0', observation)).toStrictEqual([true]);
    });

    test('testLiteralDecimalGreaterThanZeroTrue', () => {
      expect(evalFhirPath('Observation.value.value > 0.0', observation)).toStrictEqual([true]);
    });

    test('testLiteralDecimalGreaterThanIntegerTrue', () => {
      expect(evalFhirPath('Observation.value.value > 0', observation)).toStrictEqual([true]);
    });

    test('testLiteralDecimalLessThanInteger', () => {
      expect(evalFhirPath('Observation.value.value < 190', observation)).toStrictEqual([true]);
    });

    test.skip('testLiteralDecimalLessThanInvalid', () => {
      expect(() => evalFhirPath("Observation.value.value < 'test'", observation)).toThrow();
    });

    test('testDateEqual', () => {
      expect(evalFhirPath('Patient.birthDate = @1974-12-25', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqual', () => {
      expect(() => evalFhirPath('Patient.birthDate != @1974-12-25T12:34:00', patient)).not.toThrow();
    });

    test('testDateNotEqualTimezoneOffsetBefore', () => {
      expect(evalFhirPath('Patient.birthDate != @1974-12-25T12:34:00-10:00', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqualTimezoneOffsetAfter', () => {
      expect(evalFhirPath('Patient.birthDate != @1974-12-25T12:34:00+10:00', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqualUTC', () => {
      expect(evalFhirPath('Patient.birthDate != @1974-12-25T12:34:00Z', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqualTimeSecond', () => {
      expect(evalFhirPath('Patient.birthDate != @T12:14:15', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqualTimeMinute', () => {
      expect(evalFhirPath('Patient.birthDate != @T12:14', patient)).toStrictEqual([true]);
    });

    test('testDateNotEqualToday', () => {
      expect(evalFhirPath('Patient.birthDate < today()', patient)).toStrictEqual([true]);
    });

    test('testDateTimeGreaterThanDate', () => {
      expect(evalFhirPath('now() > Patient.birthDate', patient)).toStrictEqual([true]);
    });

    test('testLiteralDateTimeTZGreater', () => {
      expect(evalFhirPath('@2017-11-05T01:30:00.0-04:00 > @2017-11-05T01:15:00.0-05:00', patient)).toStrictEqual([
        false,
      ]);
    });

    test('testLiteralDateTimeTZLess', () => {
      expect(evalFhirPath('@2017-11-05T01:30:00.0-04:00 < @2017-11-05T01:15:00.0-05:00', patient)).toStrictEqual([
        true,
      ]);
    });

    test('testLiteralDateTimeTZEqualFalse', () => {
      expect(evalFhirPath('@2017-11-05T01:30:00.0-04:00 = @2017-11-05T01:15:00.0-05:00', patient)).toStrictEqual([
        false,
      ]);
    });

    test('testLiteralDateTimeTZEqualTrue', () => {
      expect(evalFhirPath('@2017-11-05T01:30:00.0-04:00 = @2017-11-05T00:30:00.0-05:00', patient)).toStrictEqual([
        true,
      ]);
    });

    test('testLiteralUnicode', () => {
      expect(evalFhirPath("Patient.name.given.first() = 'P\\u0065ter'", patient)).toStrictEqual([true]);
    });

    test('testCollectionNotEmpty', () => {
      expect(evalFhirPath('Patient.name.given.empty().not()', patient)).toStrictEqual([true]);
    });

    test('testCollectionNotEqualEmpty', () => {
      expect(() => evalFhirPath('Patient.name.given != {}', patient)).not.toThrow();
    });

    test('testExpressions', () => {
      expect(evalFhirPath('Patient.name.select(given | family).distinct()', patient)).toStrictEqual([
        'Peter',
        'James',
        'Chalmers',
        'Jim',
        'Windsor',
      ]);
    });

    test('testExpressionsEqual', () => {
      expect(evalFhirPath('Patient.name.given.count() = 1 + 4', patient)).toStrictEqual([true]);
    });

    test('testNotEmpty', () => {
      expect(evalFhirPath('Patient.name.empty().not()', patient)).toStrictEqual([true]);
    });

    test('testEmpty', () => {
      expect(evalFhirPath('Patient.link.empty()', patient)).toStrictEqual([true]);
    });

    test('testLiteralNotTrue', () => {
      expect(evalFhirPath('true.not() = false', patient)).toStrictEqual([true]);
    });

    test('testLiteralNotFalse', () => {
      expect(evalFhirPath('false.not() = true', patient)).toStrictEqual([true]);
    });

    test('testIntegerBooleanNotTrue', () => {
      expect(evalFhirPath('(0).not() = true', patient)).toStrictEqual([true]);
    });

    test('testIntegerBooleanNotFalse', () => {
      expect(evalFhirPath('(1).not() = false', patient)).toStrictEqual([true]);
    });

    test.skip('testNotInvalid', () => {
      expect(() => evalFhirPath('(1|2).not() = false', patient)).toThrow();
    });
  });

  describe('testTypes', () => {
    test('testStringYearConvertsToDate', () => {
      expect(evalFhirPath("'2015'.convertsToDate()", patient)).toStrictEqual([true]);
    });

    test('testStringMonthConvertsToDate', () => {
      expect(evalFhirPath("'2015-02'.convertsToDate()", patient)).toStrictEqual([true]);
    });

    test('testStringDayConvertsToDate', () => {
      expect(evalFhirPath("'2015-02-04'.convertsToDate()", patient)).toStrictEqual([true]);
    });

    test('testStringYearConvertsToDateTime', () => {
      expect(evalFhirPath("'2015'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringMonthConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringDayConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringHourConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringMinuteConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14:34'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringSecondConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14:34:28'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringMillisecondConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14:34:28.123'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringUTCConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14:34:28Z'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringTZConvertsToDateTime', () => {
      expect(evalFhirPath("'2015-02-04T14:34:28+10:00'.convertsToDateTime()", patient)).toStrictEqual([true]);
    });

    test('testStringHourConvertsToTime', () => {
      expect(evalFhirPath("'14'.convertsToTime()", patient)).toStrictEqual([true]);
    });

    test('testStringMinuteConvertsToTime', () => {
      expect(evalFhirPath("'14:34'.convertsToTime()", patient)).toStrictEqual([true]);
    });

    test('testStringSecondConvertsToTime', () => {
      expect(evalFhirPath("'14:34:28'.convertsToTime()", patient)).toStrictEqual([true]);
    });

    test('testStringMillisecondConvertsToTime', () => {
      expect(evalFhirPath("'14:34:28.123'.convertsToTime()", patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralConvertsToInteger', () => {
      expect(evalFhirPath('1.convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralIsInteger', () => {
      expect(evalFhirPath('1.is(Integer)', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralIsSystemInteger', () => {
      expect(evalFhirPath('1.is(System.Integer)', patient)).toStrictEqual([true]);
    });

    test('testStringLiteralConvertsToInteger', () => {
      expect(evalFhirPath("'1'.convertsToInteger()", patient)).toStrictEqual([true]);
    });

    test('testStringLiteralConvertsToIntegerFalse', () => {
      expect(evalFhirPath("'a'.convertsToInteger().not()", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalConvertsToIntegerFalse', () => {
      expect(evalFhirPath("'1.0'.convertsToInteger().not()", patient)).toStrictEqual([true]);
    });

    test('testStringLiteralIsNotInteger', () => {
      expect(evalFhirPath("'1'.is(Integer).not()", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralConvertsToInteger', () => {
      expect(evalFhirPath('true.convertsToInteger()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralIsNotInteger', () => {
      expect(evalFhirPath('true.is(Integer).not()', patient)).toStrictEqual([true]);
    });

    test('testDateIsNotInteger', () => {
      expect(evalFhirPath('@2013-04-05.is(Integer).not()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToInteger', () => {
      expect(evalFhirPath('1.toInteger() = 1', patient)).toStrictEqual([true]);
    });

    test('testStringIntegerLiteralToInteger', () => {
      expect(evalFhirPath("'1'.toInteger() = 1", patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralToInteger', () => {
      expect(() => evalFhirPath("'1.1'.toInteger() = {}", patient)).not.toThrow();
    });

    test('testDecimalLiteralToIntegerIsEmpty', () => {
      expect(evalFhirPath("'1.1'.toInteger().empty()", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralToInteger', () => {
      expect(evalFhirPath('true.toInteger() = 1', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralConvertsToDecimal', () => {
      expect(evalFhirPath('1.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test.skip('testIntegerLiteralIsNotDecimal', () => {
      expect(evalFhirPath('1.is(Decimal).not()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralConvertsToDecimal', () => {
      expect(evalFhirPath('1.0.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralIsDecimal', () => {
      expect(evalFhirPath('1.0.is(Decimal)', patient)).toStrictEqual([true]);
    });

    test('testStringIntegerLiteralConvertsToDecimal', () => {
      expect(evalFhirPath("'1'.convertsToDecimal()", patient)).toStrictEqual([true]);
    });

    test('testStringIntegerLiteralIsNotDecimal', () => {
      expect(evalFhirPath("'1'.is(Decimal).not()", patient)).toStrictEqual([true]);
    });

    test('testStringLiteralConvertsToDecimalFalse', () => {
      expect(evalFhirPath("'1.a'.convertsToDecimal().not()", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalLiteralConvertsToDecimal', () => {
      expect(evalFhirPath("'1.0'.convertsToDecimal()", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalLiteralIsNotDecimal', () => {
      expect(evalFhirPath("'1.0'.is(Decimal).not()", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralConvertsToDecimal', () => {
      expect(evalFhirPath('true.convertsToDecimal()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralIsNotDecimal', () => {
      expect(evalFhirPath('true.is(Decimal).not()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToDecimal', () => {
      expect(evalFhirPath('1.toDecimal() = 1.0', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToDeciamlEquivalent', () => {
      expect(evalFhirPath('1.toDecimal() ~ 1.0', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralToDecimal', () => {
      expect(evalFhirPath('1.0.toDecimal() = 1.0', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralToDecimalEqual', () => {
      expect(evalFhirPath("'1.1'.toDecimal() = 1.1", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralToDecimal', () => {
      expect(evalFhirPath('true.toDecimal() = 1', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralConvertsToQuantity', () => {
      expect(evalFhirPath('1.convertsToQuantity()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralIsNotQuantity', () => {
      expect(evalFhirPath('1.is(Quantity).not()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralConvertsToQuantity', () => {
      expect(evalFhirPath('1.0.convertsToQuantity()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralIsNotQuantity', () => {
      expect(evalFhirPath('1.0.is(System.Quantity).not()', patient)).toStrictEqual([true]);
    });

    test('testStringIntegerLiteralConvertsToQuantity', () => {
      expect(evalFhirPath("'1'.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test('testStringIntegerLiteralIsNotQuantity', () => {
      expect(evalFhirPath("'1'.is(System.Quantity).not()", patient)).toStrictEqual([true]);
    });

    test('testStringQuantityLiteralConvertsToQuantity', () => {
      expect(evalFhirPath("'1 day'.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test('testStringQuantityWeekConvertsToQuantity', () => {
      expect(evalFhirPath("'1 \\'wk\\''.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test.skip('testStringQuantityWeekConvertsToQuantityFalse', () => {
      expect(evalFhirPath("'1 wk'.convertsToQuantity().not()", patient)).toStrictEqual([true]);
    });

    test.skip('testStringDecimalLiteralConvertsToQuantityFalse', () => {
      expect(evalFhirPath("'1.a'.convertsToQuantity().not()", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalLiteralConvertsToQuantity', () => {
      expect(evalFhirPath("'1.0'.convertsToQuantity()", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalLiteralIsNotSystemQuantity', () => {
      expect(evalFhirPath("'1.0'.is(System.Quantity).not()", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralConvertsToQuantity', () => {
      expect(evalFhirPath('true.convertsToQuantity()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralIsNotSystemQuantity', () => {
      expect(evalFhirPath('true.is(System.Quantity).not()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToQuantity', () => {
      expect(evalFhirPath("1.toQuantity() = 1 '1'", patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralToQuantity', () => {
      expect(evalFhirPath("1.0.toQuantity() = 1.0 '1'", patient)).toStrictEqual([true]);
    });

    test.skip('testStringIntegerLiteralToQuantity', () => {
      expect(evalFhirPath("'1'.toQuantity()", patient)).toStrictEqual(["1 '1'"]);
    });

    test('testStringQuantityLiteralToQuantity', () => {
      expect(evalFhirPath("'1 day'.toQuantity() = 1 day", patient)).toStrictEqual([true]);
    });

    test('testStringQuantityDayLiteralToQuantity', () => {
      expect(evalFhirPath("'1 day'.toQuantity() = 1 '{day}'", patient)).toStrictEqual([true]);
    });

    test('testStringQuantityWeekLiteralToQuantity', () => {
      expect(evalFhirPath("'1 \\'wk\\''.toQuantity() = 1 'wk'", patient)).toStrictEqual([true]);
    });

    test('testStringDecimalLiteralToQuantity', () => {
      expect(evalFhirPath("'1.0'.toQuantity() ~ 1 '1'", patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralConvertsToBoolean', () => {
      expect(evalFhirPath('1.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralConvertsToBooleanFalse', () => {
      expect(evalFhirPath('2.convertsToBoolean()', patient)).toStrictEqual([false]);
    });

    test('testNegativeIntegerLiteralConvertsToBooleanFalse', () => {
      expect(evalFhirPath('(-1).convertsToBoolean()', patient)).toStrictEqual([false]);
    });

    test('testIntegerLiteralFalseConvertsToBoolean', () => {
      expect(evalFhirPath('0.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralConvertsToBoolean', () => {
      expect(evalFhirPath('1.0.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testStringTrueLiteralConvertsToBoolean', () => {
      expect(evalFhirPath("'true'.convertsToBoolean()", patient)).toStrictEqual([true]);
    });

    test('testStringFalseLiteralConvertsToBoolean', () => {
      expect(evalFhirPath("'false'.convertsToBoolean()", patient)).toStrictEqual([true]);
    });

    test('testStringFalseLiteralAlsoConvertsToBoolean', () => {
      expect(evalFhirPath("'False'.convertsToBoolean()", patient)).toStrictEqual([true]);
    });

    test('testTrueLiteralConvertsToBoolean', () => {
      expect(evalFhirPath('true.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testFalseLiteralConvertsToBoolean', () => {
      expect(evalFhirPath('false.convertsToBoolean()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToBoolean', () => {
      expect(evalFhirPath('1.toBoolean()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToBooleanEmpty', () => {
      expect(() => evalFhirPath('2.toBoolean()', patient)).not.toThrow();
    });

    test('testIntegerLiteralToBooleanFalse', () => {
      expect(evalFhirPath('0.toBoolean()', patient)).toStrictEqual([false]);
    });

    test('testStringTrueToBoolean', () => {
      expect(evalFhirPath("'true'.toBoolean()", patient)).toStrictEqual([true]);
    });

    test('testStringFalseToBoolean', () => {
      expect(evalFhirPath("'false'.toBoolean()", patient)).toStrictEqual([false]);
    });

    test('testIntegerLiteralConvertsToString', () => {
      expect(evalFhirPath('1.convertsToString()', patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralIsNotString', () => {
      expect(evalFhirPath('1.is(String).not()', patient)).toStrictEqual([true]);
    });

    test('testNegativeIntegerLiteralConvertsToString', () => {
      expect(evalFhirPath('(-1).convertsToString()', patient)).toStrictEqual([true]);
    });

    test('testDecimalLiteralConvertsToString', () => {
      expect(evalFhirPath('1.0.convertsToString()', patient)).toStrictEqual([true]);
    });

    test('testStringLiteralConvertsToString', () => {
      expect(evalFhirPath("'true'.convertsToString()", patient)).toStrictEqual([true]);
    });

    test('testBooleanLiteralConvertsToString', () => {
      expect(evalFhirPath('true.convertsToString()', patient)).toStrictEqual([true]);
    });

    test('testQuantityLiteralConvertsToString', () => {
      expect(evalFhirPath("1 'wk'.convertsToString()", patient)).toStrictEqual([true]);
    });

    test('testIntegerLiteralToString', () => {
      expect(evalFhirPath('1.toString()', patient)).toStrictEqual(['1']);
    });

    test('testNegativeIntegerLiteralToString', () => {
      expect(evalFhirPath('(-1).toString()', patient)).toStrictEqual(['-1']);
    });

    test('testDecimalLiteralToString', () => {
      expect(evalFhirPath('1.0.toString()', patient)).toStrictEqual(['1']);
    });

    test('testStringLiteralToString', () => {
      expect(evalFhirPath("'true'.toString()", patient)).toStrictEqual(['true']);
    });

    test('testBooleanLiteralToString', () => {
      expect(evalFhirPath('true.toString()', patient)).toStrictEqual(['true']);
    });

    test('testQuantityLiteralWkToString', () => {
      expect(evalFhirPath("1 'wk'.toString()", patient)).toStrictEqual(["1 'wk'"]);
    });

    test('testQuantityLiteralWeekToString', () => {
      expect(evalFhirPath('1 week.toString()', patient)).toStrictEqual(["1 '{week}'"]);
    });
  });

  describe('testAll', () => {
    test('testAllTrue1', () => {
      expect(evalFhirPath('Patient.name.select(given.exists()).allTrue()', patient)).toStrictEqual([true]);
    });

    test('testAllTrue2', () => {
      expect(evalFhirPath('Patient.name.select(period.exists()).allTrue()', patient)).toStrictEqual([false]);
    });

    test('testAllTrue3', () => {
      expect(evalFhirPath('Patient.name.all(given.exists())', patient)).toStrictEqual([true]);
    });

    test('testAllTrue4', () => {
      expect(evalFhirPath('Patient.name.all(period.exists())', patient)).toStrictEqual([false]);
    });
  });

  describe('testSubSetOf', () => {
    test('testSubSetOf1', () => {
      expect(evalFhirPath('Patient.name.first().subsetOf($this.name)', patient)).toStrictEqual([true]);
    });

    test('testSubSetOf2', () => {
      expect(evalFhirPath('Patient.name.subsetOf($this.name.first()).not()', patient)).toStrictEqual([true]);
    });

    test('testSubSetOf3', () => {
      expect(evalFhirPath('{}.subsetOf(Patient.name)', patient)).toStrictEqual([true]);
    });

    test('testSubSetOf4', () => {
      expect(evalFhirPath('Patient.name.subsetOf({})', patient)).toStrictEqual([false]);
    });
  });

  describe('testSuperSetOf', () => {
    test('testSuperSetOf1', () => {
      expect(evalFhirPath('Patient.name.first().supersetOf($this.name).not()', patient)).toStrictEqual([true]);
    });

    test('testSuperSetOf2', () => {
      expect(evalFhirPath('Patient.name.supersetOf($this.name.first())', patient)).toStrictEqual([true]);
    });
    test('testSuperSetOf3', () => {
      expect(evalFhirPath('{}.supersetOf(Patient.name)', patient)).toStrictEqual([false]);
    });

    test('testSuperSetOf4', () => {
      expect(evalFhirPath('Patient.name.supersetOf({})', patient)).toStrictEqual([true]);
    });
  });

  describe.skip('testQuantity', () => {
    test('testQuantity1', () => {
      expect(evalFhirPath("4.0000 'g' = 4000.0 'mg'", patient)).toStrictEqual([true]);
    });

    test('testQuantity2', () => {
      expect(evalFhirPath("4 'g' ~ 4000 'mg'", patient)).toStrictEqual([true]);
    });

    test('testQuantity3', () => {
      expect(evalFhirPath("4 'g' != 4040 'mg'", patient)).toStrictEqual([true]);
    });

    test('testQuantity4', () => {
      expect(evalFhirPath("4 'g' ~ 4040 'mg'", patient)).toStrictEqual([true]);
    });

    test('testQuantity5', () => {
      expect(evalFhirPath('7 days = 1 week', patient)).toStrictEqual([true]);
    });

    test('testQuantity6', () => {
      expect(evalFhirPath("7 days = 1 'wk'", patient)).toStrictEqual([true]);
    });

    test('testQuantity7', () => {
      expect(evalFhirPath('6 days < 1 week', patient)).toStrictEqual([true]);
    });

    test('testQuantity8', () => {
      expect(evalFhirPath('8 days > 1 week', patient)).toStrictEqual([true]);
    });

    test('testQuantity9', () => {
      expect(evalFhirPath("2.0 'cm' * 2.0 'm' = 0.040 'm2'", patient)).toStrictEqual([true]);
    });

    test('testQuantity10', () => {
      expect(evalFhirPath("4.0 'g' / 2.0 'm' = 2 'g/m'", patient)).toStrictEqual([true]);
    });

    test('testQuantity11', () => {
      expect(evalFhirPath("1.0 'm' / 1.0 'm' = 1 '1'", patient)).toStrictEqual([true]);
    });
  });

  describe('testCollectionBoolean', () => {
    test('testCollectionBoolean1', () => {
      expect(() => evalFhirPath('iif(1 | 2 | 3, true, false)', patient)).toThrow();
    });

    test('testCollectionBoolean2', () => {
      expect(evalFhirPath('iif({}, true, false)', patient)).toStrictEqual([false]);
    });

    test('testCollectionBoolean3', () => {
      expect(evalFhirPath('iif(true, true, false)', patient)).toStrictEqual([true]);
    });

    test('testCollectionBoolean4', () => {
      expect(evalFhirPath('iif({} | true, true, false)', patient)).toStrictEqual([true]);
    });

    test('testCollectionBoolean5', () => {
      expect(evalFhirPath('iif(true, true, 1/0)', patient)).toStrictEqual([true]);
    });

    test('testCollectionBoolean6', () => {
      expect(evalFhirPath('iif(false, 1/0, true)', patient)).toStrictEqual([true]);
    });
  });

  describe('testDistinct', () => {
    test('testDistinct1', () => {
      expect(evalFhirPath('(1 | 2 | 3).isDistinct()', patient)).toStrictEqual([true]);
    });

    test('testDistinct2', () => {
      expect(evalFhirPath('Questionnaire.descendants().linkId.isDistinct()', questionnaire)).toStrictEqual([true]);
    });

    test.skip('testDistinct3', () => {
      expect(
        evalFhirPath('Questionnaire.descendants().linkId.select(substring(0,1)).isDistinct().not()', questionnaire)
      ).toStrictEqual([true]);
    });

    test('testDistinct4', () => {
      expect(evalFhirPath('(1 | 2 | 3).distinct()', patient)).toStrictEqual([1, 2, 3]);
    });

    test.skip('testDistinct5', () => {
      expect(evalFhirPath('Questionnaire.descendants().linkId.distinct().count()', questionnaire)).toStrictEqual([10]);
    });

    test.skip('testDistinct6', () => {
      expect(
        evalFhirPath('Questionnaire.descendants().linkId.select(substring(0,1)).distinct().count()', questionnaire)
      ).toStrictEqual([2]);
    });
  });

  describe('testCount', () => {
    test('testCount1', () => {
      expect(evalFhirPath('Patient.name.count()', patient)).toStrictEqual([3]);
    });

    test('testCount2', () => {
      expect(evalFhirPath('Patient.name.count() = 3', patient)).toStrictEqual([true]);
    });

    test('testCount3', () => {
      expect(evalFhirPath('Patient.name.first().count()', patient)).toStrictEqual([1]);
    });

    test('testCount4', () => {
      expect(evalFhirPath('Patient.name.first().count() = 1', patient)).toStrictEqual([true]);
    });
  });

  describe('testWhere', () => {
    test('testWhere1', () => {
      expect(evalFhirPath('Patient.name.count() = 3', patient)).toStrictEqual([true]);
    });

    test('testWhere2', () => {
      expect(evalFhirPath("Patient.name.where(given = 'Jim').count() = 1", patient)).toStrictEqual([true]);
    });

    test('testWhere3', () => {
      expect(evalFhirPath("Patient.name.where(given = 'X').count() = 0", patient)).toStrictEqual([true]);
    });

    test('testWhere4', () => {
      expect(evalFhirPath("Patient.name.where($this.given = 'Jim').count() = 1", patient)).toStrictEqual([true]);
    });
  });

  describe.skip('testSelect', () => {
    test('testSelect1', () => {
      expect(evalFhirPath('Patient.name.select(given).count() = 5', patient)).toStrictEqual([true]);
    });

    test('testSelect2', () => {
      expect(evalFhirPath('Patient.name.select(given | family).count() = 7', patient)).toStrictEqual([true]);
    });
  });

  describe('testResolve', () => {
    test('testResolve1', () => {
      expect(evalFhirPath('DiagnosticReport.result.resolve().id', diagnosticReport)).toStrictEqual(['obs1', 'obs2']);
    });
    test('testResolvePolymorphism', () => {
      expect(
        evalFhirPath('DiagnosticReport.result.resolve().value.as(Quantity).value', diagnosticReport)
      ).toStrictEqual([216, 1]);
    });
  });

  describe.skip('testRepeat', () => {
    test('testRepeat1', () => {
      expect(evalFhirPath('ValueSet.expansion.repeat(contains).count() = 10', valueset)).toStrictEqual([true]);
    });

    test('testRepeat2', () => {
      expect(evalFhirPath('Questionnaire.repeat(item).code.count() = 11', questionnaire)).toStrictEqual([true]);
    });

    test('testRepeat3', () => {
      expect(evalFhirPath('Questionnaire.descendants().code.count() = 23', questionnaire)).toStrictEqual([true]);
    });

    test('testRepeat4', () => {
      expect(evalFhirPath('Questionnaire.children().code.count() = 2', questionnaire)).toStrictEqual([true]);
    });
  });

  describe.skip('testAggregate', () => {
    test('testAggregate1', () => {
      expect(evalFhirPath('(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 0) = 45', patient)).toStrictEqual([true]);
    });

    test('testAggregate2', () => {
      expect(evalFhirPath('(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 2) = 47', patient)).toStrictEqual([true]);
    });

    test('testAggregate3', () => {
      expect(
        evalFhirPath(
          '(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this < $total, $this, $total))) = 1',
          patient
        )
      ).toStrictEqual([true]);
    });

    test('testAggregate4', () => {
      expect(
        evalFhirPath(
          '(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this > $total, $this, $total))) = 9',
          patient
        )
      ).toStrictEqual([true]);
    });
  });

  describe.skip('testIndexer', () => {
    test('testIndexer1', () => {
      expect(evalFhirPath("Patient.name[0].given = 'Peter' | 'James'", patient)).toStrictEqual([true]);
    });

    test('testIndexer2', () => {
      expect(evalFhirPath("Patient.name[1].given = 'Jim'", patient)).toStrictEqual([true]);
    });
  });

  describe('testSingle', () => {
    test('testSingle1', () => {
      expect(evalFhirPath('Patient.name.first().single().exists()', patient)).toStrictEqual([true]);
    });

    test('testSingle2', () => {
      expect(() => evalFhirPath('Patient.name.single().exists()', patient)).toThrow();
    });
  });

  describe('testFirstLast', () => {
    test('testFirstLast1', () => {
      expect(evalFhirPath("Patient.name.first().given = 'Peter' | 'James'", patient)).toStrictEqual([true]);
    });

    test('testFirstLast2', () => {
      expect(evalFhirPath("Patient.name.last().given = 'Peter' | 'James'", patient)).toStrictEqual([true]);
    });
  });

  describe('testTail', () => {
    test('testTail1', () => {
      expect(evalFhirPath('(0 | 1 | 2).tail() = 1 | 2', patient)).toStrictEqual([true]);
    });

    test('testTail2', () => {
      expect(evalFhirPath("Patient.name.tail().given = 'Jim' | 'Peter' | 'James'", patient)).toStrictEqual([true]);
    });
  });

  describe('testSkip', () => {
    test('testSkip1', () => {
      expect(evalFhirPath('(0 | 1 | 2).skip(1) = 1 | 2', patient)).toStrictEqual([true]);
    });

    test('testSkip2', () => {
      expect(evalFhirPath('(0 | 1 | 2).skip(2) = 2', patient)).toStrictEqual([true]);
    });

    test('testSkip3', () => {
      expect(
        evalFhirPath("Patient.name.skip(1).given.trace('test') = 'Jim' | 'Peter' | 'James'", patient)
      ).toStrictEqual([true]);
    });

    test('testSkip4', () => {
      expect(evalFhirPath('Patient.name.skip(3).given.exists() = false', patient)).toStrictEqual([true]);
    });
  });

  describe('testTake', () => {
    test('testTake1', () => {
      expect(evalFhirPath('(0 | 1 | 2).take(1) = 0', patient)).toStrictEqual([true]);
    });

    test('testTake2', () => {
      expect(evalFhirPath('(0 | 1 | 2).take(2) = 0 | 1', patient)).toStrictEqual([true]);
    });

    test('testTake3', () => {
      expect(evalFhirPath("Patient.name.take(1).given = 'Peter' | 'James'", patient)).toStrictEqual([true]);
    });

    test('testTake4', () => {
      expect(evalFhirPath("Patient.name.take(2).given = 'Peter' | 'James' | 'Jim'", patient)).toStrictEqual([true]);
    });

    test('testTake5', () => {
      expect(evalFhirPath('Patient.name.take(3).given.count() = 5', patient)).toStrictEqual([true]);
    });

    test('testTake6', () => {
      expect(evalFhirPath('Patient.name.take(4).given.count() = 5', patient)).toStrictEqual([true]);
    });

    test('testTake7', () => {
      expect(evalFhirPath('Patient.name.take(0).given.exists() = false', patient)).toStrictEqual([true]);
    });
  });

  describe.skip('testIif', () => {
    test('testIif1', () => {
      expect(evalFhirPath("iif(Patient.name.exists(), 'named', 'unnamed') = 'named'", patient)).toStrictEqual([true]);
    });

    test('testIif2', () => {
      expect(evalFhirPath("iif(Patient.name.empty(), 'unnamed', 'named') = 'named'", patient)).toStrictEqual([true]);
    });

    test('testIif3', () => {
      expect(evalFhirPath('iif(true, true, (1 | 2).toString())', patient)).toStrictEqual([true]);
    });

    test('testIif4', () => {
      expect(evalFhirPath('iif(false, (1 | 2).toString(), true)', patient)).toStrictEqual([true]);
    });
  });

  describe('testToInteger', () => {
    test('testToInteger1', () => {
      expect(evalFhirPath("'1'.toInteger() = 1", patient)).toStrictEqual([true]);
    });

    test('testToInteger2', () => {
      expect(evalFhirPath("'-1'.toInteger() = -1", patient)).toStrictEqual([true]);
    });

    test('testToInteger3', () => {
      expect(evalFhirPath("'0'.toInteger() = 0", patient)).toStrictEqual([true]);
    });

    test('testToInteger4', () => {
      expect(evalFhirPath("'0.0'.toInteger().empty()", patient)).toStrictEqual([true]);
    });

    test('testToInteger5', () => {
      expect(evalFhirPath("'st'.toInteger().empty()", patient)).toStrictEqual([true]);
    });
  });

  describe.skip('testToDecimal', () => {
    test('testToDecimal1', () => {
      expect(evalFhirPath("'1'.toDecimal() = 1", patient)).toStrictEqual([true]);
    });

    test('testToDecimal2', () => {
      expect(evalFhirPath("'-1'.toInteger() = -1", patient)).toStrictEqual([true]);
    });

    test('testToDecimal3', () => {
      expect(evalFhirPath("'0'.toDecimal() = 0", patient)).toStrictEqual([true]);
    });

    test('testToDecimal4', () => {
      expect(evalFhirPath("'0.0'.toDecimal() = 0.0", patient)).toStrictEqual([true]);
    });

    test('testToDecimal5', () => {
      expect(evalFhirPath("'st'.toDecimal().empty()", patient)).toStrictEqual([true]);
    });
  });

  describe('testToString', () => {
    test('testToString1', () => {
      expect(evalFhirPath("1.toString() = '1'", patient)).toStrictEqual([true]);
    });

    test('testToString2', () => {
      expect(evalFhirPath("'-1'.toInteger() = -1", patient)).toStrictEqual([true]);
    });

    test('testToString3', () => {
      expect(evalFhirPath("0.toString() = '0'", patient)).toStrictEqual([true]);
    });

    test.skip('testToString4', () => {
      expect(evalFhirPath("0.0.toString() = '0.0'", patient)).toStrictEqual([true]);
    });

    test('testToString5', () => {
      expect(evalFhirPath("@2014-12-14.toString() = '2014-12-14'", patient)).toStrictEqual([true]);
    });
  });

  describe('testCase', () => {
    test('testCase1', () => {
      expect(evalFhirPath("'t'.upper() = 'T'", patient)).toStrictEqual([true]);
    });

    test('testCase2', () => {
      expect(evalFhirPath("'t'.lower() = 't'", patient)).toStrictEqual([true]);
    });

    test('testCase3', () => {
      expect(evalFhirPath("'T'.upper() = 'T'", patient)).toStrictEqual([true]);
    });

    test('testCase4', () => {
      expect(evalFhirPath("'T'.lower() = 't'", patient)).toStrictEqual([true]);
    });
  });

  describe('testToChars', () => {
    test('testToChars1', () => {
      expect(evalFhirPath("'t2'.toChars() = 't' | '2'", patient)).toStrictEqual([true]);
    });
  });

  describe('testSubstring', () => {
    test('testSubstring1', () => {
      expect(evalFhirPath("'12345'.substring(2) = '345'", patient)).toStrictEqual([true]);
    });

    test('testSubstring2', () => {
      expect(evalFhirPath("'12345'.substring(2,1) = '3'", patient)).toStrictEqual([true]);
    });

    test('testSubstring3', () => {
      expect(evalFhirPath("'12345'.substring(2,5) = '345'", patient)).toStrictEqual([true]);
    });

    test('testSubstring4', () => {
      expect(evalFhirPath("'12345'.substring(25).empty()", patient)).toStrictEqual([true]);
    });

    test('testSubstring5', () => {
      expect(evalFhirPath("'12345'.substring(-1).empty()", patient)).toStrictEqual([true]);
    });
  });

  describe('testStartsWith', () => {
    test('testStartsWith1', () => {
      expect(evalFhirPath("'12345'.startsWith('2') = false", patient)).toStrictEqual([true]);
    });

    test('testStartsWith2', () => {
      expect(evalFhirPath("'12345'.startsWith('1') = true", patient)).toStrictEqual([true]);
    });

    test('testStartsWith3', () => {
      expect(evalFhirPath("'12345'.startsWith('12') = true", patient)).toStrictEqual([true]);
    });

    test('testStartsWith4', () => {
      expect(evalFhirPath("'12345'.startsWith('13') = false", patient)).toStrictEqual([true]);
    });

    test('testStartsWith5', () => {
      expect(evalFhirPath("'12345'.startsWith('12345') = true", patient)).toStrictEqual([true]);
    });

    test('testStartsWith6', () => {
      expect(evalFhirPath("'12345'.startsWith('123456') = false", patient)).toStrictEqual([true]);
    });

    test('testStartsWith7', () => {
      expect(evalFhirPath("'12345'.startsWith('') = true", patient)).toStrictEqual([true]);
    });
  });

  describe('testEndsWith', () => {
    test('testEndsWith1', () => {
      expect(evalFhirPath("'12345'.endsWith('2') = false", patient)).toStrictEqual([true]);
    });

    test('testEndsWith2', () => {
      expect(evalFhirPath("'12345'.endsWith('5') = true", patient)).toStrictEqual([true]);
    });

    test('testEndsWith3', () => {
      expect(evalFhirPath("'12345'.endsWith('45') = true", patient)).toStrictEqual([true]);
    });

    test('testEndsWith4', () => {
      expect(evalFhirPath("'12345'.endsWith('35') = false", patient)).toStrictEqual([true]);
    });

    test('testEndsWith5', () => {
      expect(evalFhirPath("'12345'.endsWith('12345') = true", patient)).toStrictEqual([true]);
    });

    test('testEndsWith6', () => {
      expect(evalFhirPath("'12345'.endsWith('012345') = false", patient)).toStrictEqual([true]);
    });

    test('testEndsWith7', () => {
      expect(evalFhirPath("'12345'.endsWith('') = true", patient)).toStrictEqual([true]);
    });
  });

  describe('testContainsString', () => {
    test('testContainsString1', () => {
      expect(evalFhirPath("'12345'.contains('6') = false", patient)).toStrictEqual([true]);
    });

    test('testContainsString2', () => {
      expect(evalFhirPath("'12345'.contains('5') = true", patient)).toStrictEqual([true]);
    });

    test('testContainsString3', () => {
      expect(evalFhirPath("'12345'.contains('45') = true", patient)).toStrictEqual([true]);
    });

    test('testContainsString4', () => {
      expect(evalFhirPath("'12345'.contains('35') = false", patient)).toStrictEqual([true]);
    });

    test('testContainsString5', () => {
      expect(evalFhirPath("'12345'.contains('12345') = true", patient)).toStrictEqual([true]);
    });

    test('testContainsString6', () => {
      expect(evalFhirPath("'12345'.contains('012345') = false", patient)).toStrictEqual([true]);
    });

    test('testContainsString7', () => {
      expect(evalFhirPath("'12345'.contains('') = true", patient)).toStrictEqual([true]);
    });
  });

  describe('testLength', () => {
    test('testLength1', () => {
      expect(evalFhirPath("'123456'.length() = 6", patient)).toStrictEqual([true]);
    });

    test('testLength2', () => {
      expect(evalFhirPath("'12345'.length() = 5", patient)).toStrictEqual([true]);
    });

    test('testLength3', () => {
      expect(evalFhirPath("'123'.length() = 3", patient)).toStrictEqual([true]);
    });

    test('testLength4', () => {
      expect(evalFhirPath("'1'.length() = 1", patient)).toStrictEqual([true]);
    });

    test('testLength5', () => {
      expect(evalFhirPath("''.length() = 0", patient)).toStrictEqual([true]);
    });
  });

  describe('testTrace', () => {
    test('testTrace1', () => {
      expect(evalFhirPath("name.given.trace('test').count() = 5", patient)).toStrictEqual([true]);
    });

    test('testTrace2', () => {
      expect(evalFhirPath("name.trace('test', given).count() = 3", patient)).toStrictEqual([true]);
    });
  });

  describe('testToday', () => {
    test('testToday1', () => {
      expect(evalFhirPath('Patient.birthDate < today()', patient)).toStrictEqual([true]);
    });

    test('testToday2', () => {
      expect(evalFhirPath('today().toString().length() = 10', patient)).toStrictEqual([true]);
    });
  });

  describe('testNow', () => {
    test('testNow1', () => {
      expect(evalFhirPath('Patient.birthDate < now()', patient)).toStrictEqual([true]);
    });

    test('testNow2', () => {
      expect(evalFhirPath('now().toString().length() > 10', patient)).toStrictEqual([true]);
    });
  });

  describe('testEquality', () => {
    test('testEquality1', () => {
      expect(evalFhirPath('1 = 1', patient)).toStrictEqual([true]);
    });

    test('testEquality2', () => {
      expect(() => evalFhirPath('{} = {}', patient)).not.toThrow();
    });

    test('testEquality3', () => {
      expect(() => evalFhirPath('true = {}', patient)).not.toThrow();
    });

    test('testEquality4', () => {
      expect(evalFhirPath('(1) = (1)', patient)).toStrictEqual([true]);
    });

    test('testEquality5', () => {
      expect(evalFhirPath('(1 | 2) = (1 | 2)', patient)).toStrictEqual([true]);
    });

    test('testEquality6', () => {
      expect(evalFhirPath('(1 | 2 | 3) = (1 | 2 | 3)', patient)).toStrictEqual([true]);
    });

    test('testEquality7', () => {
      expect(() => evalFhirPath('(1 | 1) = (1 | 2 | {})', patient)).not.toThrow();
    });

    test('testEquality8', () => {
      expect(evalFhirPath('1 = 2', patient)).toStrictEqual([false]);
    });

    test('testEquality9', () => {
      expect(evalFhirPath("'a' = 'a'", patient)).toStrictEqual([true]);
    });

    test('testEquality10', () => {
      expect(evalFhirPath("'a' = 'A'", patient)).toStrictEqual([false]);
    });

    test('testEquality11', () => {
      expect(evalFhirPath("'a' = 'b'", patient)).toStrictEqual([false]);
    });

    test('testEquality12', () => {
      expect(evalFhirPath('1.1 = 1.1', patient)).toStrictEqual([true]);
    });

    test('testEquality13', () => {
      expect(evalFhirPath('1.1 = 1.2', patient)).toStrictEqual([false]);
    });

    test('testEquality14', () => {
      expect(evalFhirPath('1.10 = 1.1', patient)).toStrictEqual([true]);
    });

    test('testEquality15', () => {
      expect(evalFhirPath('0 = 0', patient)).toStrictEqual([true]);
    });

    test('testEquality16', () => {
      expect(evalFhirPath('0.0 = 0', patient)).toStrictEqual([true]);
    });

    test('testEquality17', () => {
      expect(evalFhirPath('@2012-04-15 = @2012-04-15', patient)).toStrictEqual([true]);
    });

    test('testEquality18', () => {
      expect(evalFhirPath('@2012-04-15 = @2012-04-16', patient)).toStrictEqual([false]);
    });

    test('testEquality19', () => {
      expect(() => evalFhirPath('@2012-04-15 = @2012-04-15T10:00:00', patient)).not.toThrow();
    });

    test('testEquality20', () => {
      expect(evalFhirPath('@2012-04-15T15:00:00 = @2012-04-15T10:00:00', patient)).toStrictEqual([false]);
    });

    test.skip('testEquality21', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 = @2012-04-15T15:30:31.0', patient)).toStrictEqual([true]);
    });

    test('testEquality22', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 = @2012-04-15T15:30:31.1', patient)).toStrictEqual([false]);
    });

    test('testEquality23', () => {
      expect(() => evalFhirPath('@2012-04-15T15:00:00Z = @2012-04-15T10:00:00', patient)).not.toThrow();
    });

    test('testEquality24', () => {
      expect(evalFhirPath('@2012-04-15T15:00:00+02:00 = @2012-04-15T16:00:00+03:00', patient)).toStrictEqual([true]);
    });

    test('testEquality25', () => {
      expect(evalFhirPath('name = name', patient)).toStrictEqual([true]);
    });

    test('testEquality26', () => {
      expect(evalFhirPath('name.take(2) = name.take(2).first() | name.take(2).last()', patient)).toStrictEqual([true]);
    });

    test('testEquality27', () => {
      expect(evalFhirPath('name.take(2) = name.take(2).last() | name.take(2).first()', patient)).toStrictEqual([false]);
    });

    test('testEquality28', () => {
      expect(evalFhirPath("Observation.value = 185 '[lb_av]'", observation)).toStrictEqual([true]);
    });
  });

  describe('testNEquality', () => {
    test('testNEquality1', () => {
      expect(evalFhirPath('1 != 1', patient)).toStrictEqual([false]);
    });

    test('testNEquality2', () => {
      expect(() => evalFhirPath('{} != {}', patient)).not.toThrow();
    });

    test('testNEquality3', () => {
      expect(evalFhirPath('1 != 2', patient)).toStrictEqual([true]);
    });

    test('testNEquality4', () => {
      expect(evalFhirPath("'a' != 'a'", patient)).toStrictEqual([false]);
    });

    test('testNEquality5', () => {
      expect(evalFhirPath("'a' != 'b'", patient)).toStrictEqual([true]);
    });

    test('testNEquality6', () => {
      expect(evalFhirPath('1.1 != 1.1', patient)).toStrictEqual([false]);
    });

    test('testNEquality7', () => {
      expect(evalFhirPath('1.1 != 1.2', patient)).toStrictEqual([true]);
    });

    test('testNEquality8', () => {
      expect(evalFhirPath('1.10 != 1.1', patient)).toStrictEqual([false]);
    });

    test('testNEquality9', () => {
      expect(evalFhirPath('0 != 0', patient)).toStrictEqual([false]);
    });

    test('testNEquality10', () => {
      expect(evalFhirPath('0.0 != 0', patient)).toStrictEqual([false]);
    });

    test('testNEquality11', () => {
      expect(evalFhirPath('@2012-04-15 != @2012-04-15', patient)).toStrictEqual([false]);
    });

    test('testNEquality12', () => {
      expect(evalFhirPath('@2012-04-15 != @2012-04-16', patient)).toStrictEqual([true]);
    });

    test('testNEquality13', () => {
      expect(() => evalFhirPath('@2012-04-15 != @2012-04-15T10:00:00', patient)).not.toThrow();
    });

    test('testNEquality14', () => {
      expect(evalFhirPath('@2012-04-15T15:00:00 != @2012-04-15T10:00:00', patient)).toStrictEqual([true]);
    });

    test.skip('testNEquality15', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 != @2012-04-15T15:30:31.0', patient)).toStrictEqual([false]);
    });

    test('testNEquality16', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 != @2012-04-15T15:30:31.1', patient)).toStrictEqual([true]);
    });

    test('testNEquality17', () => {
      expect(() => evalFhirPath('@2012-04-15T15:00:00Z != @2012-04-15T10:00:00', patient)).not.toThrow();
    });

    test('testNEquality18', () => {
      expect(evalFhirPath('@2012-04-15T15:00:00+02:00 != @2012-04-15T16:00:00+03:00', patient)).toStrictEqual([false]);
    });

    test('testNEquality19', () => {
      expect(evalFhirPath('name != name', patient)).toStrictEqual([false]);
    });

    test.skip('testNEquality20', () => {
      expect(evalFhirPath('name.take(2) != name.take(2).first() | name.take(2).last()', patient)).toStrictEqual([
        false,
      ]);
    });

    test('testNEquality21', () => {
      expect(evalFhirPath('name.take(2) != name.take(2).last() | name.take(2).first()', patient)).toStrictEqual([true]);
    });

    test('testNEquality22', () => {
      expect(evalFhirPath('1.2 / 1.8 != 0.6666667', patient)).toStrictEqual([true]);
    });

    test('testNEquality23', () => {
      expect(evalFhirPath('1.2 / 1.8 != 0.67', patient)).toStrictEqual([true]);
    });

    test('testNEquality24', () => {
      expect(evalFhirPath("Observation.value != 185 'kg'", observation)).toStrictEqual([true]);
    });
  });

  describe('testEquivalent', () => {
    test('testEquivalent1', () => {
      expect(evalFhirPath('1 ~ 1', patient)).toStrictEqual([true]);
    });

    test('testEquivalent2', () => {
      expect(evalFhirPath('{} ~ {}', patient)).toStrictEqual([true]);
    });

    test('testEquivalent3', () => {
      expect(evalFhirPath('1 ~ {}', patient)).toStrictEqual([false]);
    });

    test('testEquivalent4', () => {
      expect(evalFhirPath('1 ~ 2', patient)).toStrictEqual([false]);
    });

    test('testEquivalent5', () => {
      expect(evalFhirPath("'a' ~ 'a'", patient)).toStrictEqual([true]);
    });

    test('testEquivalent6', () => {
      expect(evalFhirPath("'a' ~ 'A'", patient)).toStrictEqual([true]);
    });

    test('testEquivalent7', () => {
      expect(evalFhirPath("'a' ~ 'b'", patient)).toStrictEqual([false]);
    });

    test('testEquivalent8', () => {
      expect(evalFhirPath('1.1 ~ 1.1', patient)).toStrictEqual([true]);
    });

    test('testEquivalent9', () => {
      expect(evalFhirPath('1.1 ~ 1.2', patient)).toStrictEqual([false]);
    });

    test('testEquivalent10', () => {
      expect(evalFhirPath('1.10 ~ 1.1', patient)).toStrictEqual([true]);
    });

    test('testEquivalent11', () => {
      expect(evalFhirPath('1.2 / 1.8 ~ 0.67', patient)).toStrictEqual([true]);
    });

    test('testEquivalent12', () => {
      expect(evalFhirPath('0 ~ 0', patient)).toStrictEqual([true]);
    });

    test('testEquivalent13', () => {
      expect(evalFhirPath('0.0 ~ 0', patient)).toStrictEqual([true]);
    });

    test('testEquivalent14', () => {
      expect(evalFhirPath('@2012-04-15 ~ @2012-04-15', patient)).toStrictEqual([true]);
    });

    test('testEquivalent15', () => {
      expect(evalFhirPath('@2012-04-15 ~ @2012-04-16', patient)).toStrictEqual([false]);
    });

    test('testEquivalent16', () => {
      expect(evalFhirPath('@2012-04-15 ~ @2012-04-15T10:00:00', patient)).toStrictEqual([false]);
    });

    test.skip('testEquivalent17', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.0', patient)).toStrictEqual([true]);
    });

    test('testEquivalent18', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.1', patient)).toStrictEqual([false]);
    });

    test('testEquivalent19', () => {
      expect(evalFhirPath('name ~ name', patient)).toStrictEqual([true]);
    });

    test('testEquivalent20', () => {
      expect(
        evalFhirPath('name.take(2).given ~ name.take(2).first().given | name.take(2).last().given', patient)
      ).toStrictEqual([true]);
    });

    test('testEquivalent21', () => {
      expect(
        evalFhirPath('name.take(2).given ~ name.take(2).last().given | name.take(2).first().given', patient)
      ).toStrictEqual([true]);
    });

    test('testEquivalent22', () => {
      expect(evalFhirPath("Observation.value ~ 185 '[lb_av]'", observation)).toStrictEqual([true]);
    });
  });

  describe('testNotEquivalent', () => {
    test('testNotEquivalent1', () => {
      expect(evalFhirPath('1 !~ 1', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent2', () => {
      expect(evalFhirPath('{} !~ {}', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent3', () => {
      expect(evalFhirPath('{} !~ 1', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent4', () => {
      expect(evalFhirPath('1 !~ 2', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent5', () => {
      expect(evalFhirPath("'a' !~ 'a'", patient)).toStrictEqual([false]);
    });

    test.skip('testNotEquivalent6', () => {
      expect(evalFhirPath("'a' !~ 'A'", patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent7', () => {
      expect(evalFhirPath("'a' !~ 'b'", patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent8', () => {
      expect(evalFhirPath('1.1 !~ 1.1', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent9', () => {
      expect(evalFhirPath('1.1 !~ 1.2', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent10', () => {
      expect(evalFhirPath('1.10 !~ 1.1', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent11', () => {
      expect(evalFhirPath('0 !~ 0', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent12', () => {
      expect(evalFhirPath('0.0 !~ 0', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent13', () => {
      expect(evalFhirPath('1.2 / 1.8 !~ 0.6', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent14', () => {
      expect(evalFhirPath('@2012-04-15 !~ @2012-04-15', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent15', () => {
      expect(evalFhirPath('@2012-04-15 !~ @2012-04-16', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent16', () => {
      expect(evalFhirPath('@2012-04-15 !~ @2012-04-15T10:00:00', patient)).toStrictEqual([true]);
    });

    test.skip('testNotEquivalent17', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.0', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent18', () => {
      expect(evalFhirPath('@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.1', patient)).toStrictEqual([true]);
    });

    test('testNotEquivalent19', () => {
      // The official test suite suggests this should be true.
      // According to the spec, it should be false.
      expect(evalFhirPath('name !~ name', patient)).toStrictEqual([false]);
    });

    test('testNotEquivalent20', () => {
      expect(
        evalFhirPath('name.take(2).given !~ name.take(2).first().given | name.take(2).last().given', patient)
      ).toStrictEqual([false]);
    });

    test('testNotEquivalent21', () => {
      expect(
        evalFhirPath('name.take(2).given !~ name.take(2).last().given | name.take(2).first().given', patient)
      ).toStrictEqual([false]);
    });

    test('testNotEquivalent22', () => {
      expect(evalFhirPath("Observation.value !~ 185 'kg'", observation)).toStrictEqual([true]);
    });
  });

  describe('testLessThan', () => {
    test('testLessThan1', () => {
      expect(evalFhirPath('1 < 2', patient)).toStrictEqual([true]);
    });

    test('testLessThan2', () => {
      expect(evalFhirPath('1.0 < 1.2', patient)).toStrictEqual([true]);
    });

    test('testLessThan3', () => {
      expect(evalFhirPath("'a' < 'b'", patient)).toStrictEqual([true]);
    });

    test('testLessThan4', () => {
      expect(evalFhirPath("'A' < 'a'", patient)).toStrictEqual([true]);
    });

    test('testLessThan5', () => {
      expect(evalFhirPath('@2014-12-12 < @2014-12-13', patient)).toStrictEqual([true]);
    });

    test('testLessThan6', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 < @2014-12-13T12:00:01', patient)).toStrictEqual([true]);
    });

    test('testLessThan7', () => {
      expect(evalFhirPath('@T12:00:00 < @T14:00:00', patient)).toStrictEqual([true]);
    });

    test('testLessThan8', () => {
      expect(evalFhirPath('1 < 1', patient)).toStrictEqual([false]);
    });

    test('testLessThan9', () => {
      expect(evalFhirPath('1.0 < 1.0', patient)).toStrictEqual([false]);
    });

    test('testLessThan10', () => {
      expect(evalFhirPath("'a' < 'a'", patient)).toStrictEqual([false]);
    });

    test('testLessThan11', () => {
      expect(evalFhirPath("'A' < 'A'", patient)).toStrictEqual([false]);
    });

    test('testLessThan12', () => {
      expect(evalFhirPath('@2014-12-12 < @2014-12-12', patient)).toStrictEqual([false]);
    });

    test('testLessThan13', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 < @2014-12-13T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testLessThan14', () => {
      expect(evalFhirPath('@T12:00:00 < @T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testLessThan15', () => {
      expect(evalFhirPath('2 < 1', patient)).toStrictEqual([false]);
    });

    test('testLessThan16', () => {
      expect(evalFhirPath('1.1 < 1.0', patient)).toStrictEqual([false]);
    });

    test('testLessThan17', () => {
      expect(evalFhirPath("'b' < 'a'", patient)).toStrictEqual([false]);
    });

    test('testLessThan18', () => {
      expect(evalFhirPath("'B' < 'A'", patient)).toStrictEqual([false]);
    });

    test('testLessThan19', () => {
      expect(evalFhirPath('@2014-12-13 < @2014-12-12', patient)).toStrictEqual([false]);
    });

    test('testLessThan20', () => {
      expect(evalFhirPath('@2014-12-13T12:00:01 < @2014-12-13T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testLessThan21', () => {
      expect(evalFhirPath('@T12:00:01 < @T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testLessThan22', () => {
      expect(evalFhirPath("Observation.value < 200 '[lb_av]'", observation)).toStrictEqual([true]);
    });

    test('testLessThan23', () => {
      expect(() => evalFhirPath('@2018-03 < @2018-03-01', patient)).not.toThrow();
    });

    test('testLessThan24', () => {
      expect(() => evalFhirPath('@2018-03-01T10 < @2018-03-01T10:30', patient)).not.toThrow();
    });

    test('testLessThan25', () => {
      expect(() => evalFhirPath('@T10 < @T10:30', patient)).not.toThrow();
    });

    test('testLessThan26', () => {
      expect(evalFhirPath('@2018-03-01T10:30:00 < @2018-03-01T10:30:00.0', patient)).toStrictEqual([false]);
    });

    test('testLessThan27', () => {
      expect(evalFhirPath('@T10:30:00 < @T10:30:00.0', patient)).toStrictEqual([false]);
    });
  });

  describe('testLessOrEqual', () => {
    test('testLessOrEqual1', () => {
      expect(evalFhirPath('1 <= 2', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual2', () => {
      expect(evalFhirPath('1.0 <= 1.2', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual3', () => {
      expect(evalFhirPath("'a' <= 'b'", patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual4', () => {
      expect(evalFhirPath("'A' <= 'a'", patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual5', () => {
      expect(evalFhirPath('@2014-12-12 <= @2014-12-13', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual6', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 <= @2014-12-13T12:00:01', patient)).toStrictEqual([true]);
    });

    test.skip('testLessOrEqual7', () => {
      expect(evalFhirPath('@T12:00:00 <= @T14:00:00', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual8', () => {
      expect(evalFhirPath('1 <= 1', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual9', () => {
      expect(evalFhirPath('1.0 <= 1.0', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual10', () => {
      expect(evalFhirPath("'a' <= 'a'", patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual11', () => {
      expect(evalFhirPath("'A' <= 'A'", patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual12', () => {
      expect(evalFhirPath('@2014-12-12 <= @2014-12-12', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual13', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 <= @2014-12-13T12:00:00', patient)).toStrictEqual([true]);
    });

    test.skip('testLessOrEqual14', () => {
      expect(evalFhirPath('@T12:00:00 <= @T12:00:00', patient)).toStrictEqual([true]);
    });

    test('testLessOrEqual15', () => {
      expect(evalFhirPath('2 <= 1', patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual16', () => {
      expect(evalFhirPath('1.1 <= 1.0', patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual17', () => {
      expect(evalFhirPath("'b' <= 'a'", patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual18', () => {
      expect(evalFhirPath("'B' <= 'A'", patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual19', () => {
      expect(evalFhirPath('@2014-12-13 <= @2014-12-12', patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual20', () => {
      expect(evalFhirPath('@2014-12-13T12:00:01 <= @2014-12-13T12:00:00', patient)).toStrictEqual([false]);
    });

    test.skip('testLessOrEqual21', () => {
      expect(evalFhirPath('@T12:00:01 <= @T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testLessOrEqual22', () => {
      expect(evalFhirPath("Observation.value <= 200 '[lb_av]'", observation)).toStrictEqual([true]);
    });

    test('testLessOrEqual23', () => {
      expect(() => evalFhirPath('@2018-03 <= @2018-03-01', patient)).not.toThrow();
    });

    test.skip('testLessOrEqual24', () => {
      expect(() => evalFhirPath('@2018-03-01T10 <= @2018-03-01T10:30', patient)).not.toThrow();
    });

    test.skip('testLessOrEqual25', () => {
      expect(() => evalFhirPath('@T10 <= @T10:30', patient)).not.toThrow();
    });

    test('testLessOrEqual26', () => {
      expect(evalFhirPath('@2018-03-01T10:30:00  <= @2018-03-01T10:30:00.0', patient)).toStrictEqual([true]);
    });

    test.skip('testLessOrEqual27', () => {
      expect(evalFhirPath('@T10:30:00 <= @T10:30:00.0', patient)).toStrictEqual([true]);
    });
  });

  describe('testGreatorOrEqual', () => {
    test('testGreatorOrEqual1', () => {
      expect(evalFhirPath('1 >= 2', patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual2', () => {
      expect(evalFhirPath('1.0 >= 1.2', patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual3', () => {
      expect(evalFhirPath("'a' >= 'b'", patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual4', () => {
      expect(evalFhirPath("'A' >= 'a'", patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual5', () => {
      expect(evalFhirPath('@2014-12-12 >= @2014-12-13', patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual6', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 >= @2014-12-13T12:00:01', patient)).toStrictEqual([false]);
    });

    test.skip('testGreatorOrEqual7', () => {
      expect(evalFhirPath('@T12:00:00 >= @T14:00:00', patient)).toStrictEqual([false]);
    });

    test('testGreatorOrEqual8', () => {
      expect(evalFhirPath('1 >= 1', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual9', () => {
      expect(evalFhirPath('1.0 >= 1.0', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual10', () => {
      expect(evalFhirPath("'a' >= 'a'", patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual11', () => {
      expect(evalFhirPath("'A' >= 'A'", patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual12', () => {
      expect(evalFhirPath('@2014-12-12 >= @2014-12-12', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual13', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 >= @2014-12-13T12:00:00', patient)).toStrictEqual([true]);
    });

    test.skip('testGreatorOrEqual14', () => {
      expect(evalFhirPath('@T12:00:00 >= @T12:00:00', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual15', () => {
      expect(evalFhirPath('2 >= 1', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual16', () => {
      expect(evalFhirPath('1.1 >= 1.0', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual17', () => {
      expect(evalFhirPath("'b' >= 'a'", patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual18', () => {
      expect(evalFhirPath("'B' >= 'A'", patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual19', () => {
      expect(evalFhirPath('@2014-12-13 >= @2014-12-12', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual20', () => {
      expect(evalFhirPath('@2014-12-13T12:00:01 >= @2014-12-13T12:00:00', patient)).toStrictEqual([true]);
    });

    test.skip('testGreatorOrEqual21', () => {
      expect(evalFhirPath('@T12:00:01 >= @T12:00:00', patient)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual22', () => {
      expect(evalFhirPath("Observation.value >= 100 '[lb_av]'", observation)).toStrictEqual([true]);
    });

    test('testGreatorOrEqual23', () => {
      expect(() => evalFhirPath('@2018-03 >= @2018-03-01', patient)).not.toThrow();
    });

    test.skip('testGreatorOrEqual24', () => {
      expect(() => evalFhirPath('@2018-03-01T10 >= @2018-03-01T10:30', patient)).not.toThrow();
    });

    test.skip('testGreatorOrEqual25', () => {
      expect(() => evalFhirPath('@T10 >= @T10:30', patient)).not.toThrow();
    });

    test('testGreatorOrEqual26', () => {
      expect(evalFhirPath('@2018-03-01T10:30:00 >= @2018-03-01T10:30:00.0', patient)).toStrictEqual([true]);
    });

    test.skip('testGreatorOrEqual27', () => {
      expect(evalFhirPath('@T10:30:00 >= @T10:30:00.0', patient)).toStrictEqual([true]);
    });
  });

  describe('testGreaterThan', () => {
    test('testGreaterThan1', () => {
      expect(evalFhirPath('1 > 2', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan2', () => {
      expect(evalFhirPath('1.0 > 1.2', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan3', () => {
      expect(evalFhirPath("'a' > 'b'", patient)).toStrictEqual([false]);
    });

    test('testGreaterThan4', () => {
      expect(evalFhirPath("'A' > 'a'", patient)).toStrictEqual([false]);
    });

    test('testGreaterThan5', () => {
      expect(evalFhirPath('@2014-12-12 > @2014-12-13', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan6', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 > @2014-12-13T12:00:01', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan7', () => {
      expect(evalFhirPath('@T12:00:00 > @T14:00:00', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan8', () => {
      expect(evalFhirPath('1 > 1', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan9', () => {
      expect(evalFhirPath('1.0 > 1.0', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan10', () => {
      expect(evalFhirPath("'a' > 'a'", patient)).toStrictEqual([false]);
    });

    test('testGreaterThan11', () => {
      expect(evalFhirPath("'A' > 'A'", patient)).toStrictEqual([false]);
    });

    test('testGreaterThan12', () => {
      expect(evalFhirPath('@2014-12-12 > @2014-12-12', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan13', () => {
      expect(evalFhirPath('@2014-12-13T12:00:00 > @2014-12-13T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan14', () => {
      expect(evalFhirPath('@T12:00:00 > @T12:00:00', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan15', () => {
      expect(evalFhirPath('2 > 1', patient)).toStrictEqual([true]);
    });

    test('testGreaterThan16', () => {
      expect(evalFhirPath('1.1 > 1.0', patient)).toStrictEqual([true]);
    });

    test('testGreaterThan17', () => {
      expect(evalFhirPath("'b' > 'a'", patient)).toStrictEqual([true]);
    });

    test('testGreaterThan18', () => {
      expect(evalFhirPath("'B' > 'A'", patient)).toStrictEqual([true]);
    });

    test('testGreaterThan19', () => {
      expect(evalFhirPath('@2014-12-13 > @2014-12-12', patient)).toStrictEqual([true]);
    });

    test('testGreaterThan20', () => {
      expect(evalFhirPath('@2014-12-13T12:00:01 > @2014-12-13T12:00:00', patient)).toStrictEqual([true]);
    });

    test('testGreaterThan21', () => {
      expect(evalFhirPath('@T12:00:01 > @T12:00:00', patient)).toStrictEqual([true]);
    });

    test('testGreaterThan22', () => {
      expect(evalFhirPath("Observation.value > 100 '[lb_av]'", observation)).toStrictEqual([true]);
    });

    test('testGreaterThan23', () => {
      expect(() => evalFhirPath('@2018-03 > @2018-03-01', patient)).not.toThrow();
    });

    test.skip('testGreaterThan24', () => {
      expect(() => evalFhirPath('@2018-03-01T10 > @2018-03-01T10:30', patient)).not.toThrow();
    });

    test('testGreaterThan25', () => {
      expect(() => evalFhirPath('@T10 > @T10:30', patient)).not.toThrow();
    });

    test('testGreaterThan26', () => {
      expect(evalFhirPath('@2018-03-01T10:30:00 > @2018-03-01T10:30:00.0', patient)).toStrictEqual([false]);
    });

    test('testGreaterThan27', () => {
      expect(evalFhirPath('@T10:30:00 > @T10:30:00.0', patient)).toStrictEqual([false]);
    });
  });

  describe('testUnion', () => {
    test('testUnion1', () => {
      expect(evalFhirPath('(1 | 2 | 3).count() = 3', patient)).toStrictEqual([true]);
    });

    test('testUnion2', () => {
      expect(evalFhirPath('(1 | 2 | 2).count() = 2', patient)).toStrictEqual([true]);
    });

    test('testUnion3', () => {
      expect(evalFhirPath('(1|1).count() = 1', patient)).toStrictEqual([true]);
    });

    test('testUnion4', () => {
      expect(evalFhirPath('1.union(2).union(3).count() = 3', patient)).toStrictEqual([true]);
    });

    test('testUnion5', () => {
      expect(evalFhirPath('1.union(2.union(3)).count() = 3', patient)).toStrictEqual([true]);
    });

    test('testUnion6', () => {
      expect(evalFhirPath('(1 | 2).combine(2).count() = 3', patient)).toStrictEqual([true]);
    });

    test('testUnion7', () => {
      expect(evalFhirPath('1.combine(1).count() = 2', patient)).toStrictEqual([true]);
    });

    test('testUnion8', () => {
      expect(evalFhirPath('1.combine(1).union(2).count() = 2', patient)).toStrictEqual([true]);
    });
    test('testUnion9', () => {
      expect(evalFhirPath('Patient.name.family.union(Patient.name.given)', patient)).toStrictEqual([
        'Chalmers',
        'Windsor',
        'Peter',
        'James',
        'Jim',
      ]);
    });
  });

  describe('testCombine', () => {
    test('testCombine1', () => {
      expect(evalFhirPath('Patient.name.family.combine(Patient.name.given)', patient)).toStrictEqual([
        'Chalmers',
        'Windsor',
        'Peter',
        'James',
        'Jim',
        'Peter',
        'James',
      ]);
    });
  });

  describe('testIntersect', () => {
    test('testIntersect1', () => {
      expect(evalFhirPath('(1 | 2 | 3).intersect(2 | 4) = 2', patient)).toStrictEqual([true]);
    });

    test('testIntersect2', () => {
      expect(evalFhirPath('(1 | 2).intersect(4).empty()', patient)).toStrictEqual([true]);
    });

    test('testIntersect3', () => {
      expect(evalFhirPath('(1 | 2).intersect({}).empty()', patient)).toStrictEqual([true]);
    });

    test('testIntersect4', () => {
      expect(evalFhirPath('1.combine(1).intersect(1).count() = 1', patient)).toStrictEqual([true]);
    });

    test('testIntersect5', () => {
      expect(evalFhirPath('Patient.name.given.intersect(Patient.name.given).count() = 3', patient)).toStrictEqual([
        true,
      ]);
    });
  });

  describe('testExclude', () => {
    test('testExclude1', () => {
      expect(evalFhirPath('(1 | 2 | 3).exclude(2 | 4) = 1 | 3', patient)).toStrictEqual([true]);
    });

    test('testExclude2', () => {
      expect(evalFhirPath('(1 | 2).exclude(4) = 1 | 2', patient)).toStrictEqual([true]);
    });

    test('testExclude3', () => {
      expect(evalFhirPath('(1 | 2).exclude({}) = 1 | 2', patient)).toStrictEqual([true]);
    });

    test('testExclude4', () => {
      expect(evalFhirPath('1.combine(1).exclude(2).count() = 2', patient)).toStrictEqual([true]);
    });
    test('testExclude5', () => {
      expect(
        evalFhirPath("Patient.name.given.exclude(Patient.name.given.where(startsWith('J').not())).distinct()", patient)
      ).toStrictEqual(['James', 'Jim']);
    });
  });

  describe('testIn', () => {
    test('testIn1', () => {
      expect(evalFhirPath('1 in (1 | 2 | 3)', patient)).toStrictEqual([true]);
    });

    test('testIn2', () => {
      expect(evalFhirPath('1 in (2 | 3)', patient)).toStrictEqual([false]);
    });

    test('testIn3', () => {
      expect(evalFhirPath("'a' in ('a' | 'c' | 'd')", patient)).toStrictEqual([true]);
    });

    test('testIn4', () => {
      expect(evalFhirPath("'b' in ('a' | 'c' | 'd')", patient)).toStrictEqual([false]);
    });
  });

  describe('testContainsCollection', () => {
    test('testContainsCollection1', () => {
      expect(evalFhirPath('(1 | 2 | 3) contains 1', patient)).toStrictEqual([true]);
    });

    test('testContainsCollection2', () => {
      expect(evalFhirPath('(2 | 3) contains 1', patient)).toStrictEqual([false]);
    });

    test('testContainsCollection3', () => {
      expect(evalFhirPath("('a' | 'c' | 'd') contains 'a'", patient)).toStrictEqual([true]);
    });

    test('testContainsCollection4', () => {
      expect(evalFhirPath("('a' | 'c' | 'd') contains 'b'", patient)).toStrictEqual([false]);
    });
  });

  describe('testBooleanLogicAnd', () => {
    test('testBooleanLogicAnd1', () => {
      expect(evalFhirPath('(true and true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd2', () => {
      expect(evalFhirPath('(true and false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd3', () => {
      expect(evalFhirPath('(true and {}).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd4', () => {
      expect(evalFhirPath('(false and true) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd5', () => {
      expect(evalFhirPath('(false and false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd6', () => {
      expect(evalFhirPath('(false and {}) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd7', () => {
      expect(evalFhirPath('({} and true).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd8', () => {
      expect(evalFhirPath('({} and false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicAnd9', () => {
      expect(evalFhirPath('({} and {}).empty()', patient)).toStrictEqual([true]);
    });
  });

  describe('testBooleanLogicOr', () => {
    test('testBooleanLogicOr1', () => {
      expect(evalFhirPath('(true or true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr2', () => {
      expect(evalFhirPath('(true or false) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr3', () => {
      expect(evalFhirPath('(true or {}) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr4', () => {
      expect(evalFhirPath('(false or true) = true', patient)).toStrictEqual([true]);
    });

    test.skip('testBooleanLogicOr5', () => {
      expect(evalFhirPath('(false or false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr6', () => {
      expect(evalFhirPath('(false or {}).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr7', () => {
      expect(evalFhirPath('({} or true)', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr8', () => {
      expect(evalFhirPath('({} or false).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicOr9', () => {
      expect(evalFhirPath('({} or {}).empty()', patient)).toStrictEqual([true]);
    });
  });

  describe('testBooleanLogicXOr', () => {
    test('testBooleanLogicXOr1', () => {
      expect(evalFhirPath('(true xor true) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr2', () => {
      expect(evalFhirPath('(true xor false) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr3', () => {
      expect(evalFhirPath('(true xor {}).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr4', () => {
      expect(evalFhirPath('(false xor true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr5', () => {
      expect(evalFhirPath('(false xor false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr6', () => {
      expect(evalFhirPath('(false xor {}).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr7', () => {
      expect(evalFhirPath('({} xor true).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr8', () => {
      expect(evalFhirPath('({} xor false).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanLogicXOr9', () => {
      expect(evalFhirPath('({} xor {}).empty()', patient)).toStrictEqual([true]);
    });
  });

  describe('testBooleanImplies', () => {
    test('testBooleanImplies1', () => {
      expect(evalFhirPath('(true implies true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies2', () => {
      expect(evalFhirPath('(true implies false) = false', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies3', () => {
      expect(evalFhirPath('(true implies {}).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies4', () => {
      expect(evalFhirPath('(false implies true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies5', () => {
      expect(evalFhirPath('(false implies false) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies6', () => {
      expect(evalFhirPath('(false implies {}) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies7', () => {
      expect(evalFhirPath('({} implies true) = true', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies8', () => {
      expect(evalFhirPath('({} implies false).empty()', patient)).toStrictEqual([true]);
    });

    test('testBooleanImplies9', () => {
      expect(evalFhirPath('({} implies {}).empty()', patient)).toStrictEqual([true]);
    });
  });

  describe('testPlus', () => {
    test('testPlus1', () => {
      expect(evalFhirPath('1 + 1 = 2', patient)).toStrictEqual([true]);
    });

    test('testPlus2', () => {
      expect(evalFhirPath('1 + 0 = 1', patient)).toStrictEqual([true]);
    });

    test('testPlus3', () => {
      expect(evalFhirPath('1.2 + 1.8 = 3.0', patient)).toStrictEqual([true]);
    });

    test('testPlus4', () => {
      expect(evalFhirPath("'a'+'b' = 'ab'", patient)).toStrictEqual([true]);
    });
  });

  describe('testConcatenate', () => {
    test('testConcatenate1', () => {
      expect(evalFhirPath("'a' & 'b' = 'ab'", patient)).toStrictEqual([true]);
    });

    test('testConcatenate2', () => {
      expect(evalFhirPath("'1' & {} = '1'", patient)).toStrictEqual([true]);
    });

    test('testConcatenate3', () => {
      expect(evalFhirPath("{} & 'b' = 'b'", patient)).toStrictEqual([true]);
    });

    test.skip('testConcatenate4', () => {
      expect(() => evalFhirPath("(1 | 2 | 3) & 'b' = '1,2,3b'", patient)).toThrow();
    });
  });

  describe('testMinus', () => {
    test('testMinus1', () => {
      expect(evalFhirPath('1 - 1 = 0', patient)).toStrictEqual([true]);
    });

    test('testMinus2', () => {
      expect(evalFhirPath('1 - 0 = 1', patient)).toStrictEqual([true]);
    });

    test('testMinus3', () => {
      expect(evalFhirPath('1.8 - 1.2 = 0.6', patient)).toStrictEqual([true]);
    });

    test.skip('testMinus4', () => {
      expect(() => evalFhirPath("'a'-'b' = 'ab'", patient)).toThrow();
    });
  });

  describe('testMultiply', () => {
    test('testMultiply1', () => {
      expect(evalFhirPath('1.2 * 1.8 = 2.16', patient)).toStrictEqual([true]);
    });

    test('testMultiply2', () => {
      expect(evalFhirPath('1 * 1 = 1', patient)).toStrictEqual([true]);
    });

    test('testMultiply3', () => {
      expect(evalFhirPath('1 * 0 = 0', patient)).toStrictEqual([true]);
    });
  });

  describe('testDivide', () => {
    test('testDivide1', () => {
      expect(evalFhirPath('1 / 1 = 1', patient)).toStrictEqual([true]);
    });

    test('testDivide2', () => {
      expect(evalFhirPath('4 / 2 = 2', patient)).toStrictEqual([true]);
    });

    test('testDivide3', () => {
      expect(evalFhirPath('4.0 / 2.0 = 2.0', patient)).toStrictEqual([true]);
    });

    test('testDivide4', () => {
      expect(evalFhirPath('1 / 2 = 0.5', patient)).toStrictEqual([true]);
    });

    test('testDivide5', () => {
      expect(evalFhirPath('1.2 / 1.8 = 0.66666667', patient)).toStrictEqual([true]);
    });

    test('testDivide6', () => {
      expect(() => evalFhirPath('1 / 0', patient)).not.toThrow();
    });
  });

  describe('testDiv', () => {
    test('testDiv1', () => {
      expect(evalFhirPath('1 div 1 = 1', patient)).toStrictEqual([true]);
    });

    test('testDiv2', () => {
      expect(evalFhirPath('4 div 2 = 2', patient)).toStrictEqual([true]);
    });

    test('testDiv3', () => {
      expect(evalFhirPath('5 div 2 = 2', patient)).toStrictEqual([true]);
    });

    test('testDiv4', () => {
      expect(evalFhirPath('2.2 div 1.8 = 1', patient)).toStrictEqual([true]);
    });

    test('testDiv5', () => {
      expect(() => evalFhirPath('5 div 0', patient)).not.toThrow();
    });
  });

  describe('testMod', () => {
    test('testMod1', () => {
      expect(evalFhirPath('1 mod 1 = 0', patient)).toStrictEqual([true]);
    });

    test('testMod2', () => {
      expect(evalFhirPath('4 mod 2 = 0', patient)).toStrictEqual([true]);
    });

    test('testMod3', () => {
      expect(evalFhirPath('5 mod 2 = 1', patient)).toStrictEqual([true]);
    });

    test('testMod4', () => {
      expect(evalFhirPath('2.2 mod 1.8 = 0.4', patient)).toStrictEqual([true]);
    });

    test('testMod5', () => {
      expect(() => evalFhirPath('5 mod 0', patient)).not.toThrow();
    });
  });

  describe('testRound', () => {
    test('testRound1', () => {
      expect(evalFhirPath('1.round() = 1', patient)).toStrictEqual([true]);
    });

    test.skip('testRound2', () => {
      expect(evalFhirPath('3.14159.round(3) = 2', patient)).toStrictEqual([true]);
    });
  });

  describe('testSqrt', () => {
    test('testSqrt1', () => {
      expect(evalFhirPath('81.sqrt() = 9.0', patient)).toStrictEqual([true]);
    });

    test('testSqrt2', () => {
      expect(() => evalFhirPath('(-1).sqrt()', patient)).not.toThrow();
    });
  });

  describe('testAbs', () => {
    test('testAbs1', () => {
      expect(evalFhirPath('(-5).abs() = 5', patient)).toStrictEqual([true]);
    });

    test('testAbs2', () => {
      expect(evalFhirPath('(-5.5).abs() = 5.5', patient)).toStrictEqual([true]);
    });

    test('testAbs3', () => {
      expect(evalFhirPath("(-5.5 'mg').abs() = 5.5 'mg'", patient)).toStrictEqual([true]);
    });
  });

  describe('testCeiling', () => {
    test('testCeiling1', () => {
      expect(evalFhirPath('1.ceiling() = 1', patient)).toStrictEqual([true]);
    });

    test('testCeiling2', () => {
      expect(evalFhirPath('(-1.1).ceiling() = -1', patient)).toStrictEqual([true]);
    });

    test('testCeiling3', () => {
      expect(evalFhirPath('1.1.ceiling() = 2', patient)).toStrictEqual([true]);
    });
  });

  describe('testExp', () => {
    test('testExp1', () => {
      expect(evalFhirPath('0.exp() = 1', patient)).toStrictEqual([true]);
    });

    test('testExp2', () => {
      expect(evalFhirPath('(-0.0).exp() = 1', patient)).toStrictEqual([true]);
    });
  });

  describe('testFloor', () => {
    test('testFloor1', () => {
      expect(evalFhirPath('1.floor() = 1', patient)).toStrictEqual([true]);
    });

    test('testFloor2', () => {
      expect(evalFhirPath('2.1.floor() = 2', patient)).toStrictEqual([true]);
    });

    test('testFloor3', () => {
      expect(evalFhirPath('(-2.1).floor() = -3', patient)).toStrictEqual([true]);
    });
  });

  describe('testLn', () => {
    test('testLn1', () => {
      expect(evalFhirPath('1.ln() = 0.0', patient)).toStrictEqual([true]);
    });

    test('testLn2', () => {
      expect(evalFhirPath('1.0.ln() = 0.0', patient)).toStrictEqual([true]);
    });
  });

  describe('testLog', () => {
    test('testLog1', () => {
      expect(evalFhirPath('16.log(2) = 4.0', patient)).toStrictEqual([true]);
    });

    test('testLog2', () => {
      expect(evalFhirPath('100.0.log(10.0) = 2.0', patient)).toStrictEqual([true]);
    });
  });

  describe('testPower', () => {
    test('testPower1', () => {
      expect(evalFhirPath('2.power(3) = 8', patient)).toStrictEqual([true]);
    });

    test('testPower2', () => {
      expect(evalFhirPath('2.5.power(2) = 6.25', patient)).toStrictEqual([true]);
    });

    test('testPower3', () => {
      expect(() => evalFhirPath('(-1).power(0.5)', patient)).not.toThrow();
    });
  });

  describe('testTruncate', () => {
    test('testTruncate1', () => {
      expect(evalFhirPath('101.truncate() = 101', patient)).toStrictEqual([true]);
    });

    test('testTruncate2', () => {
      expect(evalFhirPath('1.00000001.truncate() = 1', patient)).toStrictEqual([true]);
    });

    test('testTruncate3', () => {
      expect(evalFhirPath('(-1.56).truncate() = -1', patient)).toStrictEqual([true]);
    });
  });

  describe('testPrecedence', () => {
    test.skip('test unary precedence', () => {
      expect(() => evalFhirPath('-1.convertsToInteger()', patient)).toThrow();
    });

    test('testPrecedence2', () => {
      expect(evalFhirPath('1+2*3+4 = 11', patient)).toStrictEqual([true]);
    });

    test('testPrecedence3', () => {
      expect(evalFhirPath('1 > 2 is Boolean', patient)).toStrictEqual([true]);
    });

    test.skip('testPrecedence4', () => {
      expect(evalFhirPath('1 | 1 is Integer', patient)).toStrictEqual([true]);
    });
  });

  describe('testVariables', () => {
    const typedPatient = [toTypedValue(patient)];
    const typedTrue = [toTypedValue(true)];
    const variables = {
      '%sct': toTypedValue('http://snomed.info/sct'),
      '%loinc': toTypedValue('http://loinc.org'),
      '%ucum': toTypedValue('http://unitsofmeasure.org'),
      '%`vs-administrative-gender`': toTypedValue('http://hl7.org/fhir/ValueSet/administrative-gender'),
    };

    test('testVariables1', () => {
      expect(evalFhirPathTyped("%sct = 'http://snomed.info/sct'", typedPatient, variables)).toStrictEqual(typedTrue);
    });

    test('testVariables2', () => {
      expect(evalFhirPathTyped("%loinc = 'http://loinc.org'", typedPatient, variables)).toStrictEqual(typedTrue);
    });

    test('testVariables3', () => {
      expect(evalFhirPathTyped("%ucum = 'http://unitsofmeasure.org'", typedPatient, variables)).toStrictEqual(
        typedTrue
      );
    });

    test('testVariables4', () => {
      expect(
        evalFhirPathTyped(
          "%`vs-administrative-gender` = 'http://hl7.org/fhir/ValueSet/administrative-gender'",
          typedPatient,
          variables
        )
      ).toStrictEqual(typedTrue);
    });
  });

  describe.skip('testExtension', () => {
    test('testExtension1', () => {
      expect(
        evalFhirPath(
          "Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime').exists()",
          patient
        )
      ).toStrictEqual([true]);
    });

    test('testExtension2', () => {
      expect(evalFhirPath('Patient.birthDate.extension(%`ext-patient-birthTime`).exists()', patient)).toStrictEqual([
        true,
      ]);
    });

    test('testExtension3', () => {
      expect(
        evalFhirPath(
          "Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime1').empty()",
          patient
        )
      ).toStrictEqual([true]);
    });
  });

  describe.skip('testType', () => {
    test('testType1', () => {
      expect(evalFhirPath("1.type().namespace = 'System'", patient)).toStrictEqual([true]);
    });

    test('testType2', () => {
      expect(evalFhirPath("1.type().name = 'Integer'", patient)).toStrictEqual([true]);
    });

    test('testType3', () => {
      expect(evalFhirPath("true.type().namespace = 'System'", patient)).toStrictEqual([true]);
    });

    test('testType4', () => {
      expect(evalFhirPath("true.type().name = 'Boolean'", patient)).toStrictEqual([true]);
    });

    test('testType5', () => {
      expect(evalFhirPath('true.is(Boolean)', patient)).toStrictEqual([true]);
    });

    test('testType6', () => {
      expect(evalFhirPath('true.is(System.Boolean)', patient)).toStrictEqual([true]);
    });

    test('testType7', () => {
      expect(evalFhirPath('true is Boolean', patient)).toStrictEqual([true]);
    });

    test('testType8', () => {
      expect(evalFhirPath('true is System.Boolean', patient)).toStrictEqual([true]);
    });

    test('testType9', () => {
      expect(evalFhirPath("Patient.active.type().namespace = 'FHIR'", patient)).toStrictEqual([true]);
    });

    test('testType10', () => {
      expect(evalFhirPath("Patient.active.type().name = 'boolean'", patient)).toStrictEqual([true]);
    });

    test('testType11', () => {
      expect(evalFhirPath('Patient.active.is(boolean)', patient)).toStrictEqual([true]);
    });

    test('testType12', () => {
      expect(evalFhirPath('Patient.active.is(Boolean).not()', patient)).toStrictEqual([true]);
    });

    test('testType13', () => {
      expect(evalFhirPath('Patient.active.is(FHIR.boolean)', patient)).toStrictEqual([true]);
    });

    test('testType14', () => {
      expect(evalFhirPath('Patient.active.is(System.Boolean).not()', patient)).toStrictEqual([true]);
    });

    test('testType15', () => {
      expect(evalFhirPath("Patient.type().namespace = 'FHIR'", patient)).toStrictEqual([true]);
    });

    test('testType16', () => {
      expect(evalFhirPath("Patient.type().name = 'Patient'", patient)).toStrictEqual([true]);
    });

    test('testType17', () => {
      expect(evalFhirPath('Patient.is(Patient)', patient)).toStrictEqual([true]);
    });

    test('testType18', () => {
      expect(evalFhirPath('Patient.is(FHIR.Patient)', patient)).toStrictEqual([true]);
    });

    test('testType19', () => {
      expect(evalFhirPath('Patient.is(FHIR.`Patient`)', patient)).toStrictEqual([true]);
    });

    test('testType20', () => {
      expect(evalFhirPath('Patient.ofType(Patient).type().name', patient)).toStrictEqual(['Patient']);
    });

    test('testType21', () => {
      expect(evalFhirPath('Patient.ofType(FHIR.Patient).type().name', patient)).toStrictEqual(['Patient']);
    });

    test('testType22', () => {
      expect(evalFhirPath('Patient.is(System.Patient).not()', patient)).toStrictEqual([true]);
    });

    test('testType23', () => {
      expect(evalFhirPath('Patient.ofType(FHIR.`Patient`).type().name', patient)).toStrictEqual(['Patient']);
    });
  });

  describe('testConformsTo', () => {
    test('testConformsTo', () => {
      expect(evalFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Patient')", patient)).toStrictEqual([
        true,
      ]);
    });

    test('testConformsTo', () => {
      expect(evalFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Person')", patient)).toStrictEqual([
        false,
      ]);
    });

    test('testConformsTo', () => {
      expect(() => evalFhirPath("conformsTo('http://trash')", patient)).toThrow();
    });
  });

  // more "real-world" tests using FHIRPath to evaluate hypothetical constraints on AccessPolicy or Subscription resources
  describe('testRealWorldConstraints', () => {
    const RESOURCE_CONSTRAINT = "hiddenFields.select(substring(0, indexOf('.'))).distinct().subsetOf(readonlyFields)";

    test('testAccessPolicyResourceConstraint positive', () => {
      const validResource: TypedValue = {
        type: PropertyType.BackboneElement,
        value: { resourceType: 'Patient', hiddenFields: ['name.use', 'name.given'], readonlyFields: ['name'] },
      };
      expect(evalFhirPath(RESOURCE_CONSTRAINT, validResource)).toStrictEqual([true]);
    });

    test('testAccessPolicyResourceConstraint negative', () => {
      const invalidResource: TypedValue = {
        type: PropertyType.BackboneElement,
        value: {
          resourceType: 'Observation',
          hiddenFields: ['category', 'component.code'],
          // readonlyFields: ['component'], // this would make it valid
        },
      };
      expect(evalFhirPath(RESOURCE_CONSTRAINT, invalidResource)).toStrictEqual([false]);
    });

    test.each<[unknown, unknown, boolean]>([
      [undefined, observation, true],
      [observation, observation, false],
      [observation, { ...observation, status: 'amended' }, true],
    ])('criteria including resource creation %#', (previous, current, result) => {
      const criteria = '%previous.exists() implies %previous.status != %current.status';
      const variables = { '%previous': toTypedValue(previous), '%current': toTypedValue(current) };
      expect(evalFhirPathTyped(criteria, [], variables)).toStrictEqual([toTypedValue(result)]);
    });

    test.each<[unknown, unknown, boolean]>([
      [undefined, patient, false],
      [patient, patient, false],
      [patient, { ...patient, name: [...patient.name, { text: 'The Patient' }] }, false],
      [{ ...patient, name: [...patient.name, { text: 'The Patient' }] }, patient, true],
    ])('comparison of array field elements %#', (previous, current, result) => {
      const criteria = '%previous.name.where( ($this in %current.name).not() ).exists()';
      const variables = { '%previous': toTypedValue(previous), '%current': toTypedValue(current) };
      expect(evalFhirPathTyped(criteria, [], variables)).toStrictEqual([toTypedValue(result)]);
    });
  });
});
