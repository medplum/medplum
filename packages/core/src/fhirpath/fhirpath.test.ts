import { parseFhirPath } from './parse';
import { toBoolean } from './utils';

const observation = {
  "resourceType": "Observation",
  "id": "example",
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p><b>Generated Narrative with Details</b></p><p><b>id</b>: example</p><p><b>status</b>: final</p><p><b>category</b>: Vital Signs <span>(Details : {http://terminology.hl7.org/CodeSystem/observation-category code 'vital-signs' = 'Vital Signs', given as 'Vital Signs'})</span></p><p><b>code</b>: Body Weight <span>(Details : {LOINC code '29463-7' = 'Body weight', given as 'Body Weight'}; {LOINC code '3141-9' = 'Body weight Measured', given as 'Body weight Measured'}; {SNOMED CT code '27113001' = 'Body weight', given as 'Body weight'}; {http://acme.org/devices/clinical-codes code 'body-weight' = 'body-weight', given as 'Body Weight'})</span></p><p><b>subject</b>: <a>Patient/example</a></p><p><b>encounter</b>: <a>Encounter/example</a></p><p><b>effective</b>: 28/03/2016</p><p><b>value</b>: 185 lbs<span> (Details: UCUM code [lb_av] = 'lb_av')</span></p></div>"
  },
  "status": "final",
  "category": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/observation-category",
          "code": "vital-signs",
          "display": "Vital Signs"
        }
      ]
    }
  ],
  "code": {
    "coding": [
      {
        "system": "http://loinc.org",
        "code": "29463-7",
        "display": "Body Weight"
      },
      {
        "system": "http://loinc.org",
        "code": "3141-9",
        "display": "Body weight Measured"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "27113001",
        "display": "Body weight"
      },
      {
        "system": "http://acme.org/devices/clinical-codes",
        "code": "body-weight",
        "display": "Body Weight"
      }
    ]
  },
  "subject": {
    "reference": "Patient/example"
  },
  "encounter": {
    "reference": "Encounter/example"
  },
  "effectiveDateTime": "2016-03-28",
  "valueQuantity": {
    "value": 185,
    "unit": "lbs",
    "system": "http://unitsofmeasure.org",
    "code": "[lb_av]"
  }
};

const patient = {
  "resourceType": "Patient",
  "id": "example",
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><table><tbody><tr><td>Name</td><td>Peter James \n              <b>Chalmers</b> (\"Jim\")\n            </td></tr><tr><td>Address</td><td>534 Erewhon, Pleasantville, Vic, 3999</td></tr><tr><td>Contacts</td><td>Home: unknown. Work: (03) 5555 6473</td></tr><tr><td>Id</td><td>MRN: 12345 (Acme Healthcare)</td></tr></tbody></table></div>"
  },
  "identifier": [
    {
      "use": "usual",
      "type": {
        "coding": [
          {
            "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
            "code": "MR"
          }
        ]
      },
      "system": "urn:oid:1.2.36.146.595.217.0.1",
      "value": "12345",
      "period": {
        "start": "2001-05-06"
      },
      "assigner": {
        "display": "Acme Healthcare"
      }
    }
  ],
  "active": true,
  "name": [
    {
      "use": "official",
      "family": "Chalmers",
      "given": [
        "Peter",
        "James"
      ]
    },
    {
      "use": "usual",
      "given": [
        "Jim"
      ]
    },
    {
      "use": "maiden",
      "family": "Windsor",
      "given": [
        "Peter",
        "James"
      ],
      "period": {
        "end": "2002"
      }
    }
  ],
  "telecom": [
    {
      "use": "home"
    },
    {
      "system": "phone",
      "value": "(03) 5555 6473",
      "use": "work",
      "rank": 1
    },
    {
      "system": "phone",
      "value": "(03) 3410 5613",
      "use": "mobile",
      "rank": 2
    },
    {
      "system": "phone",
      "value": "(03) 5555 8834",
      "use": "old",
      "period": {
        "end": "2014"
      }
    }
  ],
  "gender": "male",
  "_birthDate": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/StructureDefinition/patient-birthTime",
        "valueDateTime": "1974-12-25T14:35:45-05:00"
      }
    ]
  },
  "birthDate": "1974-12-25",
  "deceasedBoolean": false,
  "address": [
    {
      "use": "home",
      "type": "both",
      "text": "534 Erewhon St PeasantVille, Rainbow, Vic  3999",
      "line": [
        "534 Erewhon St"
      ],
      "city": "PleasantVille",
      "district": "Rainbow",
      "state": "Vic",
      "postalCode": "3999",
      "period": {
        "start": "1974-12-25"
      }
    }
  ],
  "contact": [
    {
      "relationship": [
        {
          "coding": [
            {
              "system": "http://terminology.hl7.org/CodeSystem/v2-0131",
              "code": "N"
            }
          ]
        }
      ],
      "name": {
        "_family": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix",
              "valueString": "VV"
            }
          ]
        },
        "family": "du Marché",
        "given": [
          "Bénédicte"
        ]
      },
      "telecom": [
        {
          "system": "phone",
          "value": "+33 (237) 998327"
        }
      ],
      "address": {
        "use": "home",
        "type": "both",
        "line": [
          "534 Erewhon St"
        ],
        "city": "PleasantVille",
        "district": "Rainbow",
        "state": "Vic",
        "postalCode": "3999",
        "period": {
          "start": "1974-12-25"
        }
      },
      "gender": "female",
      "period": {
        "start": "2012"
      }
    }
  ],
  "managingOrganization": {
    "reference": "Organization/1"
  }
};

const questionnaire = {
  "resourceType": "Questionnaire",
  "id": "3141",
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><pre>\n            1.Comorbidity?\n              1.1 Cardial Comorbidity\n                1.1.1 Angina?\n                1.1.2 MI?\n              1.2 Vascular Comorbidity?\n              ...\n            Histopathology\n              Abdominal\n                pT category?\n              ...\n          </pre></div>"
  },
  "url": "http://hl7.org/fhir/Questionnaire/3141",
  "title": "Cancer Quality Forum Questionnaire 2012",
  "status": "draft",
  "subjectType": [
    "Patient"
  ],
  "date": "2012-01",
  "item": [
    {
      "linkId": "1",
      "code": [
        {
          "system": "http://example.org/system/code/sections",
          "code": "COMORBIDITY"
        }
      ],
      "type": "group",
      "item": [
        {
          "linkId": "1.1",
          "code": [
            {
              "system": "http://example.org/system/code/questions",
              "code": "COMORB"
            }
          ],
          "prefix": "1",
          "type": "choice",
          "answerValueSet": "http://hl7.org/fhir/ValueSet/yesnodontknow",
          "item": [
            {
              "linkId": "1.1.1",
              "code": [
                {
                  "system": "http://example.org/system/code/sections",
                  "code": "CARDIAL"
                }
              ],
              "type": "group",
              "enableWhen": [
                {
                  "question": "1.1",
                  "operator": "=",
                  "answerCoding": {
                    "system": "http://terminology.hl7.org/CodeSystem/v2-0136",
                    "code": "Y"
                  }
                }
              ],
              "item": [
                {
                  "linkId": "1.1.1.1",
                  "code": [
                    {
                      "system": "http://example.org/system/code/questions",
                      "code": "COMORBCAR"
                    }
                  ],
                  "prefix": "1.1",
                  "type": "choice",
                  "answerValueSet": "http://hl7.org/fhir/ValueSet/yesnodontknow",
                  "item": [
                    {
                      "linkId": "1.1.1.1.1",
                      "code": [
                        {
                          "system": "http://example.org/system/code/questions",
                          "code": "COMCAR00",
                          "display": "Angina Pectoris"
                        },
                        {
                          "system": "http://snomed.info/sct",
                          "code": "194828000",
                          "display": "Angina (disorder)"
                        }
                      ],
                      "prefix": "1.1.1",
                      "type": "choice",
                      "answerValueSet": "http://hl7.org/fhir/ValueSet/yesnodontknow"
                    },
                    {
                      "linkId": "1.1.1.1.2",
                      "code": [
                        {
                          "system": "http://snomed.info/sct",
                          "code": "22298006",
                          "display": "Myocardial infarction (disorder)"
                        }
                      ],
                      "prefix": "1.1.2",
                      "type": "choice",
                      "answerValueSet": "http://hl7.org/fhir/ValueSet/yesnodontknow"
                    }
                  ]
                },
                {
                  "linkId": "1.1.1.2",
                  "code": [
                    {
                      "system": "http://example.org/system/code/questions",
                      "code": "COMORBVAS"
                    }
                  ],
                  "prefix": "1.2",
                  "type": "choice",
                  "answerValueSet": "http://hl7.org/fhir/ValueSet/yesnodontknow"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "linkId": "2",
      "code": [
        {
          "system": "http://example.org/system/code/sections",
          "code": "HISTOPATHOLOGY"
        }
      ],
      "type": "group",
      "item": [
        {
          "linkId": "2.1",
          "code": [
            {
              "system": "http://example.org/system/code/sections",
              "code": "ABDOMINAL"
            }
          ],
          "type": "group",
          "item": [
            {
              "linkId": "2.1.2",
              "code": [
                {
                  "system": "http://example.org/system/code/questions",
                  "code": "STADPT",
                  "display": "pT category"
                }
              ],
              "type": "choice"
            }
          ]
        }
      ]
    }
  ]
};

const valueset = {
  "resourceType": "ValueSet",
  "id": "example-expansion",
  "meta": {
    "profile": [
      "http://hl7.org/fhir/StructureDefinition/shareablevalueset"
    ]
  },
  "text": {
    "status": "generated",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\"><table class=\"grid\"><tr><td>http://loinc.org</td><td>14647-2</td><td>Cholesterol [Moles/volume] in Serum or Plasma</td></tr><tr><td colspan=\"3\"><b>Additional Cholesterol codes</b></td></tr><tr><td>http://loinc.org</td><td>2093-3</td><td>Cholesterol [Mass/volume] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>48620-9</td><td>Cholesterol [Mass/volume] in Serum or Plasma ultracentrifugate</td></tr><tr><td>http://loinc.org</td><td>9342-7</td><td>Cholesterol [Percentile]</td></tr><tr><td colspan=\"3\"><b>Cholesterol Ratios</b></td></tr><tr><td>http://loinc.org</td><td>2096-6</td><td>Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>35200-5</td><td>Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>48089-7</td><td>Cholesterol/Apolipoprotein B [Molar ratio] in Serum or Plasma</td></tr><tr><td>http://loinc.org</td><td>55838-7</td><td>Cholesterol/Phospholipid [Molar ratio] in Serum or Plasma</td></tr></table></div>"
  },
  "url": "http://hl7.org/fhir/ValueSet/example-expansion",
  "version": "20150622",
  "name": "LOINC Codes for Cholesterol in Serum/Plasma",
  "status": "draft",
  "experimental": true,
  "date": "2015-06-22",
  "publisher": "FHIR Project team",
  "contact": [
    {
      "telecom": [
        {
          "system": "url",
          "value": "http://hl7.org/fhir"
        }
      ]
    }
  ],
  "description": "This is an example value set that includes all the LOINC codes for serum/plasma cholesterol from v2.36.",
  "copyright": "This content from LOINC® is copyright © 1995 Regenstrief Institute, Inc. and the LOINC Committee, and available at no cost under the license at http://loinc.org/terms-of-use.",
  "compose": {
    "include": [
      {
        "system": "http://loinc.org",
        "filter": [
          {
            "property": "parent",
            "op": "=",
            "value": "LP43571-6"
          }
        ]
      }
    ]
  },
  "expansion": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/StructureDefinition/valueset-expansionSource",
        "valueUri": "http://hl7.org/fhir/ValueSet/example-extensional"
      }
    ],
    "identifier": "urn:uuid:42316ff8-2714-4680-9980-f37a6d1a71bc",
    "timestamp": "2015-06-22T13:56:07Z",
    "total": 8,
    "offset": 0,
    "parameter": [
      {
        "name": "version",
        "valueString": "2.50"
      }
    ],
    "contains": [
      {
        "system": "http://loinc.org",
        "version": "2.50",
        "code": "14647-2",
        "display": "Cholesterol [Moles/volume] in Serum or Plasma"
      },
      {
        "abstract": true,
        "display": "Cholesterol codes",
        "contains": [
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "2093-3",
            "display": "Cholesterol [Mass/volume] in Serum or Plasma"
          },
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "48620-9",
            "display": "Cholesterol [Mass/volume] in Serum or Plasma ultracentrifugate"
          },
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "9342-7",
            "display": "Cholesterol [Percentile]"
          }
        ]
      },
      {
        "abstract": true,
        "display": "Cholesterol Ratios",
        "contains": [
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "2096-6",
            "display": "Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma"
          },
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "35200-5",
            "display": "Cholesterol/Triglyceride [Mass Ratio] in Serum or Plasma"
          },
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "48089-7",
            "display": "Cholesterol/Apolipoprotein B [Molar ratio] in Serum or Plasma"
          },
          {
            "system": "http://loinc.org",
            "version": "2.50",
            "code": "55838-7",
            "display": "Cholesterol/Phospholipid [Molar ratio] in Serum or Plasma"
          }
        ]
      }
    ]
  }
};

describe('FHIRPath Test Suite', () => {

  describe('Miscellaneous accessor tests', () => {

    test('Extract birthDate', () => {
      expect(parseFhirPath("birthDate").eval(patient)).toEqual(["1974-12-25"]);
    });

    test('patient telecom types', () => {
      expect(parseFhirPath("telecom.use").eval(patient)).toEqual(["home", "work", "mobile", "old"]);
    });

  });

  describe('Tests ported from the Java Unit Tests', () => {

    test('testSimple', () => {
      expect(parseFhirPath("name.given").eval(patient)).toEqual(["Peter", "James", "Jim", "Peter", "James"]);
    });

    test('testSimpleNone', () => {
      expect(() => parseFhirPath("name.suffix").eval(patient)).not.toThrow();
    });

    test('testEscapedIdentifier', () => {
      expect(parseFhirPath("name.`given`").eval(patient)).toEqual(["Peter", "James", "Jim", "Peter", "James"]);
    });

    test('testSimpleBackTick1', () => {
      expect(parseFhirPath("`Patient`.name.`given`").eval(patient)).toEqual(["Peter", "James", "Jim", "Peter", "James"]);
    });

    test.skip('testSimpleFail', () => {
      expect(() => parseFhirPath("name.given1").eval(patient)).toThrow();
    });

    test('testSimpleWithContext', () => {
      expect(parseFhirPath("Patient.name.given").eval(patient)).toEqual(["Peter", "James", "Jim", "Peter", "James"]);
    });

    test.skip('testSimpleWithWrongContext', () => {
      expect(() => parseFhirPath("Encounter.name.given").eval(patient)).toThrow();
    });

  });

  describe('testObservations', () => {

    test('testPolymorphismA', () => {
      expect(parseFhirPath("Observation.value.unit").eval(observation)).toEqual(["lbs"]);
    });

    test.skip('testPolymorphismB', () => {
      expect(() => parseFhirPath("Observation.valueQuantity.unit").eval(observation)).toThrow();
    });

    test('testPolymorphismIsA', () => {
      expect(toBoolean(parseFhirPath("Observation.value.is(Quantity)").eval(observation))).toBeTruthy();
    });

    test('testPolymorphismIsA', () => {
      expect(toBoolean(parseFhirPath("Observation.value is Quantity").eval(observation))).toBeTruthy();
    });

    test('testPolymorphismIsB', () => {
      expect(toBoolean(parseFhirPath("Observation.value.is(Period).not()").eval(observation))).toBeTruthy();
    });

    test('testPolymorphismAsA', () => {
      expect(parseFhirPath("Observation.value.as(Quantity).unit").eval(observation)).toEqual(["lbs"]);
    });

    test('testPolymorphismAsAFunction', () => {
      expect(parseFhirPath("(Observation.value as Quantity).unit").eval(observation)).toEqual(["lbs"]);
    });

    test.skip('testPolymorphismAsB', () => {
      expect(() => parseFhirPath("(Observation.value as Period).unit").eval(observation)).toThrow();
    });

    test('testPolymorphismAsBFunction', () => {
      expect(() => parseFhirPath("Observation.value.as(Period).start").eval(observation)).not.toThrow();
    });

  });

  describe.skip('testDollar', () => {

    test('testDollarThis1', () => {
      expect(() => parseFhirPath("Patient.name.given.where(substring($this.length()-3) = 'out')").eval(patient)).not.toThrow();
    });

    test('testDollarThis2', () => {
      expect(parseFhirPath("Patient.name.given.where(substring($this.length()-3) = 'ter')").eval(patient)).toEqual(["Peter", "Peter"]);
    });

    test('testDollarOrderAllowed', () => {
      expect(parseFhirPath("Patient.name.skip(1).given").eval(patient)).toEqual(["Jim", "Peter", "James"]);
    });

    test('testDollarOrderAllowedA', () => {
      expect(() => parseFhirPath("Patient.name.skip(3).given").eval(patient)).not.toThrow();
    });

    test('testDollarOrderNotAllowed', () => {
      expect(() => parseFhirPath("Patient.children().skip(1)").eval(patient)).toThrow();
    });

  });

  describe.skip('testLiterals', () => {

    test('testLiteralTrue', () => {
      expect(toBoolean(parseFhirPath("Patient.name.exists() = true").eval(patient))).toBeTruthy();
    });

    test('testLiteralFalse', () => {
      expect(toBoolean(parseFhirPath("Patient.name.empty() = false").eval(patient))).toBeTruthy();
    });

    test('testLiteralString', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.first() = 'Peter'").eval(patient))).toBeTruthy();
    });

    test('testLiteralInteger1', () => {
      expect(toBoolean(parseFhirPath("1.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testLiteralInteger0', () => {
      expect(toBoolean(parseFhirPath("0.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerNegative1', () => {
      expect(toBoolean(parseFhirPath("(-1).convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerNegative1Invalid', () => {
      expect(() => parseFhirPath("-1.convertsToInteger()").eval(patient)).toThrow();
    });

    test('testLiteralIntegerMax', () => {
      expect(toBoolean(parseFhirPath("2147483647.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testLiteralString', () => {
      expect(toBoolean(parseFhirPath("'test'.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testLiteralStringEscapes', () => {
      expect(toBoolean(parseFhirPath("'\\\\\\/\\f\\r\\n\\t\\\"\\`\\'\\u002a'.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testLiteralBooleanTrue', () => {
      expect(toBoolean(parseFhirPath("true.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testLiteralBooleanFalse', () => {
      expect(toBoolean(parseFhirPath("false.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimal10', () => {
      expect(toBoolean(parseFhirPath("1.0.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimal01', () => {
      expect(toBoolean(parseFhirPath("0.1.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimal00', () => {
      expect(toBoolean(parseFhirPath("0.0.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimalNegative01', () => {
      expect(toBoolean(parseFhirPath("(-0.1).convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimalNegative01Invalid', () => {
      expect(() => parseFhirPath("-0.1.convertsToDecimal()").eval(patient)).toThrow();
    });

    test('testLiteralDecimalMax', () => {
      expect(toBoolean(parseFhirPath("1234567890987654321.0.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimalStep', () => {
      expect(toBoolean(parseFhirPath("0.00000001.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateYear', () => {
      expect(toBoolean(parseFhirPath("@2015.is(Date)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateMonth', () => {
      expect(toBoolean(parseFhirPath("@2015-02.is(Date)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateDay', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04.is(Date)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeYear', () => {
      expect(toBoolean(parseFhirPath("@2015T.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeMonth', () => {
      expect(toBoolean(parseFhirPath("@2015-02T.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeDay', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeHour', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeMinute', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14:34.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeSecond', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14:34:28.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeMillisecond', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14:34:28.123.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeUTC', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14:34:28Z.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralDateTimeTimezoneOffset', () => {
      expect(toBoolean(parseFhirPath("@2015-02-04T14:34:28+10:00.is(DateTime)").eval(patient))).toBeTruthy();
    });

    test('testLiteralTimeHour', () => {
      expect(toBoolean(parseFhirPath("@T14.is(Time)").eval(patient))).toBeTruthy();
    });

    test('testLiteralTimeMinute', () => {
      expect(toBoolean(parseFhirPath("@T14:34.is(Time)").eval(patient))).toBeTruthy();
    });

    test('testLiteralTimeSecond', () => {
      expect(toBoolean(parseFhirPath("@T14:34:28.is(Time)").eval(patient))).toBeTruthy();
    });

    test('testLiteralTimeMillisecond', () => {
      expect(toBoolean(parseFhirPath("@T14:34:28.123.is(Time)").eval(patient))).toBeTruthy();
    });

    test('testLiteralTimeUTC', () => {
      expect(() => parseFhirPath("@T14:34:28Z.is(Time)").eval(patient)).toThrow();
    });

    test('testLiteralTimeTimezoneOffset', () => {
      expect(() => parseFhirPath("@T14:34:28+10:00.is(Time)").eval(patient)).toThrow();
    });

    test('testLiteralQuantityDecimal', () => {
      expect(toBoolean(parseFhirPath("10.1 'mg'.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testLiteralQuantityInteger', () => {
      expect(toBoolean(parseFhirPath("10 'mg'.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testLiteralQuantityDay', () => {
      expect(toBoolean(parseFhirPath("4 days.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerNotEqual', () => {
      expect(toBoolean(parseFhirPath("-3 != 3").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerEqual', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.count() = 5").eval(patient))).toBeTruthy();
    });

    test('testPolarityPrecedence', () => {
      expect(toBoolean(parseFhirPath("-Patient.name.given.count() = -5").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerGreaterThan', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.count() > -3").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerCountNotEqual', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.count() != 0").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerLessThanTrue', () => {
      expect(toBoolean(parseFhirPath("1 < 2").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerLessThanFalse', () => {
      expect(parseFhirPath("1 < -2").eval(patient)).toEqual([false]);
    });

    test('testLiteralIntegerLessThanPolarityTrue', () => {
      expect(toBoolean(parseFhirPath("+1 < +2").eval(patient))).toBeTruthy();
    });

    test('testLiteralIntegerLessThanPolarityFalse', () => {
      expect(toBoolean(parseFhirPath("-1 < 2").eval(patient))).toBeTruthy();
    });

    test('testLiteralDecimalGreaterThanNonZeroTrue', () => {
      expect(toBoolean(parseFhirPath("Observation.value.value > 180.0").eval(observation))).toBeTruthy();
    });

    test('testLiteralDecimalGreaterThanZeroTrue', () => {
      expect(toBoolean(parseFhirPath("Observation.value.value > 0.0").eval(observation))).toBeTruthy();
    });

    test('testLiteralDecimalGreaterThanIntegerTrue', () => {
      expect(toBoolean(parseFhirPath("Observation.value.value > 0").eval(observation))).toBeTruthy();
    });

    test('testLiteralDecimalLessThanInteger', () => {
      expect(toBoolean(parseFhirPath("Observation.value.value < 190").eval(observation))).toBeTruthy();
    });

    test('testLiteralDecimalLessThanInvalid', () => {
      expect(() => parseFhirPath("Observation.value.value < 'test'").eval(observation)).toThrow();
    });

    test('testDateEqual', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate = @1974-12-25").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqual', () => {
      expect(() => parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00").eval(patient)).not.toThrow();
    });

    test('testDateNotEqualTimezoneOffsetBefore', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00-10:00").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqualTimezoneOffsetAfter', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00+10:00").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqualUTC', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00Z").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqualTimeSecond', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate != @T12:14:15").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqualTimeMinute', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate != @T12:14").eval(patient))).toBeTruthy();
    });

    test('testDateNotEqualToday', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate < today()").eval(patient))).toBeTruthy();
    });

    test.skip('testDateTimeGreaterThanDate', () => {
      expect(toBoolean(parseFhirPath("now() > Patient.birthDate").eval(patient))).toBeTruthy();
    });

    test.skip('testLiteralDateTimeTZGreater', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 > @2017-11-05T01:15:00.0-05:00").eval(patient)).toEqual([false]);
    });

    test('testLiteralDateTimeTZLess', () => {
      expect(toBoolean(parseFhirPath("@2017-11-05T01:30:00.0-04:00 < @2017-11-05T01:15:00.0-05:00").eval(patient))).toBeTruthy();
    });

    test.skip('testLiteralDateTimeTZEqualFalse', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 = @2017-11-05T01:15:00.0-05:00").eval(patient)).toEqual([false]);
    });

    test('testLiteralDateTimeTZEqualTrue', () => {
      expect(toBoolean(parseFhirPath("@2017-11-05T01:30:00.0-04:00 = @2017-11-05T00:30:00.0-05:00").eval(patient))).toBeTruthy();
    });

    test('testLiteralUnicode', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.first() = 'P\\u0065ter'").eval(patient))).toBeTruthy();
    });

    test('testCollectionNotEmpty', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.empty().not()").eval(patient))).toBeTruthy();
    });

    test('testCollectionNotEqualEmpty', () => {
      expect(() => parseFhirPath("Patient.name.given != {}").eval(patient)).not.toThrow();
    });

    test.skip('testExpressions', () => {
      expect(parseFhirPath("Patient.name.select(given | family).distinct()").eval(patient)).toEqual(["Peter", "James", "Chalmers", "Jim", "Windsor"]);
    });

    test('testExpressionsEqual', () => {
      expect(toBoolean(parseFhirPath("Patient.name.given.count() = 1 + 4").eval(patient))).toBeTruthy();
    });

    test('testNotEmpty', () => {
      expect(toBoolean(parseFhirPath("Patient.name.empty().not()").eval(patient))).toBeTruthy();
    });

    test.skip('testEmpty', () => {
      expect(toBoolean(parseFhirPath("Patient.link.empty()").eval(patient))).toBeTruthy();
    });

    test('testLiteralNotTrue', () => {
      expect(toBoolean(parseFhirPath("true.not() = false").eval(patient))).toBeTruthy();
    });

    test('testLiteralNotFalse', () => {
      expect(toBoolean(parseFhirPath("false.not() = true").eval(patient))).toBeTruthy();
    });

    test('testIntegerBooleanNotTrue', () => {
      expect(toBoolean(parseFhirPath("(0).not() = true").eval(patient))).toBeTruthy();
    });

    test('testIntegerBooleanNotFalse', () => {
      expect(toBoolean(parseFhirPath("(1).not() = false").eval(patient))).toBeTruthy();
    });

    test('testNotInvalid', () => {
      expect(() => parseFhirPath("(1|2).not() = false").eval(patient)).toThrow();
    });

  });

  describe.skip('testTypes', () => {

    test('testStringYearConvertsToDate', () => {
      expect(toBoolean(parseFhirPath("'2015'.convertsToDate()").eval(patient))).toBeTruthy();
    });

    test('testStringMonthConvertsToDate', () => {
      expect(toBoolean(parseFhirPath("'2015-02'.convertsToDate()").eval(patient))).toBeTruthy();
    });

    test('testStringDayConvertsToDate', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04'.convertsToDate()").eval(patient))).toBeTruthy();
    });

    test('testStringYearConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringMonthConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringDayConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringHourConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringMinuteConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14:34'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringSecondConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14:34:28'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringMillisecondConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14:34:28.123'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringUTCConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14:34:28Z'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringTZConvertsToDateTime', () => {
      expect(toBoolean(parseFhirPath("'2015-02-04T14:34:28+10:00'.convertsToDateTime()").eval(patient))).toBeTruthy();
    });

    test('testStringHourConvertsToTime', () => {
      expect(toBoolean(parseFhirPath("'14'.convertsToTime()").eval(patient))).toBeTruthy();
    });

    test('testStringMinuteConvertsToTime', () => {
      expect(toBoolean(parseFhirPath("'14:34'.convertsToTime()").eval(patient))).toBeTruthy();
    });

    test('testStringSecondConvertsToTime', () => {
      expect(toBoolean(parseFhirPath("'14:34:28'.convertsToTime()").eval(patient))).toBeTruthy();
    });

    test('testStringMillisecondConvertsToTime', () => {
      expect(toBoolean(parseFhirPath("'14:34:28.123'.convertsToTime()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralConvertsToInteger', () => {
      expect(toBoolean(parseFhirPath("1.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralIsInteger', () => {
      expect(toBoolean(parseFhirPath("1.is(Integer)").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralIsSystemInteger', () => {
      expect(toBoolean(parseFhirPath("1.is(System.Integer)").eval(patient))).toBeTruthy();
    });

    test('testStringLiteralConvertsToInteger', () => {
      expect(toBoolean(parseFhirPath("'1'.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testStringLiteralConvertsToIntegerFalse', () => {
      expect(toBoolean(parseFhirPath("'a'.convertsToInteger().not()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalConvertsToIntegerFalse', () => {
      expect(toBoolean(parseFhirPath("'1.0'.convertsToInteger().not()").eval(patient))).toBeTruthy();
    });

    test('testStringLiteralIsNotInteger', () => {
      expect(toBoolean(parseFhirPath("'1'.is(Integer).not()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralConvertsToInteger', () => {
      expect(toBoolean(parseFhirPath("true.convertsToInteger()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralIsNotInteger', () => {
      expect(toBoolean(parseFhirPath("true.is(Integer).not()").eval(patient))).toBeTruthy();
    });

    test('testDateIsNotInteger', () => {
      expect(toBoolean(parseFhirPath("@2013-04-05.is(Integer).not()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToInteger', () => {
      expect(toBoolean(parseFhirPath("1.toInteger() = 1").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralToInteger', () => {
      expect(toBoolean(parseFhirPath("'1'.toInteger() = 1").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralToInteger', () => {
      expect(() => parseFhirPath("'1.1'.toInteger() = {}").eval(patient)).not.toThrow();
    });

    test('testDecimalLiteralToIntegerIsEmpty', () => {
      expect(toBoolean(parseFhirPath("'1.1'.toInteger().empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralToInteger', () => {
      expect(toBoolean(parseFhirPath("true.toInteger() = 1").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralConvertsToDecimal', () => {
      expect(toBoolean(parseFhirPath("1.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralIsNotDecimal', () => {
      expect(toBoolean(parseFhirPath("1.is(Decimal).not()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralConvertsToDecimal', () => {
      expect(toBoolean(parseFhirPath("1.0.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralIsDecimal', () => {
      expect(toBoolean(parseFhirPath("1.0.is(Decimal)").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralConvertsToDecimal', () => {
      expect(toBoolean(parseFhirPath("'1'.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralIsNotDecimal', () => {
      expect(toBoolean(parseFhirPath("'1'.is(Decimal).not()").eval(patient))).toBeTruthy();
    });

    test('testStringLiteralConvertsToDecimalFalse', () => {
      expect(toBoolean(parseFhirPath("'1.a'.convertsToDecimal().not()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralConvertsToDecimal', () => {
      expect(toBoolean(parseFhirPath("'1.0'.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralIsNotDecimal', () => {
      expect(toBoolean(parseFhirPath("'1.0'.is(Decimal).not()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralConvertsToDecimal', () => {
      expect(toBoolean(parseFhirPath("true.convertsToDecimal()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralIsNotDecimal', () => {
      expect(toBoolean(parseFhirPath("true.is(Decimal).not()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToDecimal', () => {
      expect(toBoolean(parseFhirPath("1.toDecimal() = 1.0").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToDeciamlEquivalent', () => {
      expect(toBoolean(parseFhirPath("1.toDecimal() ~ 1.0").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralToDecimal', () => {
      expect(toBoolean(parseFhirPath("1.0.toDecimal() = 1.0").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralToDecimalEqual', () => {
      expect(toBoolean(parseFhirPath("'1.1'.toDecimal() = 1.1").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralToDecimal', () => {
      expect(toBoolean(parseFhirPath("true.toDecimal() = 1").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("1.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralIsNotQuantity', () => {
      expect(toBoolean(parseFhirPath("1.is(Quantity).not()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("1.0.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralIsNotQuantity', () => {
      expect(toBoolean(parseFhirPath("1.0.is(System.Quantity).not()").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1'.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralIsNotQuantity', () => {
      expect(toBoolean(parseFhirPath("'1'.is(System.Quantity).not()").eval(patient))).toBeTruthy();
    });

    test('testStringQuantityLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1 day'.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testStringQuantityWeekConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1 \\'wk\\''.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testStringQuantityWeekConvertsToQuantityFalse', () => {
      expect(toBoolean(parseFhirPath("'1 wk'.convertsToQuantity().not()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralConvertsToQuantityFalse', () => {
      expect(toBoolean(parseFhirPath("'1.a'.convertsToQuantity().not()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1.0'.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralIsNotSystemQuantity', () => {
      expect(toBoolean(parseFhirPath("'1.0'.is(System.Quantity).not()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralConvertsToQuantity', () => {
      expect(toBoolean(parseFhirPath("true.convertsToQuantity()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralIsNotSystemQuantity', () => {
      expect(toBoolean(parseFhirPath("true.is(System.Quantity).not()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("1.toQuantity() = 1 '1'").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("1.0.toQuantity() = 1.0 '1'").eval(patient))).toBeTruthy();
    });

    test('testStringIntegerLiteralToQuantity', () => {
      expect(parseFhirPath("'1'.toQuantity()").eval(patient)).toEqual(["1 '1'"]);
    });

    test('testStringQuantityLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1 day'.toQuantity() = 1 day").eval(patient))).toBeTruthy();
    });

    test('testStringQuantityDayLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1 day'.toQuantity() = 1 '{day}'").eval(patient))).toBeTruthy();
    });

    test('testStringQuantityWeekLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1 \\'wk\\''.toQuantity() = 1 'wk'").eval(patient))).toBeTruthy();
    });

    test('testStringDecimalLiteralToQuantity', () => {
      expect(toBoolean(parseFhirPath("'1.0'.toQuantity() ~ 1 '1'").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("1.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralConvertsToBooleanFalse', () => {
      expect(parseFhirPath("2.convertsToBoolean()").eval(patient)).toEqual([false]);
    });

    test('testNegativeIntegerLiteralConvertsToBooleanFalse', () => {
      expect(parseFhirPath("(-1).convertsToBoolean()").eval(patient)).toEqual([false]);
    });

    test('testIntegerLiteralFalseConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("0.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("1.0.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testStringTrueLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("'true'.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testStringFalseLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("'false'.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testStringFalseLiteralAlsoConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("'False'.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testTrueLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("true.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testFalseLiteralConvertsToBoolean', () => {
      expect(toBoolean(parseFhirPath("false.convertsToBoolean()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToBoolean', () => {
      expect(toBoolean(parseFhirPath("1.toBoolean()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToBooleanEmpty', () => {
      expect(() => parseFhirPath("2.toBoolean()").eval(patient)).not.toThrow();
    });

    test('testIntegerLiteralToBooleanFalse', () => {
      expect(parseFhirPath("0.toBoolean()").eval(patient)).toEqual([false]);
    });

    test('testStringTrueToBoolean', () => {
      expect(toBoolean(parseFhirPath("'true'.toBoolean()").eval(patient))).toBeTruthy();
    });

    test('testStringFalseToBoolean', () => {
      expect(parseFhirPath("'false'.toBoolean()").eval(patient)).toEqual([false]);
    });

    test('testIntegerLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("1.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralIsNotString', () => {
      expect(toBoolean(parseFhirPath("1.is(String).not()").eval(patient))).toBeTruthy();
    });

    test('testNegativeIntegerLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("(-1).convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testDecimalLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("1.0.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testStringLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("'true'.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("true.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testQuantityLiteralConvertsToString', () => {
      expect(toBoolean(parseFhirPath("1 'wk'.convertsToString()").eval(patient))).toBeTruthy();
    });

    test('testIntegerLiteralToString', () => {
      expect(parseFhirPath("1.toString()").eval(patient)).toEqual([1]);
    });

    test('testNegativeIntegerLiteralToString', () => {
      expect(parseFhirPath("(-1).toString()").eval(patient)).toEqual([-1]);
    });

    test('testDecimalLiteralToString', () => {
      expect(parseFhirPath("1.0.toString()").eval(patient)).toEqual([1]);
    });

    test('testStringLiteralToString', () => {
      expect(toBoolean(parseFhirPath("'true'.toString()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLiteralToString', () => {
      expect(toBoolean(parseFhirPath("true.toString()").eval(patient))).toBeTruthy();
    });

    test('testQuantityLiteralWkToString', () => {
      expect(parseFhirPath("1 'wk'.toString()").eval(patient)).toEqual(["1 'wk'"]);
    });

    test('testQuantityLiteralWeekToString', () => {
      expect(parseFhirPath("1 week.toString()").eval(patient)).toEqual(["1 '{week}'"]);
    });

  });

  describe.skip('testAll', () => {

    test('testAllTrue1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.select(given.exists()).allTrue()").eval(patient))).toBeTruthy();
    });

    test('testAllTrue2', () => {
      expect(parseFhirPath("Patient.name.select(period.exists()).allTrue()").eval(patient)).toEqual([false]);
    });

    test('testAllTrue3', () => {
      expect(toBoolean(parseFhirPath("Patient.name.all(given.exists())").eval(patient))).toBeTruthy();
    });

    test('testAllTrue4', () => {
      expect(parseFhirPath("Patient.name.all(period.exists())").eval(patient)).toEqual([false]);
    });

  });

  describe.skip('testSubSetOf', () => {

    test('testSubSetOf1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.first().subsetOf($this.name)").eval(patient))).toBeTruthy();
    });

    test('testSubSetOf2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.subsetOf($this.name.first()).not()").eval(patient))).toBeTruthy();
    });

  });

  describe('testSuperSetOf', () => {

    test('testSuperSetOf1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.first().supersetOf($this.name).not()").eval(patient))).toBeTruthy();
    });

    test('testSuperSetOf2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.supersetOf($this.name.first())").eval(patient))).toBeTruthy();
    });

  });

  describe('testQuantity', () => {

    test('testQuantity1', () => {
      expect(toBoolean(parseFhirPath("4.0000 'g' = 4000.0 'mg'").eval(patient))).toBeTruthy();
    });

    test('testQuantity2', () => {
      expect(toBoolean(parseFhirPath("4 'g' ~ 4000 'mg'").eval(patient))).toBeTruthy();
    });

    test('testQuantity3', () => {
      expect(toBoolean(parseFhirPath("4 'g' != 4040 'mg'").eval(patient))).toBeTruthy();
    });

    test('testQuantity4', () => {
      expect(toBoolean(parseFhirPath("4 'g' ~ 4040 'mg'").eval(patient))).toBeTruthy();
    });

    test('testQuantity5', () => {
      expect(toBoolean(parseFhirPath("7 days = 1 week").eval(patient))).toBeTruthy();
    });

    test('testQuantity6', () => {
      expect(toBoolean(parseFhirPath("7 days = 1 'wk'").eval(patient))).toBeTruthy();
    });

    test('testQuantity7', () => {
      expect(toBoolean(parseFhirPath("6 days < 1 week").eval(patient))).toBeTruthy();
    });

    test('testQuantity8', () => {
      expect(toBoolean(parseFhirPath("8 days > 1 week").eval(patient))).toBeTruthy();
    });

    test('testQuantity9', () => {
      expect(toBoolean(parseFhirPath("2.0 'cm' * 2.0 'm' = 0.040 'm2'").eval(patient))).toBeTruthy();
    });

    test('testQuantity10', () => {
      expect(toBoolean(parseFhirPath("4.0 'g' / 2.0 'm' = 2 'g/m'").eval(patient))).toBeTruthy();
    });

    test('testQuantity11', () => {
      expect(toBoolean(parseFhirPath("1.0 'm' / 1.0 'm' = 1 '1'").eval(patient))).toBeTruthy();
    });

  });

  describe('testCollectionBoolean', () => {

    test.skip('testCollectionBoolean1', () => {
      expect(() => parseFhirPath("iif(1 | 2 | 3, true, false)").eval(patient)).toThrow();
    });

    test.skip('testCollectionBoolean2', () => {
      expect(parseFhirPath("iif({}, true, false)").eval(patient)).toEqual([false]);
    });

    test('testCollectionBoolean3', () => {
      expect(toBoolean(parseFhirPath("iif(true, true, false)").eval(patient))).toBeTruthy();
    });

    test('testCollectionBoolean4', () => {
      expect(toBoolean(parseFhirPath("iif({} | true, true, false)").eval(patient))).toBeTruthy();
    });

    test('testCollectionBoolean5', () => {
      expect(toBoolean(parseFhirPath("iif(true, true, 1/0)").eval(patient))).toBeTruthy();
    });

    test('testCollectionBoolean6', () => {
      expect(toBoolean(parseFhirPath("iif(false, 1/0, true)").eval(patient))).toBeTruthy();
    });

  });

  describe('testDistinct', () => {

    test('testDistinct1', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3).isDistinct()").eval(patient))).toBeTruthy();
    });

    test('testDistinct2', () => {
      expect(toBoolean(parseFhirPath("Questionnaire.descendants().linkId.isDistinct()").eval(questionnaire))).toBeTruthy();
    });

    test('testDistinct3', () => {
      expect(toBoolean(parseFhirPath("Questionnaire.descendants().linkId.select(substring(0,1)).isDistinct().not()").eval(questionnaire))).toBeTruthy();
    });

    test('testDistinct4', () => {
      expect(parseFhirPath("(1 | 2 | 3).distinct()").eval(patient)).toEqual([1, 2, 3]);
    });

    test.skip('testDistinct5', () => {
      expect(parseFhirPath("Questionnaire.descendants().linkId.distinct().count()").eval(questionnaire)).toEqual([10]);
    });

    test.skip('testDistinct6', () => {
      expect(parseFhirPath("Questionnaire.descendants().linkId.select(substring(0,1)).distinct().count()").eval(questionnaire)).toEqual([2]);
    });

  });

  describe('testCount', () => {

    test('testCount1', () => {
      expect(parseFhirPath("Patient.name.count()").eval(patient)).toEqual([3]);
    });

    test('testCount2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.count() = 3").eval(patient))).toBeTruthy();
    });

    test('testCount3', () => {
      expect(parseFhirPath("Patient.name.first().count()").eval(patient)).toEqual([1]);
    });

    test('testCount4', () => {
      expect(toBoolean(parseFhirPath("Patient.name.first().count() = 1").eval(patient))).toBeTruthy();
    });

  });

  describe('testWhere', () => {

    test('testWhere1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.count() = 3").eval(patient))).toBeTruthy();
    });

    test('testWhere2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.where(given = 'Jim').count() = 1").eval(patient))).toBeTruthy();
    });

    test('testWhere3', () => {
      expect(toBoolean(parseFhirPath("Patient.name.where(given = 'X').count() = 0").eval(patient))).toBeTruthy();
    });

    test('testWhere4', () => {
      expect(toBoolean(parseFhirPath("Patient.name.where($this.given = 'Jim').count() = 1").eval(patient))).toBeTruthy();
    });

  });

  describe('testSelect', () => {

    test('testSelect1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.select(given).count() = 5").eval(patient))).toBeTruthy();
    });

    test('testSelect2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.select(given | family).count() = 7").eval(patient))).toBeTruthy();
    });

  });

  describe('testRepeat', () => {

    test('testRepeat1', () => {
      expect(toBoolean(parseFhirPath("ValueSet.expansion.repeat(contains).count() = 10").eval(valueset))).toBeTruthy();
    });

    test('testRepeat2', () => {
      expect(toBoolean(parseFhirPath("Questionnaire.repeat(item).code.count() = 11").eval(questionnaire))).toBeTruthy();
    });

    test('testRepeat3', () => {
      expect(toBoolean(parseFhirPath("Questionnaire.descendants().code.count() = 23").eval(questionnaire))).toBeTruthy();
    });

    test('testRepeat4', () => {
      expect(toBoolean(parseFhirPath("Questionnaire.children().code.count() = 2").eval(questionnaire))).toBeTruthy();
    });

  });

  describe.skip('testAggregate', () => {

    test('testAggregate1', () => {
      expect(toBoolean(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 0) = 45").eval(patient))).toBeTruthy();
    });

    test('testAggregate2', () => {
      expect(toBoolean(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 2) = 47").eval(patient))).toBeTruthy();
    });

    test('testAggregate3', () => {
      expect(toBoolean(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this < $total, $this, $total))) = 1").eval(patient))).toBeTruthy();
    });

    test('testAggregate4', () => {
      expect(toBoolean(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this > $total, $this, $total))) = 9").eval(patient))).toBeTruthy();
    });

  });

  describe('testIndexer', () => {

    test('testIndexer1', () => {
      expect(toBoolean(parseFhirPath("Patient.name[0].given = 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

    test('testIndexer2', () => {
      expect(toBoolean(parseFhirPath("Patient.name[1].given = 'Jim'").eval(patient))).toBeTruthy();
    });

  });

  describe('testSingle', () => {

    test('testSingle1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.first().single().exists()").eval(patient))).toBeTruthy();
    });

    test('testSingle2', () => {
      expect(() => parseFhirPath("Patient.name.single().exists()").eval(patient)).toThrow();
    });

  });

  describe('testFirstLast', () => {

    test('testFirstLast1', () => {
      expect(toBoolean(parseFhirPath("Patient.name.first().given = 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

    test('testFirstLast2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.last().given = 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

  });

  describe('testTail', () => {

    test('testTail1', () => {
      expect(toBoolean(parseFhirPath("(0 | 1 | 2).tail() = 1 | 2").eval(patient))).toBeTruthy();
    });

    test('testTail2', () => {
      expect(toBoolean(parseFhirPath("Patient.name.tail().given = 'Jim' | 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

  });

  describe('testSkip', () => {

    test('testSkip1', () => {
      expect(toBoolean(parseFhirPath("(0 | 1 | 2).skip(1) = 1 | 2").eval(patient))).toBeTruthy();
    });

    test('testSkip2', () => {
      expect(toBoolean(parseFhirPath("(0 | 1 | 2).skip(2) = 2").eval(patient))).toBeTruthy();
    });

    test('testSkip3', () => {
      expect(toBoolean(parseFhirPath("Patient.name.skip(1).given.trace('test') = 'Jim' | 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

    test('testSkip4', () => {
      expect(toBoolean(parseFhirPath("Patient.name.skip(3).given.exists() = false").eval(patient))).toBeTruthy();
    });

  });

  describe('testTake', () => {

    test('testTake1', () => {
      expect(toBoolean(parseFhirPath("(0 | 1 | 2).take(1) = 0").eval(patient))).toBeTruthy();
    });

    test('testTake2', () => {
      expect(toBoolean(parseFhirPath("(0 | 1 | 2).take(2) = 0 | 1").eval(patient))).toBeTruthy();
    });

    test('testTake3', () => {
      expect(toBoolean(parseFhirPath("Patient.name.take(1).given = 'Peter' | 'James'").eval(patient))).toBeTruthy();
    });

    test('testTake4', () => {
      expect(toBoolean(parseFhirPath("Patient.name.take(2).given = 'Peter' | 'James' | 'Jim'").eval(patient))).toBeTruthy();
    });

    test('testTake5', () => {
      expect(toBoolean(parseFhirPath("Patient.name.take(3).given.count() = 5").eval(patient))).toBeTruthy();
    });

    test('testTake6', () => {
      expect(toBoolean(parseFhirPath("Patient.name.take(4).given.count() = 5").eval(patient))).toBeTruthy();
    });

    test('testTake7', () => {
      expect(toBoolean(parseFhirPath("Patient.name.take(0).given.exists() = false").eval(patient))).toBeTruthy();
    });

  });

  describe('testIif', () => {

    test('testIif1', () => {
      expect(toBoolean(parseFhirPath("iif(Patient.name.exists(), 'named', 'unnamed') = 'named'").eval(patient))).toBeTruthy();
    });

    test('testIif2', () => {
      expect(toBoolean(parseFhirPath("iif(Patient.name.empty(), 'unnamed', 'named') = 'named'").eval(patient))).toBeTruthy();
    });

    test('testIif3', () => {
      expect(toBoolean(parseFhirPath("iif(true, true, (1 | 2).toString())").eval(patient))).toBeTruthy();
    });

    test('testIif4', () => {
      expect(toBoolean(parseFhirPath("iif(false, (1 | 2).toString(), true)").eval(patient))).toBeTruthy();
    });

  });

  describe('testToInteger', () => {

    test('testToInteger1', () => {
      expect(toBoolean(parseFhirPath("'1'.toInteger() = 1").eval(patient))).toBeTruthy();
    });

    test('testToInteger2', () => {
      expect(toBoolean(parseFhirPath("'-1'.toInteger() = -1").eval(patient))).toBeTruthy();
    });

    test('testToInteger3', () => {
      expect(toBoolean(parseFhirPath("'0'.toInteger() = 0").eval(patient))).toBeTruthy();
    });

    test('testToInteger4', () => {
      expect(toBoolean(parseFhirPath("'0.0'.toInteger().empty()").eval(patient))).toBeTruthy();
    });

    test('testToInteger5', () => {
      expect(toBoolean(parseFhirPath("'st'.toInteger().empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testToDecimal', () => {

    test('testToDecimal1', () => {
      expect(toBoolean(parseFhirPath("'1'.toDecimal() = 1").eval(patient))).toBeTruthy();
    });

    test('testToDecimal2', () => {
      expect(toBoolean(parseFhirPath("'-1'.toInteger() = -1").eval(patient))).toBeTruthy();
    });

    test('testToDecimal3', () => {
      expect(toBoolean(parseFhirPath("'0'.toDecimal() = 0").eval(patient))).toBeTruthy();
    });

    test('testToDecimal4', () => {
      expect(toBoolean(parseFhirPath("'0.0'.toDecimal() = 0.0").eval(patient))).toBeTruthy();
    });

    test('testToDecimal5', () => {
      expect(toBoolean(parseFhirPath("'st'.toDecimal().empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testToString', () => {

    test('testToString1', () => {
      expect(toBoolean(parseFhirPath("1.toString() = '1'").eval(patient))).toBeTruthy();
    });

    test('testToString2', () => {
      expect(toBoolean(parseFhirPath("'-1'.toInteger() = -1").eval(patient))).toBeTruthy();
    });

    test('testToString3', () => {
      expect(toBoolean(parseFhirPath("0.toString() = '0'").eval(patient))).toBeTruthy();
    });

    test('testToString4', () => {
      expect(toBoolean(parseFhirPath("0.0.toString() = '0.0'").eval(patient))).toBeTruthy();
    });

    test('testToString5', () => {
      expect(toBoolean(parseFhirPath("@2014-12-14.toString() = '2014-12-14'").eval(patient))).toBeTruthy();
    });

  });

  describe('testCase', () => {

    test('testCase1', () => {
      expect(toBoolean(parseFhirPath("'t'.upper() = 'T'").eval(patient))).toBeTruthy();
    });

    test('testCase2', () => {
      expect(toBoolean(parseFhirPath("'t'.lower() = 't'").eval(patient))).toBeTruthy();
    });

    test('testCase3', () => {
      expect(toBoolean(parseFhirPath("'T'.upper() = 'T'").eval(patient))).toBeTruthy();
    });

    test('testCase4', () => {
      expect(toBoolean(parseFhirPath("'T'.lower() = 't'").eval(patient))).toBeTruthy();
    });

  });

  describe('testToChars', () => {

    test('testToChars1', () => {
      expect(toBoolean(parseFhirPath("'t2'.toChars() = 't' | '2'").eval(patient))).toBeTruthy();
    });

  });

  describe('testSubstring', () => {

    test('testSubstring1', () => {
      expect(toBoolean(parseFhirPath("'12345'.substring(2) = '345'").eval(patient))).toBeTruthy();
    });

    test('testSubstring2', () => {
      expect(toBoolean(parseFhirPath("'12345'.substring(2,1) = '3'").eval(patient))).toBeTruthy();
    });

    test('testSubstring3', () => {
      expect(toBoolean(parseFhirPath("'12345'.substring(2,5) = '345'").eval(patient))).toBeTruthy();
    });

    test('testSubstring4', () => {
      expect(toBoolean(parseFhirPath("'12345'.substring(25).empty()").eval(patient))).toBeTruthy();
    });

    test('testSubstring5', () => {
      expect(toBoolean(parseFhirPath("'12345'.substring(-1).empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testStartsWith', () => {

    test('testStartsWith1', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('2') = false").eval(patient))).toBeTruthy();
    });

    test('testStartsWith2', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('1') = true").eval(patient))).toBeTruthy();
    });

    test('testStartsWith3', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('12') = true").eval(patient))).toBeTruthy();
    });

    test('testStartsWith4', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('13') = false").eval(patient))).toBeTruthy();
    });

    test('testStartsWith5', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('12345') = true").eval(patient))).toBeTruthy();
    });

    test('testStartsWith6', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('123456') = false").eval(patient))).toBeTruthy();
    });

    test('testStartsWith7', () => {
      expect(toBoolean(parseFhirPath("'12345'.startsWith('') = true").eval(patient))).toBeTruthy();
    });

  });

  describe('testEndsWith', () => {

    test('testEndsWith1', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('2') = false").eval(patient))).toBeTruthy();
    });

    test('testEndsWith2', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('5') = true").eval(patient))).toBeTruthy();
    });

    test('testEndsWith3', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('45') = true").eval(patient))).toBeTruthy();
    });

    test('testEndsWith4', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('35') = false").eval(patient))).toBeTruthy();
    });

    test('testEndsWith5', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('12345') = true").eval(patient))).toBeTruthy();
    });

    test('testEndsWith6', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('012345') = false").eval(patient))).toBeTruthy();
    });

    test('testEndsWith7', () => {
      expect(toBoolean(parseFhirPath("'12345'.endsWith('') = true").eval(patient))).toBeTruthy();
    });

  });

  describe('testContainsString', () => {

    test('testContainsString1', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('6') = false").eval(patient))).toBeTruthy();
    });

    test('testContainsString2', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('5') = true").eval(patient))).toBeTruthy();
    });

    test('testContainsString3', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('45') = true").eval(patient))).toBeTruthy();
    });

    test('testContainsString4', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('35') = false").eval(patient))).toBeTruthy();
    });

    test('testContainsString5', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('12345') = true").eval(patient))).toBeTruthy();
    });

    test('testContainsString6', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('012345') = false").eval(patient))).toBeTruthy();
    });

    test('testContainsString7', () => {
      expect(toBoolean(parseFhirPath("'12345'.contains('') = true").eval(patient))).toBeTruthy();
    });

  });

  describe('testLength', () => {

    test('testLength1', () => {
      expect(toBoolean(parseFhirPath("'123456'.length() = 6").eval(patient))).toBeTruthy();
    });

    test('testLength2', () => {
      expect(toBoolean(parseFhirPath("'12345'.length() = 5").eval(patient))).toBeTruthy();
    });

    test('testLength3', () => {
      expect(toBoolean(parseFhirPath("'123'.length() = 3").eval(patient))).toBeTruthy();
    });

    test('testLength4', () => {
      expect(toBoolean(parseFhirPath("'1'.length() = 1").eval(patient))).toBeTruthy();
    });

    test('testLength5', () => {
      expect(toBoolean(parseFhirPath("''.length() = 0").eval(patient))).toBeTruthy();
    });

  });

  describe('testTrace', () => {

    test('testTrace1', () => {
      expect(toBoolean(parseFhirPath("name.given.trace('test').count() = 5").eval(patient))).toBeTruthy();
    });

    test('testTrace2', () => {
      expect(toBoolean(parseFhirPath("name.trace('test', given).count() = 3").eval(patient))).toBeTruthy();
    });

  });

  describe('testToday', () => {

    test('testToday1', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate < today()").eval(patient))).toBeTruthy();
    });

    test('testToday2', () => {
      expect(toBoolean(parseFhirPath("today().toString().length() = 10").eval(patient))).toBeTruthy();
    });

  });

  describe('testNow', () => {

    test('testNow1', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate < now()").eval(patient))).toBeTruthy();
    });

    test('testNow2', () => {
      expect(toBoolean(parseFhirPath("now().toString().length() > 10").eval(patient))).toBeTruthy();
    });

  });

  describe('testEquality', () => {

    test('testEquality1', () => {
      expect(toBoolean(parseFhirPath("1 = 1").eval(patient))).toBeTruthy();
    });

    test('testEquality2', () => {
      expect(() => parseFhirPath("{} = {}").eval(patient)).not.toThrow();
    });

    test('testEquality3', () => {
      expect(() => parseFhirPath("true = {}").eval(patient)).not.toThrow();
    });

    test('testEquality4', () => {
      expect(toBoolean(parseFhirPath("(1) = (1)").eval(patient))).toBeTruthy();
    });

    test('testEquality5', () => {
      expect(toBoolean(parseFhirPath("(1 | 2) = (1 | 2)").eval(patient))).toBeTruthy();
    });

    test('testEquality6', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3) = (1 | 2 | 3)").eval(patient))).toBeTruthy();
    });

    test('testEquality7', () => {
      expect(() => parseFhirPath("(1 | 1) = (1 | 2 | {})").eval(patient)).not.toThrow();
    });

    test('testEquality8', () => {
      expect(parseFhirPath("1 = 2").eval(patient)).toEqual([false]);
    });

    test('testEquality9', () => {
      expect(toBoolean(parseFhirPath("'a' = 'a'").eval(patient))).toBeTruthy();
    });

    test('testEquality10', () => {
      expect(parseFhirPath("'a' = 'A'").eval(patient)).toEqual([false]);
    });

    test('testEquality11', () => {
      expect(parseFhirPath("'a' = 'b'").eval(patient)).toEqual([false]);
    });

    test('testEquality12', () => {
      expect(toBoolean(parseFhirPath("1.1 = 1.1").eval(patient))).toBeTruthy();
    });

    test('testEquality13', () => {
      expect(parseFhirPath("1.1 = 1.2").eval(patient)).toEqual([false]);
    });

    test('testEquality14', () => {
      expect(toBoolean(parseFhirPath("1.10 = 1.1").eval(patient))).toBeTruthy();
    });

    test('testEquality15', () => {
      expect(toBoolean(parseFhirPath("0 = 0").eval(patient))).toBeTruthy();
    });

    test('testEquality16', () => {
      expect(toBoolean(parseFhirPath("0.0 = 0").eval(patient))).toBeTruthy();
    });

    test('testEquality17', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15 = @2012-04-15").eval(patient))).toBeTruthy();
    });

    test('testEquality18', () => {
      expect(parseFhirPath("@2012-04-15 = @2012-04-16").eval(patient)).toEqual([false]);
    });

    test('testEquality19', () => {
      expect(() => parseFhirPath("@2012-04-15 = @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testEquality20', () => {
      expect(parseFhirPath("@2012-04-15T15:00:00 = @2012-04-15T10:00:00").eval(patient)).toEqual([false]);
    });

    test('testEquality21', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:30:31 = @2012-04-15T15:30:31.0").eval(patient))).toBeTruthy();
    });

    test('testEquality22', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 = @2012-04-15T15:30:31.1").eval(patient)).toEqual([false]);
    });

    test('testEquality23', () => {
      expect(() => parseFhirPath("@2012-04-15T15:00:00Z = @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testEquality24', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:00:00+02:00 = @2012-04-15T16:00:00+03:00").eval(patient))).toBeTruthy();
    });

    test('testEquality25', () => {
      expect(toBoolean(parseFhirPath("name = name").eval(patient))).toBeTruthy();
    });

    test('testEquality26', () => {
      expect(toBoolean(parseFhirPath("name.take(2) = name.take(2).first() | name.take(2).last()").eval(patient))).toBeTruthy();
    });

    test('testEquality27', () => {
      expect(parseFhirPath("name.take(2) = name.take(2).last() | name.take(2).first()").eval(patient)).toEqual([false]);
    });

    test('testEquality28', () => {
      expect(toBoolean(parseFhirPath("Observation.value = 185 '[lb_av]'").eval(observation))).toBeTruthy();
    });

  });

  describe('testNEquality', () => {

    test('testNEquality1', () => {
      expect(parseFhirPath("1 != 1").eval(patient)).toEqual([false]);
    });

    test('testNEquality2', () => {
      expect(() => parseFhirPath("{} != {}").eval(patient)).not.toThrow();
    });

    test('testNEquality3', () => {
      expect(toBoolean(parseFhirPath("1 != 2").eval(patient))).toBeTruthy();
    });

    test('testNEquality4', () => {
      expect(parseFhirPath("'a' != 'a'").eval(patient)).toEqual([false]);
    });

    test('testNEquality5', () => {
      expect(toBoolean(parseFhirPath("'a' != 'b'").eval(patient))).toBeTruthy();
    });

    test('testNEquality6', () => {
      expect(parseFhirPath("1.1 != 1.1").eval(patient)).toEqual([false]);
    });

    test('testNEquality7', () => {
      expect(toBoolean(parseFhirPath("1.1 != 1.2").eval(patient))).toBeTruthy();
    });

    test('testNEquality8', () => {
      expect(parseFhirPath("1.10 != 1.1").eval(patient)).toEqual([false]);
    });

    test('testNEquality9', () => {
      expect(parseFhirPath("0 != 0").eval(patient)).toEqual([false]);
    });

    test('testNEquality10', () => {
      expect(parseFhirPath("0.0 != 0").eval(patient)).toEqual([false]);
    });

    test('testNEquality11', () => {
      expect(parseFhirPath("@2012-04-15 != @2012-04-15").eval(patient)).toEqual([false]);
    });

    test('testNEquality12', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15 != @2012-04-16").eval(patient))).toBeTruthy();
    });

    test('testNEquality13', () => {
      expect(() => parseFhirPath("@2012-04-15 != @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testNEquality14', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:00:00 != @2012-04-15T10:00:00").eval(patient))).toBeTruthy();
    });

    test('testNEquality15', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 != @2012-04-15T15:30:31.0").eval(patient)).toEqual([false]);
    });

    test('testNEquality16', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:30:31 != @2012-04-15T15:30:31.1").eval(patient))).toBeTruthy();
    });

    test('testNEquality17', () => {
      expect(() => parseFhirPath("@2012-04-15T15:00:00Z != @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testNEquality18', () => {
      expect(parseFhirPath("@2012-04-15T15:00:00+02:00 != @2012-04-15T16:00:00+03:00").eval(patient)).toEqual([false]);
    });

    test('testNEquality19', () => {
      expect(parseFhirPath("name != name").eval(patient)).toEqual([false]);
    });

    test.skip('testNEquality20', () => {
      expect(parseFhirPath("name.take(2) != name.take(2).first() | name.take(2).last()").eval(patient)).toEqual([false]);
    });

    test('testNEquality21', () => {
      expect(toBoolean(parseFhirPath("name.take(2) != name.take(2).last() | name.take(2).first()").eval(patient))).toBeTruthy();
    });

    test('testNEquality22', () => {
      expect(toBoolean(parseFhirPath("1.2 / 1.8 != 0.6666667").eval(patient))).toBeTruthy();
    });

    test('testNEquality23', () => {
      expect(toBoolean(parseFhirPath("1.2 / 1.8 != 0.67").eval(patient))).toBeTruthy();
    });

    test('testNEquality24', () => {
      expect(toBoolean(parseFhirPath("Observation.value != 185 'kg'").eval(observation))).toBeTruthy();
    });

  });

  describe('testEquivalent', () => {

    test('testEquivalent1', () => {
      expect(toBoolean(parseFhirPath("1 ~ 1").eval(patient))).toBeTruthy();
    });

    test('testEquivalent2', () => {
      expect(toBoolean(parseFhirPath("{} ~ {}").eval(patient))).toBeTruthy();
    });

    test('testEquivalent3', () => {
      expect(parseFhirPath("1 ~ {}").eval(patient)).toEqual([false]);
    });

    test('testEquivalent4', () => {
      expect(parseFhirPath("1 ~ 2").eval(patient)).toEqual([false]);
    });

    test('testEquivalent5', () => {
      expect(toBoolean(parseFhirPath("'a' ~ 'a'").eval(patient))).toBeTruthy();
    });

    test('testEquivalent6', () => {
      expect(toBoolean(parseFhirPath("'a' ~ 'A'").eval(patient))).toBeTruthy();
    });

    test('testEquivalent7', () => {
      expect(parseFhirPath("'a' ~ 'b'").eval(patient)).toEqual([false]);
    });

    test('testEquivalent8', () => {
      expect(toBoolean(parseFhirPath("1.1 ~ 1.1").eval(patient))).toBeTruthy();
    });

    test('testEquivalent9', () => {
      expect(parseFhirPath("1.1 ~ 1.2").eval(patient)).toEqual([false]);
    });

    test('testEquivalent10', () => {
      expect(toBoolean(parseFhirPath("1.10 ~ 1.1").eval(patient))).toBeTruthy();
    });

    test('testEquivalent11', () => {
      expect(toBoolean(parseFhirPath("1.2 / 1.8 ~ 0.67").eval(patient))).toBeTruthy();
    });

    test('testEquivalent12', () => {
      expect(toBoolean(parseFhirPath("0 ~ 0").eval(patient))).toBeTruthy();
    });

    test('testEquivalent13', () => {
      expect(toBoolean(parseFhirPath("0.0 ~ 0").eval(patient))).toBeTruthy();
    });

    test('testEquivalent14', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15 ~ @2012-04-15").eval(patient))).toBeTruthy();
    });

    test('testEquivalent15', () => {
      expect(parseFhirPath("@2012-04-15 ~ @2012-04-16").eval(patient)).toEqual([false]);
    });

    test('testEquivalent16', () => {
      expect(parseFhirPath("@2012-04-15 ~ @2012-04-15T10:00:00").eval(patient)).toEqual([false]);
    });

    test('testEquivalent17', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.0").eval(patient))).toBeTruthy();
    });

    test('testEquivalent18', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.1").eval(patient)).toEqual([false]);
    });

    test('testEquivalent19', () => {
      expect(toBoolean(parseFhirPath("name ~ name").eval(patient))).toBeTruthy();
    });

    test('testEquivalent20', () => {
      expect(toBoolean(parseFhirPath("name.take(2).given ~ name.take(2).first().given | name.take(2).last().given").eval(patient))).toBeTruthy();
    });

    test('testEquivalent21', () => {
      expect(toBoolean(parseFhirPath("name.take(2).given ~ name.take(2).last().given | name.take(2).first().given").eval(patient))).toBeTruthy();
    });

    test('testEquivalent22', () => {
      expect(toBoolean(parseFhirPath("Observation.value ~ 185 '[lb_av]'").eval(observation))).toBeTruthy();
    });

  });

  describe('testNotEquivalent', () => {

    test('testNotEquivalent1', () => {
      expect(parseFhirPath("1 !~ 1").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent2', () => {
      expect(parseFhirPath("{} !~ {}").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent3', () => {
      expect(toBoolean(parseFhirPath("{} !~ 1").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent4', () => {
      expect(toBoolean(parseFhirPath("1 !~ 2").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent5', () => {
      expect(parseFhirPath("'a' !~ 'a'").eval(patient)).toEqual([false]);
    });

    test.skip('testNotEquivalent6', () => {
      expect(parseFhirPath("'a' !~ 'A'").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent7', () => {
      expect(toBoolean(parseFhirPath("'a' !~ 'b'").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent8', () => {
      expect(parseFhirPath("1.1 !~ 1.1").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent9', () => {
      expect(toBoolean(parseFhirPath("1.1 !~ 1.2").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent10', () => {
      expect(parseFhirPath("1.10 !~ 1.1").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent11', () => {
      expect(parseFhirPath("0 !~ 0").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent12', () => {
      expect(parseFhirPath("0.0 !~ 0").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent13', () => {
      expect(toBoolean(parseFhirPath("1.2 / 1.8 !~ 0.6").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent14', () => {
      expect(parseFhirPath("@2012-04-15 !~ @2012-04-15").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent15', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15 !~ @2012-04-16").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent16', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15 !~ @2012-04-15T10:00:00").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent17', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.0").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent18', () => {
      expect(toBoolean(parseFhirPath("@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.1").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent19', () => {
      expect(toBoolean(parseFhirPath("name !~ name").eval(patient))).toBeTruthy();
    });

    test('testNotEquivalent20', () => {
      expect(parseFhirPath("name.take(2).given !~ name.take(2).first().given | name.take(2).last().given").eval(patient)).toEqual([false]);
    });

    test.skip('testNotEquivalent21', () => {
      expect(parseFhirPath("name.take(2).given !~ name.take(2).last().given | name.take(2).first().given").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent22', () => {
      expect(toBoolean(parseFhirPath("Observation.value !~ 185 'kg'").eval(observation))).toBeTruthy();
    });

  });

  describe('testLessThan', () => {

    test('testLessThan1', () => {
      expect(toBoolean(parseFhirPath("1 < 2").eval(patient))).toBeTruthy();
    });

    test('testLessThan2', () => {
      expect(toBoolean(parseFhirPath("1.0 < 1.2").eval(patient))).toBeTruthy();
    });

    test('testLessThan3', () => {
      expect(toBoolean(parseFhirPath("'a' < 'b'").eval(patient))).toBeTruthy();
    });

    test('testLessThan4', () => {
      expect(toBoolean(parseFhirPath("'A' < 'a'").eval(patient))).toBeTruthy();
    });

    test('testLessThan5', () => {
      expect(toBoolean(parseFhirPath("@2014-12-12 < @2014-12-13").eval(patient))).toBeTruthy();
    });

    test('testLessThan6', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:00 < @2014-12-13T12:00:01").eval(patient))).toBeTruthy();
    });

    test('testLessThan7', () => {
      expect(toBoolean(parseFhirPath("@T12:00:00 < @T14:00:00").eval(patient))).toBeTruthy();
    });

    test('testLessThan8', () => {
      expect(parseFhirPath("1 < 1").eval(patient)).toEqual([false]);
    });

    test('testLessThan9', () => {
      expect(parseFhirPath("1.0 < 1.0").eval(patient)).toEqual([false]);
    });

    test('testLessThan10', () => {
      expect(parseFhirPath("'a' < 'a'").eval(patient)).toEqual([false]);
    });

    test('testLessThan11', () => {
      expect(parseFhirPath("'A' < 'A'").eval(patient)).toEqual([false]);
    });

    test('testLessThan12', () => {
      expect(parseFhirPath("@2014-12-12 < @2014-12-12").eval(patient)).toEqual([false]);
    });

    test('testLessThan13', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 < @2014-12-13T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testLessThan14', () => {
      expect(parseFhirPath("@T12:00:00 < @T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testLessThan15', () => {
      expect(parseFhirPath("2 < 1").eval(patient)).toEqual([false]);
    });

    test('testLessThan16', () => {
      expect(parseFhirPath("1.1 < 1.0").eval(patient)).toEqual([false]);
    });

    test('testLessThan17', () => {
      expect(parseFhirPath("'b' < 'a'").eval(patient)).toEqual([false]);
    });

    test('testLessThan18', () => {
      expect(parseFhirPath("'B' < 'A'").eval(patient)).toEqual([false]);
    });

    test('testLessThan19', () => {
      expect(parseFhirPath("@2014-12-13 < @2014-12-12").eval(patient)).toEqual([false]);
    });

    test('testLessThan20', () => {
      expect(parseFhirPath("@2014-12-13T12:00:01 < @2014-12-13T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testLessThan21', () => {
      expect(parseFhirPath("@T12:00:01 < @T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testLessThan22', () => {
      expect(toBoolean(parseFhirPath("Observation.value < 200 '[lb_av]'").eval(observation))).toBeTruthy();
    });

    test('testLessThan23', () => {
      expect(() => parseFhirPath("@2018-03 < @2018-03-01").eval(patient)).not.toThrow();
    });

    test('testLessThan24', () => {
      expect(() => parseFhirPath("@2018-03-01T10 < @2018-03-01T10:30").eval(patient)).not.toThrow();
    });

    test('testLessThan25', () => {
      expect(() => parseFhirPath("@T10 < @T10:30").eval(patient)).not.toThrow();
    });

    test('testLessThan26', () => {
      expect(parseFhirPath("@2018-03-01T10:30:00 < @2018-03-01T10:30:00.0").eval(patient)).toEqual([false]);
    });

    test('testLessThan27', () => {
      expect(parseFhirPath("@T10:30:00 < @T10:30:00.0").eval(patient)).toEqual([false]);
    });

  });

  describe('testLessOrEqual', () => {

    test('testLessOrEqual1', () => {
      expect(toBoolean(parseFhirPath("1 <= 2").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual2', () => {
      expect(toBoolean(parseFhirPath("1.0 <= 1.2").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual3', () => {
      expect(toBoolean(parseFhirPath("'a' <= 'b'").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual4', () => {
      expect(toBoolean(parseFhirPath("'A' <= 'a'").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual5', () => {
      expect(toBoolean(parseFhirPath("@2014-12-12 <= @2014-12-13").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual6', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:00 <= @2014-12-13T12:00:01").eval(patient))).toBeTruthy();
    });

    test.skip('testLessOrEqual7', () => {
      expect(toBoolean(parseFhirPath("@T12:00:00 <= @T14:00:00").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual8', () => {
      expect(toBoolean(parseFhirPath("1 <= 1").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual9', () => {
      expect(toBoolean(parseFhirPath("1.0 <= 1.0").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual10', () => {
      expect(toBoolean(parseFhirPath("'a' <= 'a'").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual11', () => {
      expect(toBoolean(parseFhirPath("'A' <= 'A'").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual12', () => {
      expect(toBoolean(parseFhirPath("@2014-12-12 <= @2014-12-12").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual13', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:00 <= @2014-12-13T12:00:00").eval(patient))).toBeTruthy();
    });

    test.skip('testLessOrEqual14', () => {
      expect(toBoolean(parseFhirPath("@T12:00:00 <= @T12:00:00").eval(patient))).toBeTruthy();
    });

    test('testLessOrEqual15', () => {
      expect(parseFhirPath("2 <= 1").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual16', () => {
      expect(parseFhirPath("1.1 <= 1.0").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual17', () => {
      expect(parseFhirPath("'b' <= 'a'").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual18', () => {
      expect(parseFhirPath("'B' <= 'A'").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual19', () => {
      expect(parseFhirPath("@2014-12-13 <= @2014-12-12").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual20', () => {
      expect(parseFhirPath("@2014-12-13T12:00:01 <= @2014-12-13T12:00:00").eval(patient)).toEqual([false]);
    });

    test.skip('testLessOrEqual21', () => {
      expect(parseFhirPath("@T12:00:01 <= @T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testLessOrEqual22', () => {
      expect(toBoolean(parseFhirPath("Observation.value <= 200 '[lb_av]'").eval(observation))).toBeTruthy();
    });

    test('testLessOrEqual23', () => {
      expect(() => parseFhirPath("@2018-03 <= @2018-03-01").eval(patient)).not.toThrow();
    });

    test.skip('testLessOrEqual24', () => {
      expect(() => parseFhirPath("@2018-03-01T10 <= @2018-03-01T10:30").eval(patient)).not.toThrow();
    });

    test.skip('testLessOrEqual25', () => {
      expect(() => parseFhirPath("@T10 <= @T10:30").eval(patient)).not.toThrow();
    });

    test('testLessOrEqual26', () => {
      expect(toBoolean(parseFhirPath("@2018-03-01T10:30:00  <= @2018-03-01T10:30:00.0").eval(patient))).toBeTruthy();
    });

    test.skip('testLessOrEqual27', () => {
      expect(toBoolean(parseFhirPath("@T10:30:00 <= @T10:30:00.0").eval(patient))).toBeTruthy();
    });

  });

  describe('testGreatorOrEqual', () => {

    test('testGreatorOrEqual1', () => {
      expect(parseFhirPath("1 >= 2").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual2', () => {
      expect(parseFhirPath("1.0 >= 1.2").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual3', () => {
      expect(parseFhirPath("'a' >= 'b'").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual4', () => {
      expect(parseFhirPath("'A' >= 'a'").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual5', () => {
      expect(parseFhirPath("@2014-12-12 >= @2014-12-13").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual6', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 >= @2014-12-13T12:00:01").eval(patient)).toEqual([false]);
    });

    test.skip('testGreatorOrEqual7', () => {
      expect(parseFhirPath("@T12:00:00 >= @T14:00:00").eval(patient)).toEqual([false]);
    });

    test('testGreatorOrEqual8', () => {
      expect(toBoolean(parseFhirPath("1 >= 1").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual9', () => {
      expect(toBoolean(parseFhirPath("1.0 >= 1.0").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual10', () => {
      expect(toBoolean(parseFhirPath("'a' >= 'a'").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual11', () => {
      expect(toBoolean(parseFhirPath("'A' >= 'A'").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual12', () => {
      expect(toBoolean(parseFhirPath("@2014-12-12 >= @2014-12-12").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual13', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:00 >= @2014-12-13T12:00:00").eval(patient))).toBeTruthy();
    });

    test.skip('testGreatorOrEqual14', () => {
      expect(toBoolean(parseFhirPath("@T12:00:00 >= @T12:00:00").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual15', () => {
      expect(toBoolean(parseFhirPath("2 >= 1").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual16', () => {
      expect(toBoolean(parseFhirPath("1.1 >= 1.0").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual17', () => {
      expect(toBoolean(parseFhirPath("'b' >= 'a'").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual18', () => {
      expect(toBoolean(parseFhirPath("'B' >= 'A'").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual19', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13 >= @2014-12-12").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual20', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:01 >= @2014-12-13T12:00:00").eval(patient))).toBeTruthy();
    });

    test.skip('testGreatorOrEqual21', () => {
      expect(toBoolean(parseFhirPath("@T12:00:01 >= @T12:00:00").eval(patient))).toBeTruthy();
    });

    test('testGreatorOrEqual22', () => {
      expect(toBoolean(parseFhirPath("Observation.value >= 100 '[lb_av]'").eval(observation))).toBeTruthy();
    });

    test('testGreatorOrEqual23', () => {
      expect(() => parseFhirPath("@2018-03 >= @2018-03-01").eval(patient)).not.toThrow();
    });

    test.skip('testGreatorOrEqual24', () => {
      expect(() => parseFhirPath("@2018-03-01T10 >= @2018-03-01T10:30").eval(patient)).not.toThrow();
    });

    test.skip('testGreatorOrEqual25', () => {
      expect(() => parseFhirPath("@T10 >= @T10:30").eval(patient)).not.toThrow();
    });

    test('testGreatorOrEqual26', () => {
      expect(toBoolean(parseFhirPath("@2018-03-01T10:30:00 >= @2018-03-01T10:30:00.0").eval(patient))).toBeTruthy();
    });

    test.skip('testGreatorOrEqual27', () => {
      expect(toBoolean(parseFhirPath("@T10:30:00 >= @T10:30:00.0").eval(patient))).toBeTruthy();
    });

  });

  describe('testGreaterThan', () => {

    test('testGreaterThan1', () => {
      expect(parseFhirPath("1 > 2").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan2', () => {
      expect(parseFhirPath("1.0 > 1.2").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan3', () => {
      expect(parseFhirPath("'a' > 'b'").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan4', () => {
      expect(parseFhirPath("'A' > 'a'").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan5', () => {
      expect(parseFhirPath("@2014-12-12 > @2014-12-13").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan6', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 > @2014-12-13T12:00:01").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan7', () => {
      expect(parseFhirPath("@T12:00:00 > @T14:00:00").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan8', () => {
      expect(parseFhirPath("1 > 1").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan9', () => {
      expect(parseFhirPath("1.0 > 1.0").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan10', () => {
      expect(parseFhirPath("'a' > 'a'").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan11', () => {
      expect(parseFhirPath("'A' > 'A'").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan12', () => {
      expect(parseFhirPath("@2014-12-12 > @2014-12-12").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan13', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 > @2014-12-13T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan14', () => {
      expect(parseFhirPath("@T12:00:00 > @T12:00:00").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan15', () => {
      expect(toBoolean(parseFhirPath("2 > 1").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan16', () => {
      expect(toBoolean(parseFhirPath("1.1 > 1.0").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan17', () => {
      expect(toBoolean(parseFhirPath("'b' > 'a'").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan18', () => {
      expect(toBoolean(parseFhirPath("'B' > 'A'").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan19', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13 > @2014-12-12").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan20', () => {
      expect(toBoolean(parseFhirPath("@2014-12-13T12:00:01 > @2014-12-13T12:00:00").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan21', () => {
      expect(toBoolean(parseFhirPath("@T12:00:01 > @T12:00:00").eval(patient))).toBeTruthy();
    });

    test('testGreaterThan22', () => {
      expect(toBoolean(parseFhirPath("Observation.value > 100 '[lb_av]'").eval(observation))).toBeTruthy();
    });

    test('testGreaterThan23', () => {
      expect(() => parseFhirPath("@2018-03 > @2018-03-01").eval(patient)).not.toThrow();
    });

    test('testGreaterThan24', () => {
      expect(() => parseFhirPath("@2018-03-01T10 > @2018-03-01T10:30").eval(patient)).not.toThrow();
    });

    test('testGreaterThan25', () => {
      expect(() => parseFhirPath("@T10 > @T10:30").eval(patient)).not.toThrow();
    });

    test('testGreaterThan26', () => {
      expect(parseFhirPath("@2018-03-01T10:30:00 > @2018-03-01T10:30:00.0").eval(patient)).toEqual([false]);
    });

    test('testGreaterThan27', () => {
      expect(parseFhirPath("@T10:30:00 > @T10:30:00.0").eval(patient)).toEqual([false]);
    });

  });

  describe('testUnion', () => {

    test('testUnion1', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3).count() = 3").eval(patient))).toBeTruthy();
    });

    test('testUnion2', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 2).count() = 2").eval(patient))).toBeTruthy();
    });

    test('testUnion3', () => {
      expect(toBoolean(parseFhirPath("(1|1).count() = 1").eval(patient))).toBeTruthy();
    });

    test('testUnion4', () => {
      expect(toBoolean(parseFhirPath("1.union(2).union(3).count() = 3").eval(patient))).toBeTruthy();
    });

    test('testUnion5', () => {
      expect(toBoolean(parseFhirPath("1.union(2.union(3)).count() = 3").eval(patient))).toBeTruthy();
    });

    test('testUnion6', () => {
      expect(toBoolean(parseFhirPath("(1 | 2).combine(2).count() = 3").eval(patient))).toBeTruthy();
    });

    test('testUnion7', () => {
      expect(toBoolean(parseFhirPath("1.combine(1).count() = 2").eval(patient))).toBeTruthy();
    });

    test('testUnion8', () => {
      expect(toBoolean(parseFhirPath("1.combine(1).union(2).count() = 2").eval(patient))).toBeTruthy();
    });

  });

  describe('testIntersect', () => {

    test('testIntersect1', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3).intersect(2 | 4) = 2").eval(patient))).toBeTruthy();
    });

    test('testIntersect2', () => {
      expect(toBoolean(parseFhirPath("(1 | 2).intersect(4).empty()").eval(patient))).toBeTruthy();
    });

    test('testIntersect3', () => {
      expect(toBoolean(parseFhirPath("(1 | 2).intersect({}).empty()").eval(patient))).toBeTruthy();
    });

    test('testIntersect4', () => {
      expect(toBoolean(parseFhirPath("1.combine(1).intersect(1).count() = 1").eval(patient))).toBeTruthy();
    });

  });

  describe('testExclude', () => {

    test('testExclude1', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3).exclude(2 | 4) = 1 | 3").eval(patient))).toBeTruthy();
    });

    test('testExclude2', () => {
      expect(toBoolean(parseFhirPath("(1 | 2).exclude(4) = 1 | 2").eval(patient))).toBeTruthy();
    });

    test('testExclude3', () => {
      expect(toBoolean(parseFhirPath("(1 | 2).exclude({}) = 1 | 2").eval(patient))).toBeTruthy();
    });

    test('testExclude4', () => {
      expect(toBoolean(parseFhirPath("1.combine(1).exclude(2).count() = 2").eval(patient))).toBeTruthy();
    });

  });

  describe('testIn', () => {

    test('testIn1', () => {
      expect(toBoolean(parseFhirPath("1 in (1 | 2 | 3)").eval(patient))).toBeTruthy();
    });

    test('testIn2', () => {
      expect(parseFhirPath("1 in (2 | 3)").eval(patient)).toEqual([false]);
    });

    test('testIn3', () => {
      expect(toBoolean(parseFhirPath("'a' in ('a' | 'c' | 'd')").eval(patient))).toBeTruthy();
    });

    test('testIn4', () => {
      expect(parseFhirPath("'b' in ('a' | 'c' | 'd')").eval(patient)).toEqual([false]);
    });

  });

  describe('testContainsCollection', () => {

    test('testContainsCollection1', () => {
      expect(toBoolean(parseFhirPath("(1 | 2 | 3) contains 1").eval(patient))).toBeTruthy();
    });

    test('testContainsCollection2', () => {
      expect(parseFhirPath("(2 | 3) contains 1").eval(patient)).toEqual([false]);
    });

    test('testContainsCollection3', () => {
      expect(toBoolean(parseFhirPath("('a' | 'c' | 'd') contains 'a'").eval(patient))).toBeTruthy();
    });

    test('testContainsCollection4', () => {
      expect(parseFhirPath("('a' | 'c' | 'd') contains 'b'").eval(patient)).toEqual([false]);
    });

  });

  describe('testBooleanLogicAnd', () => {

    test('testBooleanLogicAnd1', () => {
      expect(toBoolean(parseFhirPath("(true and true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd2', () => {
      expect(toBoolean(parseFhirPath("(true and false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd3', () => {
      expect(toBoolean(parseFhirPath("(true and {}).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd4', () => {
      expect(toBoolean(parseFhirPath("(false and true) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd5', () => {
      expect(toBoolean(parseFhirPath("(false and false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd6', () => {
      expect(toBoolean(parseFhirPath("(false and {}) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd7', () => {
      expect(toBoolean(parseFhirPath("({} and true).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd8', () => {
      expect(toBoolean(parseFhirPath("({} and false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicAnd9', () => {
      expect(toBoolean(parseFhirPath("({} and {}).empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testBooleanLogicOr', () => {

    test('testBooleanLogicOr1', () => {
      expect(toBoolean(parseFhirPath("(true or true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr2', () => {
      expect(toBoolean(parseFhirPath("(true or false) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr3', () => {
      expect(toBoolean(parseFhirPath("(true or {}) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr4', () => {
      expect(toBoolean(parseFhirPath("(false or true) = true").eval(patient))).toBeTruthy();
    });

    test.skip('testBooleanLogicOr5', () => {
      expect(toBoolean(parseFhirPath("(false or false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr6', () => {
      expect(toBoolean(parseFhirPath("(false or {}).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr7', () => {
      expect(toBoolean(parseFhirPath("({} or true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr8', () => {
      expect(toBoolean(parseFhirPath("({} or false).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicOr9', () => {
      expect(toBoolean(parseFhirPath("({} or {}).empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testBooleanLogicXOr', () => {

    test('testBooleanLogicXOr1', () => {
      expect(toBoolean(parseFhirPath("(true xor true) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr2', () => {
      expect(toBoolean(parseFhirPath("(true xor false) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr3', () => {
      expect(toBoolean(parseFhirPath("(true xor {}).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr4', () => {
      expect(toBoolean(parseFhirPath("(false xor true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr5', () => {
      expect(toBoolean(parseFhirPath("(false xor false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr6', () => {
      expect(toBoolean(parseFhirPath("(false xor {}).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr7', () => {
      expect(toBoolean(parseFhirPath("({} xor true).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr8', () => {
      expect(toBoolean(parseFhirPath("({} xor false).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanLogicXOr9', () => {
      expect(toBoolean(parseFhirPath("({} xor {}).empty()").eval(patient))).toBeTruthy();
    });

  });

  describe.skip('testBooleanImplies', () => {

    test('testBooleanImplies1', () => {
      expect(toBoolean(parseFhirPath("(true implies true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies2', () => {
      expect(toBoolean(parseFhirPath("(true implies false) = false").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies3', () => {
      expect(toBoolean(parseFhirPath("(true implies {}).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies4', () => {
      expect(toBoolean(parseFhirPath("(false implies true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies5', () => {
      expect(toBoolean(parseFhirPath("(false implies false) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies6', () => {
      expect(toBoolean(parseFhirPath("(false implies {}) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies7', () => {
      expect(toBoolean(parseFhirPath("({} implies true) = true").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies8', () => {
      expect(toBoolean(parseFhirPath("({} implies false).empty()").eval(patient))).toBeTruthy();
    });

    test('testBooleanImplies9', () => {
      expect(toBoolean(parseFhirPath("({} implies {}).empty()").eval(patient))).toBeTruthy();
    });

  });

  describe('testPlus', () => {

    test('testPlus1', () => {
      expect(toBoolean(parseFhirPath("1 + 1 = 2").eval(patient))).toBeTruthy();
    });

    test('testPlus2', () => {
      expect(toBoolean(parseFhirPath("1 + 0 = 1").eval(patient))).toBeTruthy();
    });

    test('testPlus3', () => {
      expect(toBoolean(parseFhirPath("1.2 + 1.8 = 3.0").eval(patient))).toBeTruthy();
    });

    test('testPlus4', () => {
      expect(toBoolean(parseFhirPath("'a'+'b' = 'ab'").eval(patient))).toBeTruthy();
    });

  });

  describe('testConcatenate', () => {

    test('testConcatenate1', () => {
      expect(toBoolean(parseFhirPath("'a' & 'b' = 'ab'").eval(patient))).toBeTruthy();
    });

    test('testConcatenate2', () => {
      expect(toBoolean(parseFhirPath("'1' & {} = '1'").eval(patient))).toBeTruthy();
    });

    test('testConcatenate3', () => {
      expect(toBoolean(parseFhirPath("{} & 'b' = 'b'").eval(patient))).toBeTruthy();
    });

    test.skip('testConcatenate4', () => {
      expect(() => parseFhirPath("(1 | 2 | 3) & 'b' = '1,2,3b'").eval(patient)).toThrow();
    });

  });

  describe('testMinus', () => {

    test('testMinus1', () => {
      expect(toBoolean(parseFhirPath("1 - 1 = 0").eval(patient))).toBeTruthy();
    });

    test('testMinus2', () => {
      expect(toBoolean(parseFhirPath("1 - 0 = 1").eval(patient))).toBeTruthy();
    });

    test('testMinus3', () => {
      expect(toBoolean(parseFhirPath("1.8 - 1.2 = 0.6").eval(patient))).toBeTruthy();
    });

    test.skip('testMinus4', () => {
      expect(() => parseFhirPath("'a'-'b' = 'ab'").eval(patient)).toThrow();
    });

  });

  describe('testMultiply', () => {

    test('testMultiply1', () => {
      expect(toBoolean(parseFhirPath("1.2 * 1.8 = 2.16").eval(patient))).toBeTruthy();
    });

    test('testMultiply2', () => {
      expect(toBoolean(parseFhirPath("1 * 1 = 1").eval(patient))).toBeTruthy();
    });

    test('testMultiply3', () => {
      expect(toBoolean(parseFhirPath("1 * 0 = 0").eval(patient))).toBeTruthy();
    });

  });

  describe('testDivide', () => {

    test('testDivide1', () => {
      expect(toBoolean(parseFhirPath("1 / 1 = 1").eval(patient))).toBeTruthy();
    });

    test('testDivide2', () => {
      expect(toBoolean(parseFhirPath("4 / 2 = 2").eval(patient))).toBeTruthy();
    });

    test('testDivide3', () => {
      expect(toBoolean(parseFhirPath("4.0 / 2.0 = 2.0").eval(patient))).toBeTruthy();
    });

    test('testDivide4', () => {
      expect(toBoolean(parseFhirPath("1 / 2 = 0.5").eval(patient))).toBeTruthy();
    });

    test('testDivide5', () => {
      expect(toBoolean(parseFhirPath("1.2 / 1.8 = 0.66666667").eval(patient))).toBeTruthy();
    });

    test('testDivide6', () => {
      expect(() => parseFhirPath("1 / 0").eval(patient)).not.toThrow();
    });

  });

  describe('testDiv', () => {

    test('testDiv1', () => {
      expect(toBoolean(parseFhirPath("1 div 1 = 1").eval(patient))).toBeTruthy();
    });

    test('testDiv2', () => {
      expect(toBoolean(parseFhirPath("4 div 2 = 2").eval(patient))).toBeTruthy();
    });

    test('testDiv3', () => {
      expect(toBoolean(parseFhirPath("5 div 2 = 2").eval(patient))).toBeTruthy();
    });

    test('testDiv4', () => {
      expect(toBoolean(parseFhirPath("2.2 div 1.8 = 1").eval(patient))).toBeTruthy();
    });

    test('testDiv5', () => {
      expect(() => parseFhirPath("5 div 0").eval(patient)).not.toThrow();
    });

  });

  describe('testMod', () => {

    test('testMod1', () => {
      expect(toBoolean(parseFhirPath("1 mod 1 = 0").eval(patient))).toBeTruthy();
    });

    test('testMod2', () => {
      expect(toBoolean(parseFhirPath("4 mod 2 = 0").eval(patient))).toBeTruthy();
    });

    test('testMod3', () => {
      expect(toBoolean(parseFhirPath("5 mod 2 = 1").eval(patient))).toBeTruthy();
    });

    test('testMod4', () => {
      expect(toBoolean(parseFhirPath("2.2 mod 1.8 = 0.4").eval(patient))).toBeTruthy();
    });

    test('testMod5', () => {
      expect(() => parseFhirPath("5 mod 0").eval(patient)).not.toThrow();
    });

  });

  describe('testRound', () => {

    test('testRound1', () => {
      expect(toBoolean(parseFhirPath("1.round() = 1").eval(patient))).toBeTruthy();
    });

    test.skip('testRound2', () => {
      expect(toBoolean(parseFhirPath("3.14159.round(3) = 2").eval(patient))).toBeTruthy();
    });

  });

  describe('testSqrt', () => {

    test('testSqrt1', () => {
      expect(toBoolean(parseFhirPath("81.sqrt() = 9.0").eval(patient))).toBeTruthy();
    });

    test('testSqrt2', () => {
      expect(() => parseFhirPath("(-1).sqrt()").eval(patient)).not.toThrow();
    });

  });

  describe('testAbs', () => {

    test('testAbs1', () => {
      expect(toBoolean(parseFhirPath("(-5).abs() = 5").eval(patient))).toBeTruthy();
    });

    test('testAbs2', () => {
      expect(toBoolean(parseFhirPath("(-5.5).abs() = 5.5").eval(patient))).toBeTruthy();
    });

    test('testAbs3', () => {
      expect(toBoolean(parseFhirPath("(-5.5 'mg').abs() = 5.5 'mg'").eval(patient))).toBeTruthy();
    });

  });

  describe('testCeiling', () => {

    test('testCeiling1', () => {
      expect(toBoolean(parseFhirPath("1.ceiling() = 1").eval(patient))).toBeTruthy();
    });

    test('testCeiling2', () => {
      expect(toBoolean(parseFhirPath("(-1.1).ceiling() = -1").eval(patient))).toBeTruthy();
    });

    test('testCeiling3', () => {
      expect(toBoolean(parseFhirPath("1.1.ceiling() = 2").eval(patient))).toBeTruthy();
    });

  });

  describe('testExp', () => {

    test('testExp1', () => {
      expect(toBoolean(parseFhirPath("0.exp() = 1").eval(patient))).toBeTruthy();
    });

    test('testExp2', () => {
      expect(toBoolean(parseFhirPath("(-0.0).exp() = 1").eval(patient))).toBeTruthy();
    });

  });

  describe('testFloor', () => {

    test('testFloor1', () => {
      expect(toBoolean(parseFhirPath("1.floor() = 1").eval(patient))).toBeTruthy();
    });

    test('testFloor2', () => {
      expect(toBoolean(parseFhirPath("2.1.floor() = 2").eval(patient))).toBeTruthy();
    });

    test('testFloor3', () => {
      expect(toBoolean(parseFhirPath("(-2.1).floor() = -3").eval(patient))).toBeTruthy();
    });

  });

  describe('testLn', () => {

    test('testLn1', () => {
      expect(toBoolean(parseFhirPath("1.ln() = 0.0").eval(patient))).toBeTruthy();
    });

    test('testLn2', () => {
      expect(toBoolean(parseFhirPath("1.0.ln() = 0.0").eval(patient))).toBeTruthy();
    });

  });

  describe('testLog', () => {

    test('testLog1', () => {
      expect(toBoolean(parseFhirPath("16.log(2) = 4.0").eval(patient))).toBeTruthy();
    });

    test('testLog2', () => {
      expect(toBoolean(parseFhirPath("100.0.log(10.0) = 2.0").eval(patient))).toBeTruthy();
    });

  });

  describe('testPower', () => {

    test('testPower1', () => {
      expect(toBoolean(parseFhirPath("2.power(3) = 8").eval(patient))).toBeTruthy();
    });

    test('testPower2', () => {
      expect(toBoolean(parseFhirPath("2.5.power(2) = 6.25").eval(patient))).toBeTruthy();
    });

    test('testPower3', () => {
      expect(() => parseFhirPath("(-1).power(0.5)").eval(patient)).not.toThrow();
    });

  });

  describe('testTruncate', () => {

    test('testTruncate1', () => {
      expect(toBoolean(parseFhirPath("101.truncate() = 101").eval(patient))).toBeTruthy();
    });

    test('testTruncate2', () => {
      expect(toBoolean(parseFhirPath("1.00000001.truncate() = 1").eval(patient))).toBeTruthy();
    });

    test('testTruncate3', () => {
      expect(toBoolean(parseFhirPath("(-1.56).truncate() = -1").eval(patient))).toBeTruthy();
    });

  });

  describe('testPrecedence', () => {

    test.skip('test unary precedence', () => {
      expect(() => parseFhirPath("-1.convertsToInteger()").eval(patient)).toThrow();
    });

    test('testPrecedence2', () => {
      expect(toBoolean(parseFhirPath("1+2*3+4 = 11").eval(patient))).toBeTruthy();
    });

    test('testPrecedence3', () => {
      expect(toBoolean(parseFhirPath("1 > 2 is Boolean").eval(patient))).toBeTruthy();
    });

    test.skip('testPrecedence4', () => {
      expect(toBoolean(parseFhirPath("1 | 1 is Integer").eval(patient))).toBeTruthy();
    });

  });

  describe.skip('testVariables', () => {

    test('testVariables1', () => {
      expect(toBoolean(parseFhirPath("%sct = 'http://snomed.info/sct'").eval(patient))).toBeTruthy();
    });

    test('testVariables2', () => {
      expect(toBoolean(parseFhirPath("%loinc = 'http://loinc.org'").eval(patient))).toBeTruthy();
    });

    test('testVariables3', () => {
      expect(toBoolean(parseFhirPath("%ucum = 'http://unitsofmeasure.org'").eval(patient))).toBeTruthy();
    });

    test('testVariables4', () => {
      expect(toBoolean(parseFhirPath("%`vs-administrative-gender` = 'http://hl7.org/fhir/ValueSet/administrative-gender'").eval(patient))).toBeTruthy();
    });

  });

  describe.skip('testExtension', () => {

    test('testExtension1', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime').exists()").eval(patient))).toBeTruthy();
    });

    test('testExtension2', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate.extension(%`ext-patient-birthTime`).exists()").eval(patient))).toBeTruthy();
    });

    test('testExtension3', () => {
      expect(toBoolean(parseFhirPath("Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime1').empty()").eval(patient))).toBeTruthy();
    });

  });

  describe.skip('testType', () => {

    test('testType1', () => {
      expect(toBoolean(parseFhirPath("1.type().namespace = 'System'").eval(patient))).toBeTruthy();
    });

    test('testType2', () => {
      expect(toBoolean(parseFhirPath("1.type().name = 'Integer'").eval(patient))).toBeTruthy();
    });

    test('testType3', () => {
      expect(toBoolean(parseFhirPath("true.type().namespace = 'System'").eval(patient))).toBeTruthy();
    });

    test('testType4', () => {
      expect(toBoolean(parseFhirPath("true.type().name = 'Boolean'").eval(patient))).toBeTruthy();
    });

    test('testType5', () => {
      expect(toBoolean(parseFhirPath("true.is(Boolean)").eval(patient))).toBeTruthy();
    });

    test('testType6', () => {
      expect(toBoolean(parseFhirPath("true.is(System.Boolean)").eval(patient))).toBeTruthy();
    });

    test('testType7', () => {
      expect(toBoolean(parseFhirPath("true is Boolean").eval(patient))).toBeTruthy();
    });

    test('testType8', () => {
      expect(toBoolean(parseFhirPath("true is System.Boolean").eval(patient))).toBeTruthy();
    });

    test('testType9', () => {
      expect(toBoolean(parseFhirPath("Patient.active.type().namespace = 'FHIR'").eval(patient))).toBeTruthy();
    });

    test('testType10', () => {
      expect(toBoolean(parseFhirPath("Patient.active.type().name = 'boolean'").eval(patient))).toBeTruthy();
    });

    test('testType11', () => {
      expect(toBoolean(parseFhirPath("Patient.active.is(boolean)").eval(patient))).toBeTruthy();
    });

    test('testType12', () => {
      expect(toBoolean(parseFhirPath("Patient.active.is(Boolean).not()").eval(patient))).toBeTruthy();
    });

    test('testType13', () => {
      expect(toBoolean(parseFhirPath("Patient.active.is(FHIR.boolean)").eval(patient))).toBeTruthy();
    });

    test('testType14', () => {
      expect(toBoolean(parseFhirPath("Patient.active.is(System.Boolean).not()").eval(patient))).toBeTruthy();
    });

    test('testType15', () => {
      expect(toBoolean(parseFhirPath("Patient.type().namespace = 'FHIR'").eval(patient))).toBeTruthy();
    });

    test('testType16', () => {
      expect(toBoolean(parseFhirPath("Patient.type().name = 'Patient'").eval(patient))).toBeTruthy();
    });

    test('testType17', () => {
      expect(toBoolean(parseFhirPath("Patient.is(Patient)").eval(patient))).toBeTruthy();
    });

    test('testType18', () => {
      expect(toBoolean(parseFhirPath("Patient.is(FHIR.Patient)").eval(patient))).toBeTruthy();
    });

    test('testType19', () => {
      expect(toBoolean(parseFhirPath("Patient.is(FHIR.`Patient`)").eval(patient))).toBeTruthy();
    });

    test('testType20', () => {
      expect(parseFhirPath("Patient.ofType(Patient).type().name").eval(patient)).toEqual(["Patient"]);
    });

    test('testType21', () => {
      expect(parseFhirPath("Patient.ofType(FHIR.Patient).type().name").eval(patient)).toEqual(["Patient"]);
    });

    test('testType22', () => {
      expect(toBoolean(parseFhirPath("Patient.is(System.Patient).not()").eval(patient))).toBeTruthy();
    });

    test('testType23', () => {
      expect(parseFhirPath("Patient.ofType(FHIR.`Patient`).type().name").eval(patient)).toEqual(["Patient"]);
    });

  });

  describe('testConformsTo', () => {

    test('testConformsTo', () => {
      expect(toBoolean(parseFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Patient')").eval(patient))).toBeTruthy();
    });

    test('testConformsTo', () => {
      expect(parseFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Person')").eval(patient)).toEqual([false]);
    });

    test('testConformsTo', () => {
      expect(() => parseFhirPath("conformsTo('http://trash')").eval(patient)).toThrow();
    });

  });

});
