import { parseFhirPath } from './parse';

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

    test('testSimpleFail', () => {
      // Undefined behavior - copying FHIRPath.js
      expect(parseFhirPath("name.given1").eval(patient)).toEqual([]);
    });

    test('testSimpleWithContext', () => {
      expect(parseFhirPath("Patient.name.given").eval(patient)).toEqual(["Peter", "James", "Jim", "Peter", "James"]);
    });

    test('testSimpleWithWrongContext', () => {
      // Undefined behavior - copying FHIRPath.js
      expect(parseFhirPath("Encounter.name.given").eval(patient)).toEqual([]);
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
      expect(parseFhirPath("Observation.value.is(Quantity)").eval(observation)).toEqual([true]);
    });

    test('testPolymorphismIsA', () => {
      expect(parseFhirPath("Observation.value is Quantity").eval(observation)).toEqual([true]);
    });

    test('testPolymorphismIsB', () => {
      expect(parseFhirPath("Observation.value.is(Period).not()").eval(observation)).toEqual([true]);
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

  describe('testDollar', () => {

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

    test.skip('testDollarOrderNotAllowed', () => {
      expect(() => parseFhirPath("Patient.children().skip(1)").eval(patient)).toThrow();
    });

  });

  describe('testLiterals', () => {

    test('testLiteralTrue', () => {
      expect(parseFhirPath("Patient.name.exists() = true").eval(patient)).toEqual([true]);
    });

    test('testLiteralFalse', () => {
      expect(parseFhirPath("Patient.name.empty() = false").eval(patient)).toEqual([true]);
    });

    test('testLiteralString', () => {
      expect(parseFhirPath("Patient.name.given.first() = 'Peter'").eval(patient)).toEqual([true]);
    });

    test('testLiteralInteger1', () => {
      expect(parseFhirPath("1.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testLiteralInteger0', () => {
      expect(parseFhirPath("0.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerNegative1', () => {
      expect(parseFhirPath("(-1).convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test.skip('testLiteralIntegerNegative1Invalid', () => {
      expect(() => parseFhirPath("-1.convertsToInteger()").eval(patient)).toThrow();
    });

    test('testLiteralIntegerMax', () => {
      expect(parseFhirPath("2147483647.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testLiteralString', () => {
      expect(parseFhirPath("'test'.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testLiteralStringEscapes', () => {
      expect(parseFhirPath("'\\\\\\/\\f\\r\\n\\t\\\"\\`\\'\\u002a'.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testLiteralBooleanTrue', () => {
      expect(parseFhirPath("true.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testLiteralBooleanFalse', () => {
      expect(parseFhirPath("false.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimal10', () => {
      expect(parseFhirPath("1.0.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimal01', () => {
      expect(parseFhirPath("0.1.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimal00', () => {
      expect(parseFhirPath("0.0.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimalNegative01', () => {
      expect(parseFhirPath("(-0.1).convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test.skip('testLiteralDecimalNegative01Invalid', () => {
      expect(() => parseFhirPath("-0.1.convertsToDecimal()").eval(patient)).toThrow();
    });

    test('testLiteralDecimalMax', () => {
      expect(parseFhirPath("1234567890987654321.0.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimalStep', () => {
      expect(parseFhirPath("0.00000001.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateYear', () => {
      expect(parseFhirPath("@2015.is(Date)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateMonth', () => {
      expect(parseFhirPath("@2015-02.is(Date)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateDay', () => {
      expect(parseFhirPath("@2015-02-04.is(Date)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeYear', () => {
      expect(parseFhirPath("@2015T.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeMonth', () => {
      expect(parseFhirPath("@2015-02T.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeDay', () => {
      expect(parseFhirPath("@2015-02-04T.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeHour', () => {
      expect(parseFhirPath("@2015-02-04T14.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeMinute', () => {
      expect(parseFhirPath("@2015-02-04T14:34.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeSecond', () => {
      expect(parseFhirPath("@2015-02-04T14:34:28.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeMillisecond', () => {
      expect(parseFhirPath("@2015-02-04T14:34:28.123.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeUTC', () => {
      expect(parseFhirPath("@2015-02-04T14:34:28Z.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeTimezoneOffset', () => {
      expect(parseFhirPath("@2015-02-04T14:34:28+10:00.is(DateTime)").eval(patient)).toEqual([true]);
    });

    test('testLiteralTimeHour', () => {
      expect(parseFhirPath("@T14.is(Time)").eval(patient)).toEqual([true]);
    });

    test('testLiteralTimeMinute', () => {
      expect(parseFhirPath("@T14:34.is(Time)").eval(patient)).toEqual([true]);
    });

    test('testLiteralTimeSecond', () => {
      expect(parseFhirPath("@T14:34:28.is(Time)").eval(patient)).toEqual([true]);
    });

    test('testLiteralTimeMillisecond', () => {
      expect(parseFhirPath("@T14:34:28.123.is(Time)").eval(patient)).toEqual([true]);
    });

    test.skip('testLiteralTimeUTC', () => {
      expect(() => parseFhirPath("@T14:34:28Z.is(Time)").eval(patient)).toThrow();
    });

    test.skip('testLiteralTimeTimezoneOffset', () => {
      expect(() => parseFhirPath("@T14:34:28+10:00.is(Time)").eval(patient)).toThrow();
    });

    test('testLiteralQuantityDecimal', () => {
      expect(parseFhirPath("10.1 'mg'.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testLiteralQuantityInteger', () => {
      expect(parseFhirPath("10 'mg'.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testLiteralQuantityDay', () => {
      expect(parseFhirPath("4 days.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerNotEqual', () => {
      expect(parseFhirPath("-3 != 3").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerEqual', () => {
      expect(parseFhirPath("Patient.name.given.count() = 5").eval(patient)).toEqual([true]);
    });

    test('testPolarityPrecedence', () => {
      expect(parseFhirPath("-Patient.name.given.count() = -5").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerGreaterThan', () => {
      expect(parseFhirPath("Patient.name.given.count() > -3").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerCountNotEqual', () => {
      expect(parseFhirPath("Patient.name.given.count() != 0").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerLessThanTrue', () => {
      expect(parseFhirPath("1 < 2").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerLessThanFalse', () => {
      expect(parseFhirPath("1 < -2").eval(patient)).toEqual([false]);
    });

    test('testLiteralIntegerLessThanPolarityTrue', () => {
      expect(parseFhirPath("+1 < +2").eval(patient)).toEqual([true]);
    });

    test('testLiteralIntegerLessThanPolarityFalse', () => {
      expect(parseFhirPath("-1 < 2").eval(patient)).toEqual([true]);
    });

    test('testLiteralDecimalGreaterThanNonZeroTrue', () => {
      expect(parseFhirPath("Observation.value.value > 180.0").eval(observation)).toEqual([true]);
    });

    test('testLiteralDecimalGreaterThanZeroTrue', () => {
      expect(parseFhirPath("Observation.value.value > 0.0").eval(observation)).toEqual([true]);
    });

    test('testLiteralDecimalGreaterThanIntegerTrue', () => {
      expect(parseFhirPath("Observation.value.value > 0").eval(observation)).toEqual([true]);
    });

    test('testLiteralDecimalLessThanInteger', () => {
      expect(parseFhirPath("Observation.value.value < 190").eval(observation)).toEqual([true]);
    });

    test.skip('testLiteralDecimalLessThanInvalid', () => {
      expect(() => parseFhirPath("Observation.value.value < 'test'").eval(observation)).toThrow();
    });

    test('testDateEqual', () => {
      expect(parseFhirPath("Patient.birthDate = @1974-12-25").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqual', () => {
      expect(() => parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00").eval(patient)).not.toThrow();
    });

    test('testDateNotEqualTimezoneOffsetBefore', () => {
      expect(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00-10:00").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqualTimezoneOffsetAfter', () => {
      expect(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00+10:00").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqualUTC', () => {
      expect(parseFhirPath("Patient.birthDate != @1974-12-25T12:34:00Z").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqualTimeSecond', () => {
      expect(parseFhirPath("Patient.birthDate != @T12:14:15").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqualTimeMinute', () => {
      expect(parseFhirPath("Patient.birthDate != @T12:14").eval(patient)).toEqual([true]);
    });

    test('testDateNotEqualToday', () => {
      expect(parseFhirPath("Patient.birthDate < today()").eval(patient)).toEqual([true]);
    });

    test('testDateTimeGreaterThanDate', () => {
      expect(parseFhirPath("now() > Patient.birthDate").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeTZGreater', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 > @2017-11-05T01:15:00.0-05:00").eval(patient)).toEqual([false]);
    });

    test('testLiteralDateTimeTZLess', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 < @2017-11-05T01:15:00.0-05:00").eval(patient)).toEqual([true]);
    });

    test('testLiteralDateTimeTZEqualFalse', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 = @2017-11-05T01:15:00.0-05:00").eval(patient)).toEqual([false]);
    });

    test('testLiteralDateTimeTZEqualTrue', () => {
      expect(parseFhirPath("@2017-11-05T01:30:00.0-04:00 = @2017-11-05T00:30:00.0-05:00").eval(patient)).toEqual([true]);
    });

    test.skip('testLiteralUnicode', () => {
      expect(parseFhirPath("Patient.name.given.first() = 'P\\u0065ter'").eval(patient)).toEqual([true]);
    });

    test('testCollectionNotEmpty', () => {
      expect(parseFhirPath("Patient.name.given.empty().not()").eval(patient)).toEqual([true]);
    });

    test('testCollectionNotEqualEmpty', () => {
      expect(() => parseFhirPath("Patient.name.given != {}").eval(patient)).not.toThrow();
    });

    test('testExpressions', () => {
      expect(parseFhirPath("Patient.name.select(given | family).distinct()").eval(patient)).toEqual(["Peter", "James", "Jim", "Chalmers", "Windsor"]);
    });

    test('testExpressionsEqual', () => {
      expect(parseFhirPath("Patient.name.given.count() = 1 + 4").eval(patient)).toEqual([true]);
    });

    test('testNotEmpty', () => {
      expect(parseFhirPath("Patient.name.empty().not()").eval(patient)).toEqual([true]);
    });

    test('testEmpty', () => {
      expect(parseFhirPath("Patient.link.empty()").eval(patient)).toEqual([true]);
    });

    test('testLiteralNotTrue', () => {
      expect(parseFhirPath("true.not() = false").eval(patient)).toEqual([true]);
    });

    test('testLiteralNotFalse', () => {
      expect(parseFhirPath("false.not() = true").eval(patient)).toEqual([true]);
    });

    test('testIntegerBooleanNotTrue', () => {
      expect(parseFhirPath("(0).not() = true").eval(patient)).toEqual([true]);
    });

    test('testIntegerBooleanNotFalse', () => {
      expect(parseFhirPath("(1).not() = false").eval(patient)).toEqual([true]);
    });

    test.skip('testNotInvalid', () => {
      expect(() => parseFhirPath("(1|2).not() = false").eval(patient)).toThrow();
    });

  });

  describe('testTypes', () => {

    test('testStringYearConvertsToDate', () => {
      expect(parseFhirPath("'2015'.convertsToDate()").eval(patient)).toEqual([true]);
    });

    test('testStringMonthConvertsToDate', () => {
      expect(parseFhirPath("'2015-02'.convertsToDate()").eval(patient)).toEqual([true]);
    });

    test('testStringDayConvertsToDate', () => {
      expect(parseFhirPath("'2015-02-04'.convertsToDate()").eval(patient)).toEqual([true]);
    });

    test('testStringYearConvertsToDateTime', () => {
      expect(parseFhirPath("'2015'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringMonthConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringDayConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringHourConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringMinuteConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14:34'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringSecondConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14:34:28'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringMillisecondConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14:34:28.123'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringUTCConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14:34:28Z'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringTZConvertsToDateTime', () => {
      expect(parseFhirPath("'2015-02-04T14:34:28+10:00'.convertsToDateTime()").eval(patient)).toEqual([true]);
    });

    test('testStringHourConvertsToTime', () => {
      expect(parseFhirPath("'14'.convertsToTime()").eval(patient)).toEqual([true]);
    });

    test('testStringMinuteConvertsToTime', () => {
      expect(parseFhirPath("'14:34'.convertsToTime()").eval(patient)).toEqual([true]);
    });

    test('testStringSecondConvertsToTime', () => {
      expect(parseFhirPath("'14:34:28'.convertsToTime()").eval(patient)).toEqual([true]);
    });

    test('testStringMillisecondConvertsToTime', () => {
      expect(parseFhirPath("'14:34:28.123'.convertsToTime()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralConvertsToInteger', () => {
      expect(parseFhirPath("1.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralIsInteger', () => {
      expect(parseFhirPath("1.is(Integer)").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralIsSystemInteger', () => {
      expect(parseFhirPath("1.is(System.Integer)").eval(patient)).toEqual([true]);
    });

    test('testStringLiteralConvertsToInteger', () => {
      expect(parseFhirPath("'1'.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testStringLiteralConvertsToIntegerFalse', () => {
      expect(parseFhirPath("'a'.convertsToInteger().not()").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalConvertsToIntegerFalse', () => {
      expect(parseFhirPath("'1.0'.convertsToInteger().not()").eval(patient)).toEqual([true]);
    });

    test('testStringLiteralIsNotInteger', () => {
      expect(parseFhirPath("'1'.is(Integer).not()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralConvertsToInteger', () => {
      expect(parseFhirPath("true.convertsToInteger()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralIsNotInteger', () => {
      expect(parseFhirPath("true.is(Integer).not()").eval(patient)).toEqual([true]);
    });

    test('testDateIsNotInteger', () => {
      expect(parseFhirPath("@2013-04-05.is(Integer).not()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToInteger', () => {
      expect(parseFhirPath("1.toInteger() = 1").eval(patient)).toEqual([true]);
    });

    test('testStringIntegerLiteralToInteger', () => {
      expect(parseFhirPath("'1'.toInteger() = 1").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralToInteger', () => {
      expect(() => parseFhirPath("'1.1'.toInteger() = {}").eval(patient)).not.toThrow();
    });

    test('testDecimalLiteralToIntegerIsEmpty', () => {
      expect(parseFhirPath("'1.1'.toInteger().empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralToInteger', () => {
      expect(parseFhirPath("true.toInteger() = 1").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralConvertsToDecimal', () => {
      expect(parseFhirPath("1.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test.skip('testIntegerLiteralIsNotDecimal', () => {
      expect(parseFhirPath("1.is(Decimal).not()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralConvertsToDecimal', () => {
      expect(parseFhirPath("1.0.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralIsDecimal', () => {
      expect(parseFhirPath("1.0.is(Decimal)").eval(patient)).toEqual([true]);
    });

    test('testStringIntegerLiteralConvertsToDecimal', () => {
      expect(parseFhirPath("'1'.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testStringIntegerLiteralIsNotDecimal', () => {
      expect(parseFhirPath("'1'.is(Decimal).not()").eval(patient)).toEqual([true]);
    });

    test('testStringLiteralConvertsToDecimalFalse', () => {
      expect(parseFhirPath("'1.a'.convertsToDecimal().not()").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalLiteralConvertsToDecimal', () => {
      expect(parseFhirPath("'1.0'.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalLiteralIsNotDecimal', () => {
      expect(parseFhirPath("'1.0'.is(Decimal).not()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralConvertsToDecimal', () => {
      expect(parseFhirPath("true.convertsToDecimal()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralIsNotDecimal', () => {
      expect(parseFhirPath("true.is(Decimal).not()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToDecimal', () => {
      expect(parseFhirPath("1.toDecimal() = 1.0").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToDeciamlEquivalent', () => {
      expect(parseFhirPath("1.toDecimal() ~ 1.0").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralToDecimal', () => {
      expect(parseFhirPath("1.0.toDecimal() = 1.0").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralToDecimalEqual', () => {
      expect(parseFhirPath("'1.1'.toDecimal() = 1.1").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralToDecimal', () => {
      expect(parseFhirPath("true.toDecimal() = 1").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("1.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralIsNotQuantity', () => {
      expect(parseFhirPath("1.is(Quantity).not()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("1.0.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralIsNotQuantity', () => {
      expect(parseFhirPath("1.0.is(System.Quantity).not()").eval(patient)).toEqual([true]);
    });

    test('testStringIntegerLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("'1'.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testStringIntegerLiteralIsNotQuantity', () => {
      expect(parseFhirPath("'1'.is(System.Quantity).not()").eval(patient)).toEqual([true]);
    });

    test('testStringQuantityLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("'1 day'.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testStringQuantityWeekConvertsToQuantity', () => {
      expect(parseFhirPath("'1 \\'wk\\''.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test.skip('testStringQuantityWeekConvertsToQuantityFalse', () => {
      expect(parseFhirPath("'1 wk'.convertsToQuantity().not()").eval(patient)).toEqual([true]);
    });

    test.skip('testStringDecimalLiteralConvertsToQuantityFalse', () => {
      expect(parseFhirPath("'1.a'.convertsToQuantity().not()").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("'1.0'.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalLiteralIsNotSystemQuantity', () => {
      expect(parseFhirPath("'1.0'.is(System.Quantity).not()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralConvertsToQuantity', () => {
      expect(parseFhirPath("true.convertsToQuantity()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralIsNotSystemQuantity', () => {
      expect(parseFhirPath("true.is(System.Quantity).not()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToQuantity', () => {
      expect(parseFhirPath("1.toQuantity() = 1 '1'").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralToQuantity', () => {
      expect(parseFhirPath("1.0.toQuantity() = 1.0 '1'").eval(patient)).toEqual([true]);
    });

    test.skip('testStringIntegerLiteralToQuantity', () => {
      expect(parseFhirPath("'1'.toQuantity()").eval(patient)).toEqual(["1 '1'"]);
    });

    test('testStringQuantityLiteralToQuantity', () => {
      expect(parseFhirPath("'1 day'.toQuantity() = 1 day").eval(patient)).toEqual([true]);
    });

    test('testStringQuantityDayLiteralToQuantity', () => {
      expect(parseFhirPath("'1 day'.toQuantity() = 1 '{day}'").eval(patient)).toEqual([true]);
    });

    test('testStringQuantityWeekLiteralToQuantity', () => {
      expect(parseFhirPath("'1 \\'wk\\''.toQuantity() = 1 'wk'").eval(patient)).toEqual([true]);
    });

    test('testStringDecimalLiteralToQuantity', () => {
      expect(parseFhirPath("'1.0'.toQuantity() ~ 1 '1'").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("1.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralConvertsToBooleanFalse', () => {
      expect(parseFhirPath("2.convertsToBoolean()").eval(patient)).toEqual([false]);
    });

    test('testNegativeIntegerLiteralConvertsToBooleanFalse', () => {
      expect(parseFhirPath("(-1).convertsToBoolean()").eval(patient)).toEqual([false]);
    });

    test('testIntegerLiteralFalseConvertsToBoolean', () => {
      expect(parseFhirPath("0.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("1.0.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testStringTrueLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("'true'.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testStringFalseLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("'false'.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testStringFalseLiteralAlsoConvertsToBoolean', () => {
      expect(parseFhirPath("'False'.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testTrueLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("true.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testFalseLiteralConvertsToBoolean', () => {
      expect(parseFhirPath("false.convertsToBoolean()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToBoolean', () => {
      expect(parseFhirPath("1.toBoolean()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToBooleanEmpty', () => {
      expect(() => parseFhirPath("2.toBoolean()").eval(patient)).not.toThrow();
    });

    test('testIntegerLiteralToBooleanFalse', () => {
      expect(parseFhirPath("0.toBoolean()").eval(patient)).toEqual([false]);
    });

    test('testStringTrueToBoolean', () => {
      expect(parseFhirPath("'true'.toBoolean()").eval(patient)).toEqual([true]);
    });

    test('testStringFalseToBoolean', () => {
      expect(parseFhirPath("'false'.toBoolean()").eval(patient)).toEqual([false]);
    });

    test('testIntegerLiteralConvertsToString', () => {
      expect(parseFhirPath("1.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralIsNotString', () => {
      expect(parseFhirPath("1.is(String).not()").eval(patient)).toEqual([true]);
    });

    test('testNegativeIntegerLiteralConvertsToString', () => {
      expect(parseFhirPath("(-1).convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testDecimalLiteralConvertsToString', () => {
      expect(parseFhirPath("1.0.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testStringLiteralConvertsToString', () => {
      expect(parseFhirPath("'true'.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLiteralConvertsToString', () => {
      expect(parseFhirPath("true.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testQuantityLiteralConvertsToString', () => {
      expect(parseFhirPath("1 'wk'.convertsToString()").eval(patient)).toEqual([true]);
    });

    test('testIntegerLiteralToString', () => {
      expect(parseFhirPath("1.toString()").eval(patient)).toEqual(['1']);
    });

    test('testNegativeIntegerLiteralToString', () => {
      expect(parseFhirPath("(-1).toString()").eval(patient)).toEqual(['-1']);
    });

    test('testDecimalLiteralToString', () => {
      expect(parseFhirPath("1.0.toString()").eval(patient)).toEqual(['1']);
    });

    test('testStringLiteralToString', () => {
      expect(parseFhirPath("'true'.toString()").eval(patient)).toEqual(['true']);
    });

    test('testBooleanLiteralToString', () => {
      expect(parseFhirPath("true.toString()").eval(patient)).toEqual(['true']);
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
      expect(parseFhirPath("Patient.name.select(given.exists()).allTrue()").eval(patient)).toEqual([true]);
    });

    test('testAllTrue2', () => {
      expect(parseFhirPath("Patient.name.select(period.exists()).allTrue()").eval(patient)).toEqual([false]);
    });

    test('testAllTrue3', () => {
      expect(parseFhirPath("Patient.name.all(given.exists())").eval(patient)).toEqual([true]);
    });

    test('testAllTrue4', () => {
      expect(parseFhirPath("Patient.name.all(period.exists())").eval(patient)).toEqual([false]);
    });

  });

  describe.skip('testSubSetOf', () => {

    test('testSubSetOf1', () => {
      expect(parseFhirPath("Patient.name.first().subsetOf($this.name)").eval(patient)).toEqual([true]);
    });

    test('testSubSetOf2', () => {
      expect(parseFhirPath("Patient.name.subsetOf($this.name.first()).not()").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testSuperSetOf', () => {

    test('testSuperSetOf1', () => {
      expect(parseFhirPath("Patient.name.first().supersetOf($this.name).not()").eval(patient)).toEqual([true]);
    });

    test('testSuperSetOf2', () => {
      expect(parseFhirPath("Patient.name.supersetOf($this.name.first())").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testQuantity', () => {

    test('testQuantity1', () => {
      expect(parseFhirPath("4.0000 'g' = 4000.0 'mg'").eval(patient)).toEqual([true]);
    });

    test('testQuantity2', () => {
      expect(parseFhirPath("4 'g' ~ 4000 'mg'").eval(patient)).toEqual([true]);
    });

    test('testQuantity3', () => {
      expect(parseFhirPath("4 'g' != 4040 'mg'").eval(patient)).toEqual([true]);
    });

    test('testQuantity4', () => {
      expect(parseFhirPath("4 'g' ~ 4040 'mg'").eval(patient)).toEqual([true]);
    });

    test('testQuantity5', () => {
      expect(parseFhirPath("7 days = 1 week").eval(patient)).toEqual([true]);
    });

    test('testQuantity6', () => {
      expect(parseFhirPath("7 days = 1 'wk'").eval(patient)).toEqual([true]);
    });

    test('testQuantity7', () => {
      expect(parseFhirPath("6 days < 1 week").eval(patient)).toEqual([true]);
    });

    test('testQuantity8', () => {
      expect(parseFhirPath("8 days > 1 week").eval(patient)).toEqual([true]);
    });

    test('testQuantity9', () => {
      expect(parseFhirPath("2.0 'cm' * 2.0 'm' = 0.040 'm2'").eval(patient)).toEqual([true]);
    });

    test('testQuantity10', () => {
      expect(parseFhirPath("4.0 'g' / 2.0 'm' = 2 'g/m'").eval(patient)).toEqual([true]);
    });

    test('testQuantity11', () => {
      expect(parseFhirPath("1.0 'm' / 1.0 'm' = 1 '1'").eval(patient)).toEqual([true]);
    });

  });

  describe('testCollectionBoolean', () => {

    test('testCollectionBoolean1', () => {
      expect(() => parseFhirPath("iif(1 | 2 | 3, true, false)").eval(patient)).toThrow();
    });

    test('testCollectionBoolean2', () => {
      expect(parseFhirPath("iif({}, true, false)").eval(patient)).toEqual([false]);
    });

    test('testCollectionBoolean3', () => {
      expect(parseFhirPath("iif(true, true, false)").eval(patient)).toEqual([true]);
    });

    test('testCollectionBoolean4', () => {
      expect(parseFhirPath("iif({} | true, true, false)").eval(patient)).toEqual([true]);
    });

    test('testCollectionBoolean5', () => {
      expect(parseFhirPath("iif(true, true, 1/0)").eval(patient)).toEqual([true]);
    });

    test('testCollectionBoolean6', () => {
      expect(parseFhirPath("iif(false, 1/0, true)").eval(patient)).toEqual([true]);
    });

  });

  describe('testDistinct', () => {

    test('testDistinct1', () => {
      expect(parseFhirPath("(1 | 2 | 3).isDistinct()").eval(patient)).toEqual([true]);
    });

    test('testDistinct2', () => {
      expect(parseFhirPath("Questionnaire.descendants().linkId.isDistinct()").eval(questionnaire)).toEqual([true]);
    });

    test.skip('testDistinct3', () => {
      expect(parseFhirPath("Questionnaire.descendants().linkId.select(substring(0,1)).isDistinct().not()").eval(questionnaire)).toEqual([true]);
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
      expect(parseFhirPath("Patient.name.count() = 3").eval(patient)).toEqual([true]);
    });

    test('testCount3', () => {
      expect(parseFhirPath("Patient.name.first().count()").eval(patient)).toEqual([1]);
    });

    test('testCount4', () => {
      expect(parseFhirPath("Patient.name.first().count() = 1").eval(patient)).toEqual([true]);
    });

  });

  describe('testWhere', () => {

    test('testWhere1', () => {
      expect(parseFhirPath("Patient.name.count() = 3").eval(patient)).toEqual([true]);
    });

    test('testWhere2', () => {
      expect(parseFhirPath("Patient.name.where(given = 'Jim').count() = 1").eval(patient)).toEqual([true]);
    });

    test('testWhere3', () => {
      expect(parseFhirPath("Patient.name.where(given = 'X').count() = 0").eval(patient)).toEqual([true]);
    });

    test.skip('testWhere4', () => {
      expect(parseFhirPath("Patient.name.where($this.given = 'Jim').count() = 1").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testSelect', () => {

    test('testSelect1', () => {
      expect(parseFhirPath("Patient.name.select(given).count() = 5").eval(patient)).toEqual([true]);
    });

    test('testSelect2', () => {
      expect(parseFhirPath("Patient.name.select(given | family).count() = 7").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testRepeat', () => {

    test('testRepeat1', () => {
      expect(parseFhirPath("ValueSet.expansion.repeat(contains).count() = 10").eval(valueset)).toEqual([true]);
    });

    test('testRepeat2', () => {
      expect(parseFhirPath("Questionnaire.repeat(item).code.count() = 11").eval(questionnaire)).toEqual([true]);
    });

    test('testRepeat3', () => {
      expect(parseFhirPath("Questionnaire.descendants().code.count() = 23").eval(questionnaire)).toEqual([true]);
    });

    test('testRepeat4', () => {
      expect(parseFhirPath("Questionnaire.children().code.count() = 2").eval(questionnaire)).toEqual([true]);
    });

  });

  describe.skip('testAggregate', () => {

    test('testAggregate1', () => {
      expect(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 0) = 45").eval(patient)).toEqual([true]);
    });

    test('testAggregate2', () => {
      expect(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate($this+$total, 2) = 47").eval(patient)).toEqual([true]);
    });

    test('testAggregate3', () => {
      expect(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this < $total, $this, $total))) = 1").eval(patient)).toEqual([true]);
    });

    test('testAggregate4', () => {
      expect(parseFhirPath("(1|2|3|4|5|6|7|8|9).aggregate(iif($total.empty(), $this, iif($this > $total, $this, $total))) = 9").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testIndexer', () => {

    test('testIndexer1', () => {
      expect(parseFhirPath("Patient.name[0].given = 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

    test('testIndexer2', () => {
      expect(parseFhirPath("Patient.name[1].given = 'Jim'").eval(patient)).toEqual([true]);
    });

  });

  describe('testSingle', () => {

    test('testSingle1', () => {
      expect(parseFhirPath("Patient.name.first().single().exists()").eval(patient)).toEqual([true]);
    });

    test('testSingle2', () => {
      expect(() => parseFhirPath("Patient.name.single().exists()").eval(patient)).toThrow();
    });

  });

  describe('testFirstLast', () => {

    test('testFirstLast1', () => {
      expect(parseFhirPath("Patient.name.first().given = 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

    test('testFirstLast2', () => {
      expect(parseFhirPath("Patient.name.last().given = 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

  });

  describe('testTail', () => {

    test('testTail1', () => {
      expect(parseFhirPath("(0 | 1 | 2).tail() = 1 | 2").eval(patient)).toEqual([true]);
    });

    test('testTail2', () => {
      expect(parseFhirPath("Patient.name.tail().given = 'Jim' | 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

  });

  describe('testSkip', () => {

    test('testSkip1', () => {
      expect(parseFhirPath("(0 | 1 | 2).skip(1) = 1 | 2").eval(patient)).toEqual([true]);
    });

    test('testSkip2', () => {
      expect(parseFhirPath("(0 | 1 | 2).skip(2) = 2").eval(patient)).toEqual([true]);
    });

    test('testSkip3', () => {
      expect(parseFhirPath("Patient.name.skip(1).given.trace('test') = 'Jim' | 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

    test('testSkip4', () => {
      expect(parseFhirPath("Patient.name.skip(3).given.exists() = false").eval(patient)).toEqual([true]);
    });

  });

  describe('testTake', () => {

    test('testTake1', () => {
      expect(parseFhirPath("(0 | 1 | 2).take(1) = 0").eval(patient)).toEqual([true]);
    });

    test('testTake2', () => {
      expect(parseFhirPath("(0 | 1 | 2).take(2) = 0 | 1").eval(patient)).toEqual([true]);
    });

    test('testTake3', () => {
      expect(parseFhirPath("Patient.name.take(1).given = 'Peter' | 'James'").eval(patient)).toEqual([true]);
    });

    test('testTake4', () => {
      expect(parseFhirPath("Patient.name.take(2).given = 'Peter' | 'James' | 'Jim'").eval(patient)).toEqual([true]);
    });

    test('testTake5', () => {
      expect(parseFhirPath("Patient.name.take(3).given.count() = 5").eval(patient)).toEqual([true]);
    });

    test('testTake6', () => {
      expect(parseFhirPath("Patient.name.take(4).given.count() = 5").eval(patient)).toEqual([true]);
    });

    test('testTake7', () => {
      expect(parseFhirPath("Patient.name.take(0).given.exists() = false").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testIif', () => {

    test('testIif1', () => {
      expect(parseFhirPath("iif(Patient.name.exists(), 'named', 'unnamed') = 'named'").eval(patient)).toEqual([true]);
    });

    test('testIif2', () => {
      expect(parseFhirPath("iif(Patient.name.empty(), 'unnamed', 'named') = 'named'").eval(patient)).toEqual([true]);
    });

    test('testIif3', () => {
      expect(parseFhirPath("iif(true, true, (1 | 2).toString())").eval(patient)).toEqual([true]);
    });

    test('testIif4', () => {
      expect(parseFhirPath("iif(false, (1 | 2).toString(), true)").eval(patient)).toEqual([true]);
    });

  });

  describe('testToInteger', () => {

    test('testToInteger1', () => {
      expect(parseFhirPath("'1'.toInteger() = 1").eval(patient)).toEqual([true]);
    });

    test('testToInteger2', () => {
      expect(parseFhirPath("'-1'.toInteger() = -1").eval(patient)).toEqual([true]);
    });

    test('testToInteger3', () => {
      expect(parseFhirPath("'0'.toInteger() = 0").eval(patient)).toEqual([true]);
    });

    test('testToInteger4', () => {
      expect(parseFhirPath("'0.0'.toInteger().empty()").eval(patient)).toEqual([true]);
    });

    test('testToInteger5', () => {
      expect(parseFhirPath("'st'.toInteger().empty()").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testToDecimal', () => {

    test('testToDecimal1', () => {
      expect(parseFhirPath("'1'.toDecimal() = 1").eval(patient)).toEqual([true]);
    });

    test('testToDecimal2', () => {
      expect(parseFhirPath("'-1'.toInteger() = -1").eval(patient)).toEqual([true]);
    });

    test('testToDecimal3', () => {
      expect(parseFhirPath("'0'.toDecimal() = 0").eval(patient)).toEqual([true]);
    });

    test('testToDecimal4', () => {
      expect(parseFhirPath("'0.0'.toDecimal() = 0.0").eval(patient)).toEqual([true]);
    });

    test('testToDecimal5', () => {
      expect(parseFhirPath("'st'.toDecimal().empty()").eval(patient)).toEqual([true]);
    });

  });

  describe('testToString', () => {

    test('testToString1', () => {
      expect(parseFhirPath("1.toString() = '1'").eval(patient)).toEqual([true]);
    });

    test('testToString2', () => {
      expect(parseFhirPath("'-1'.toInteger() = -1").eval(patient)).toEqual([true]);
    });

    test('testToString3', () => {
      expect(parseFhirPath("0.toString() = '0'").eval(patient)).toEqual([true]);
    });

    test.skip('testToString4', () => {
      expect(parseFhirPath("0.0.toString() = '0.0'").eval(patient)).toEqual([true]);
    });

    test('testToString5', () => {
      expect(parseFhirPath("@2014-12-14.toString() = '2014-12-14'").eval(patient)).toEqual([true]);
    });

  });

  describe('testCase', () => {

    test('testCase1', () => {
      expect(parseFhirPath("'t'.upper() = 'T'").eval(patient)).toEqual([true]);
    });

    test('testCase2', () => {
      expect(parseFhirPath("'t'.lower() = 't'").eval(patient)).toEqual([true]);
    });

    test('testCase3', () => {
      expect(parseFhirPath("'T'.upper() = 'T'").eval(patient)).toEqual([true]);
    });

    test('testCase4', () => {
      expect(parseFhirPath("'T'.lower() = 't'").eval(patient)).toEqual([true]);
    });

  });

  describe('testToChars', () => {

    test('testToChars1', () => {
      expect(parseFhirPath("'t2'.toChars() = 't' | '2'").eval(patient)).toEqual([true]);
    });

  });

  describe('testSubstring', () => {

    test('testSubstring1', () => {
      expect(parseFhirPath("'12345'.substring(2) = '345'").eval(patient)).toEqual([true]);
    });

    test('testSubstring2', () => {
      expect(parseFhirPath("'12345'.substring(2,1) = '3'").eval(patient)).toEqual([true]);
    });

    test('testSubstring3', () => {
      expect(parseFhirPath("'12345'.substring(2,5) = '345'").eval(patient)).toEqual([true]);
    });

    test('testSubstring4', () => {
      expect(parseFhirPath("'12345'.substring(25).empty()").eval(patient)).toEqual([true]);
    });

    test('testSubstring5', () => {
      expect(parseFhirPath("'12345'.substring(-1).empty()").eval(patient)).toEqual([true]);
    });

  });

  describe('testStartsWith', () => {

    test('testStartsWith1', () => {
      expect(parseFhirPath("'12345'.startsWith('2') = false").eval(patient)).toEqual([true]);
    });

    test('testStartsWith2', () => {
      expect(parseFhirPath("'12345'.startsWith('1') = true").eval(patient)).toEqual([true]);
    });

    test('testStartsWith3', () => {
      expect(parseFhirPath("'12345'.startsWith('12') = true").eval(patient)).toEqual([true]);
    });

    test('testStartsWith4', () => {
      expect(parseFhirPath("'12345'.startsWith('13') = false").eval(patient)).toEqual([true]);
    });

    test('testStartsWith5', () => {
      expect(parseFhirPath("'12345'.startsWith('12345') = true").eval(patient)).toEqual([true]);
    });

    test('testStartsWith6', () => {
      expect(parseFhirPath("'12345'.startsWith('123456') = false").eval(patient)).toEqual([true]);
    });

    test('testStartsWith7', () => {
      expect(parseFhirPath("'12345'.startsWith('') = true").eval(patient)).toEqual([true]);
    });

  });

  describe('testEndsWith', () => {

    test('testEndsWith1', () => {
      expect(parseFhirPath("'12345'.endsWith('2') = false").eval(patient)).toEqual([true]);
    });

    test('testEndsWith2', () => {
      expect(parseFhirPath("'12345'.endsWith('5') = true").eval(patient)).toEqual([true]);
    });

    test('testEndsWith3', () => {
      expect(parseFhirPath("'12345'.endsWith('45') = true").eval(patient)).toEqual([true]);
    });

    test('testEndsWith4', () => {
      expect(parseFhirPath("'12345'.endsWith('35') = false").eval(patient)).toEqual([true]);
    });

    test('testEndsWith5', () => {
      expect(parseFhirPath("'12345'.endsWith('12345') = true").eval(patient)).toEqual([true]);
    });

    test('testEndsWith6', () => {
      expect(parseFhirPath("'12345'.endsWith('012345') = false").eval(patient)).toEqual([true]);
    });

    test('testEndsWith7', () => {
      expect(parseFhirPath("'12345'.endsWith('') = true").eval(patient)).toEqual([true]);
    });

  });

  describe('testContainsString', () => {

    test('testContainsString1', () => {
      expect(parseFhirPath("'12345'.contains('6') = false").eval(patient)).toEqual([true]);
    });

    test('testContainsString2', () => {
      expect(parseFhirPath("'12345'.contains('5') = true").eval(patient)).toEqual([true]);
    });

    test('testContainsString3', () => {
      expect(parseFhirPath("'12345'.contains('45') = true").eval(patient)).toEqual([true]);
    });

    test('testContainsString4', () => {
      expect(parseFhirPath("'12345'.contains('35') = false").eval(patient)).toEqual([true]);
    });

    test('testContainsString5', () => {
      expect(parseFhirPath("'12345'.contains('12345') = true").eval(patient)).toEqual([true]);
    });

    test('testContainsString6', () => {
      expect(parseFhirPath("'12345'.contains('012345') = false").eval(patient)).toEqual([true]);
    });

    test('testContainsString7', () => {
      expect(parseFhirPath("'12345'.contains('') = true").eval(patient)).toEqual([true]);
    });

  });

  describe('testLength', () => {

    test('testLength1', () => {
      expect(parseFhirPath("'123456'.length() = 6").eval(patient)).toEqual([true]);
    });

    test('testLength2', () => {
      expect(parseFhirPath("'12345'.length() = 5").eval(patient)).toEqual([true]);
    });

    test('testLength3', () => {
      expect(parseFhirPath("'123'.length() = 3").eval(patient)).toEqual([true]);
    });

    test('testLength4', () => {
      expect(parseFhirPath("'1'.length() = 1").eval(patient)).toEqual([true]);
    });

    test('testLength5', () => {
      expect(parseFhirPath("''.length() = 0").eval(patient)).toEqual([true]);
    });

  });

  describe('testTrace', () => {

    test('testTrace1', () => {
      expect(parseFhirPath("name.given.trace('test').count() = 5").eval(patient)).toEqual([true]);
    });

    test('testTrace2', () => {
      expect(parseFhirPath("name.trace('test', given).count() = 3").eval(patient)).toEqual([true]);
    });

  });

  describe('testToday', () => {

    test('testToday1', () => {
      expect(parseFhirPath("Patient.birthDate < today()").eval(patient)).toEqual([true]);
    });

    test('testToday2', () => {
      expect(parseFhirPath("today().toString().length() = 10").eval(patient)).toEqual([true]);
    });

  });

  describe('testNow', () => {

    test('testNow1', () => {
      expect(parseFhirPath("Patient.birthDate < now()").eval(patient)).toEqual([true]);
    });

    test('testNow2', () => {
      expect(parseFhirPath("now().toString().length() > 10").eval(patient)).toEqual([true]);
    });

  });

  describe('testEquality', () => {

    test('testEquality1', () => {
      expect(parseFhirPath("1 = 1").eval(patient)).toEqual([true]);
    });

    test('testEquality2', () => {
      expect(() => parseFhirPath("{} = {}").eval(patient)).not.toThrow();
    });

    test('testEquality3', () => {
      expect(() => parseFhirPath("true = {}").eval(patient)).not.toThrow();
    });

    test('testEquality4', () => {
      expect(parseFhirPath("(1) = (1)").eval(patient)).toEqual([true]);
    });

    test('testEquality5', () => {
      expect(parseFhirPath("(1 | 2) = (1 | 2)").eval(patient)).toEqual([true]);
    });

    test('testEquality6', () => {
      expect(parseFhirPath("(1 | 2 | 3) = (1 | 2 | 3)").eval(patient)).toEqual([true]);
    });

    test('testEquality7', () => {
      expect(() => parseFhirPath("(1 | 1) = (1 | 2 | {})").eval(patient)).not.toThrow();
    });

    test('testEquality8', () => {
      expect(parseFhirPath("1 = 2").eval(patient)).toEqual([false]);
    });

    test('testEquality9', () => {
      expect(parseFhirPath("'a' = 'a'").eval(patient)).toEqual([true]);
    });

    test('testEquality10', () => {
      expect(parseFhirPath("'a' = 'A'").eval(patient)).toEqual([false]);
    });

    test('testEquality11', () => {
      expect(parseFhirPath("'a' = 'b'").eval(patient)).toEqual([false]);
    });

    test('testEquality12', () => {
      expect(parseFhirPath("1.1 = 1.1").eval(patient)).toEqual([true]);
    });

    test('testEquality13', () => {
      expect(parseFhirPath("1.1 = 1.2").eval(patient)).toEqual([false]);
    });

    test('testEquality14', () => {
      expect(parseFhirPath("1.10 = 1.1").eval(patient)).toEqual([true]);
    });

    test('testEquality15', () => {
      expect(parseFhirPath("0 = 0").eval(patient)).toEqual([true]);
    });

    test('testEquality16', () => {
      expect(parseFhirPath("0.0 = 0").eval(patient)).toEqual([true]);
    });

    test('testEquality17', () => {
      expect(parseFhirPath("@2012-04-15 = @2012-04-15").eval(patient)).toEqual([true]);
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

    test.skip('testEquality21', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 = @2012-04-15T15:30:31.0").eval(patient)).toEqual([true]);
    });

    test('testEquality22', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 = @2012-04-15T15:30:31.1").eval(patient)).toEqual([false]);
    });

    test('testEquality23', () => {
      expect(() => parseFhirPath("@2012-04-15T15:00:00Z = @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testEquality24', () => {
      expect(parseFhirPath("@2012-04-15T15:00:00+02:00 = @2012-04-15T16:00:00+03:00").eval(patient)).toEqual([true]);
    });

    test('testEquality25', () => {
      expect(parseFhirPath("name = name").eval(patient)).toEqual([true]);
    });

    test('testEquality26', () => {
      expect(parseFhirPath("name.take(2) = name.take(2).first() | name.take(2).last()").eval(patient)).toEqual([true]);
    });

    test('testEquality27', () => {
      expect(parseFhirPath("name.take(2) = name.take(2).last() | name.take(2).first()").eval(patient)).toEqual([false]);
    });

    test('testEquality28', () => {
      expect(parseFhirPath("Observation.value = 185 '[lb_av]'").eval(observation)).toEqual([true]);
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
      expect(parseFhirPath("1 != 2").eval(patient)).toEqual([true]);
    });

    test('testNEquality4', () => {
      expect(parseFhirPath("'a' != 'a'").eval(patient)).toEqual([false]);
    });

    test('testNEquality5', () => {
      expect(parseFhirPath("'a' != 'b'").eval(patient)).toEqual([true]);
    });

    test('testNEquality6', () => {
      expect(parseFhirPath("1.1 != 1.1").eval(patient)).toEqual([false]);
    });

    test('testNEquality7', () => {
      expect(parseFhirPath("1.1 != 1.2").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("@2012-04-15 != @2012-04-16").eval(patient)).toEqual([true]);
    });

    test('testNEquality13', () => {
      expect(() => parseFhirPath("@2012-04-15 != @2012-04-15T10:00:00").eval(patient)).not.toThrow();
    });

    test('testNEquality14', () => {
      expect(parseFhirPath("@2012-04-15T15:00:00 != @2012-04-15T10:00:00").eval(patient)).toEqual([true]);
    });

    test.skip('testNEquality15', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 != @2012-04-15T15:30:31.0").eval(patient)).toEqual([false]);
    });

    test('testNEquality16', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 != @2012-04-15T15:30:31.1").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("name.take(2) != name.take(2).last() | name.take(2).first()").eval(patient)).toEqual([true]);
    });

    test('testNEquality22', () => {
      expect(parseFhirPath("1.2 / 1.8 != 0.6666667").eval(patient)).toEqual([true]);
    });

    test('testNEquality23', () => {
      expect(parseFhirPath("1.2 / 1.8 != 0.67").eval(patient)).toEqual([true]);
    });

    test('testNEquality24', () => {
      expect(parseFhirPath("Observation.value != 185 'kg'").eval(observation)).toEqual([true]);
    });

  });

  describe('testEquivalent', () => {

    test('testEquivalent1', () => {
      expect(parseFhirPath("1 ~ 1").eval(patient)).toEqual([true]);
    });

    test('testEquivalent2', () => {
      expect(parseFhirPath("{} ~ {}").eval(patient)).toEqual([true]);
    });

    test('testEquivalent3', () => {
      expect(parseFhirPath("1 ~ {}").eval(patient)).toEqual([false]);
    });

    test('testEquivalent4', () => {
      expect(parseFhirPath("1 ~ 2").eval(patient)).toEqual([false]);
    });

    test('testEquivalent5', () => {
      expect(parseFhirPath("'a' ~ 'a'").eval(patient)).toEqual([true]);
    });

    test('testEquivalent6', () => {
      expect(parseFhirPath("'a' ~ 'A'").eval(patient)).toEqual([true]);
    });

    test('testEquivalent7', () => {
      expect(parseFhirPath("'a' ~ 'b'").eval(patient)).toEqual([false]);
    });

    test('testEquivalent8', () => {
      expect(parseFhirPath("1.1 ~ 1.1").eval(patient)).toEqual([true]);
    });

    test('testEquivalent9', () => {
      expect(parseFhirPath("1.1 ~ 1.2").eval(patient)).toEqual([false]);
    });

    test('testEquivalent10', () => {
      expect(parseFhirPath("1.10 ~ 1.1").eval(patient)).toEqual([true]);
    });

    test('testEquivalent11', () => {
      expect(parseFhirPath("1.2 / 1.8 ~ 0.67").eval(patient)).toEqual([true]);
    });

    test('testEquivalent12', () => {
      expect(parseFhirPath("0 ~ 0").eval(patient)).toEqual([true]);
    });

    test('testEquivalent13', () => {
      expect(parseFhirPath("0.0 ~ 0").eval(patient)).toEqual([true]);
    });

    test('testEquivalent14', () => {
      expect(parseFhirPath("@2012-04-15 ~ @2012-04-15").eval(patient)).toEqual([true]);
    });

    test('testEquivalent15', () => {
      expect(parseFhirPath("@2012-04-15 ~ @2012-04-16").eval(patient)).toEqual([false]);
    });

    test('testEquivalent16', () => {
      expect(parseFhirPath("@2012-04-15 ~ @2012-04-15T10:00:00").eval(patient)).toEqual([false]);
    });

    test.skip('testEquivalent17', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.0").eval(patient)).toEqual([true]);
    });

    test('testEquivalent18', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 ~ @2012-04-15T15:30:31.1").eval(patient)).toEqual([false]);
    });

    test('testEquivalent19', () => {
      expect(parseFhirPath("name ~ name").eval(patient)).toEqual([true]);
    });

    test('testEquivalent20', () => {
      expect(parseFhirPath("name.take(2).given ~ name.take(2).first().given | name.take(2).last().given").eval(patient)).toEqual([true]);
    });

    test('testEquivalent21', () => {
      expect(parseFhirPath("name.take(2).given ~ name.take(2).last().given | name.take(2).first().given").eval(patient)).toEqual([true]);
    });

    test('testEquivalent22', () => {
      expect(parseFhirPath("Observation.value ~ 185 '[lb_av]'").eval(observation)).toEqual([true]);
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
      expect(parseFhirPath("{} !~ 1").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent4', () => {
      expect(parseFhirPath("1 !~ 2").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent5', () => {
      expect(parseFhirPath("'a' !~ 'a'").eval(patient)).toEqual([false]);
    });

    test.skip('testNotEquivalent6', () => {
      expect(parseFhirPath("'a' !~ 'A'").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent7', () => {
      expect(parseFhirPath("'a' !~ 'b'").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent8', () => {
      expect(parseFhirPath("1.1 !~ 1.1").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent9', () => {
      expect(parseFhirPath("1.1 !~ 1.2").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("1.2 / 1.8 !~ 0.6").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent14', () => {
      expect(parseFhirPath("@2012-04-15 !~ @2012-04-15").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent15', () => {
      expect(parseFhirPath("@2012-04-15 !~ @2012-04-16").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent16', () => {
      expect(parseFhirPath("@2012-04-15 !~ @2012-04-15T10:00:00").eval(patient)).toEqual([true]);
    });

    test.skip('testNotEquivalent17', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.0").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent18', () => {
      expect(parseFhirPath("@2012-04-15T15:30:31 !~ @2012-04-15T15:30:31.1").eval(patient)).toEqual([true]);
    });

    test('testNotEquivalent19', () => {
      // The official test suite suggests this should be true.
      // According to the spec, it should be false.
      expect(parseFhirPath("name !~ name").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent20', () => {
      expect(parseFhirPath("name.take(2).given !~ name.take(2).first().given | name.take(2).last().given").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent21', () => {
      expect(parseFhirPath("name.take(2).given !~ name.take(2).last().given | name.take(2).first().given").eval(patient)).toEqual([false]);
    });

    test('testNotEquivalent22', () => {
      expect(parseFhirPath("Observation.value !~ 185 'kg'").eval(observation)).toEqual([true]);
    });

  });

  describe('testLessThan', () => {

    test('testLessThan1', () => {
      expect(parseFhirPath("1 < 2").eval(patient)).toEqual([true]);
    });

    test('testLessThan2', () => {
      expect(parseFhirPath("1.0 < 1.2").eval(patient)).toEqual([true]);
    });

    test('testLessThan3', () => {
      expect(parseFhirPath("'a' < 'b'").eval(patient)).toEqual([true]);
    });

    test('testLessThan4', () => {
      expect(parseFhirPath("'A' < 'a'").eval(patient)).toEqual([true]);
    });

    test('testLessThan5', () => {
      expect(parseFhirPath("@2014-12-12 < @2014-12-13").eval(patient)).toEqual([true]);
    });

    test('testLessThan6', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 < @2014-12-13T12:00:01").eval(patient)).toEqual([true]);
    });

    test('testLessThan7', () => {
      expect(parseFhirPath("@T12:00:00 < @T14:00:00").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("Observation.value < 200 '[lb_av]'").eval(observation)).toEqual([true]);
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
      expect(parseFhirPath("1 <= 2").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual2', () => {
      expect(parseFhirPath("1.0 <= 1.2").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual3', () => {
      expect(parseFhirPath("'a' <= 'b'").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual4', () => {
      expect(parseFhirPath("'A' <= 'a'").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual5', () => {
      expect(parseFhirPath("@2014-12-12 <= @2014-12-13").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual6', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 <= @2014-12-13T12:00:01").eval(patient)).toEqual([true]);
    });

    test.skip('testLessOrEqual7', () => {
      expect(parseFhirPath("@T12:00:00 <= @T14:00:00").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual8', () => {
      expect(parseFhirPath("1 <= 1").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual9', () => {
      expect(parseFhirPath("1.0 <= 1.0").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual10', () => {
      expect(parseFhirPath("'a' <= 'a'").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual11', () => {
      expect(parseFhirPath("'A' <= 'A'").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual12', () => {
      expect(parseFhirPath("@2014-12-12 <= @2014-12-12").eval(patient)).toEqual([true]);
    });

    test('testLessOrEqual13', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 <= @2014-12-13T12:00:00").eval(patient)).toEqual([true]);
    });

    test.skip('testLessOrEqual14', () => {
      expect(parseFhirPath("@T12:00:00 <= @T12:00:00").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("Observation.value <= 200 '[lb_av]'").eval(observation)).toEqual([true]);
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
      expect(parseFhirPath("@2018-03-01T10:30:00  <= @2018-03-01T10:30:00.0").eval(patient)).toEqual([true]);
    });

    test.skip('testLessOrEqual27', () => {
      expect(parseFhirPath("@T10:30:00 <= @T10:30:00.0").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("1 >= 1").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual9', () => {
      expect(parseFhirPath("1.0 >= 1.0").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual10', () => {
      expect(parseFhirPath("'a' >= 'a'").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual11', () => {
      expect(parseFhirPath("'A' >= 'A'").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual12', () => {
      expect(parseFhirPath("@2014-12-12 >= @2014-12-12").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual13', () => {
      expect(parseFhirPath("@2014-12-13T12:00:00 >= @2014-12-13T12:00:00").eval(patient)).toEqual([true]);
    });

    test.skip('testGreatorOrEqual14', () => {
      expect(parseFhirPath("@T12:00:00 >= @T12:00:00").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual15', () => {
      expect(parseFhirPath("2 >= 1").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual16', () => {
      expect(parseFhirPath("1.1 >= 1.0").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual17', () => {
      expect(parseFhirPath("'b' >= 'a'").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual18', () => {
      expect(parseFhirPath("'B' >= 'A'").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual19', () => {
      expect(parseFhirPath("@2014-12-13 >= @2014-12-12").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual20', () => {
      expect(parseFhirPath("@2014-12-13T12:00:01 >= @2014-12-13T12:00:00").eval(patient)).toEqual([true]);
    });

    test.skip('testGreatorOrEqual21', () => {
      expect(parseFhirPath("@T12:00:01 >= @T12:00:00").eval(patient)).toEqual([true]);
    });

    test('testGreatorOrEqual22', () => {
      expect(parseFhirPath("Observation.value >= 100 '[lb_av]'").eval(observation)).toEqual([true]);
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
      expect(parseFhirPath("@2018-03-01T10:30:00 >= @2018-03-01T10:30:00.0").eval(patient)).toEqual([true]);
    });

    test.skip('testGreatorOrEqual27', () => {
      expect(parseFhirPath("@T10:30:00 >= @T10:30:00.0").eval(patient)).toEqual([true]);
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
      expect(parseFhirPath("2 > 1").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan16', () => {
      expect(parseFhirPath("1.1 > 1.0").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan17', () => {
      expect(parseFhirPath("'b' > 'a'").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan18', () => {
      expect(parseFhirPath("'B' > 'A'").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan19', () => {
      expect(parseFhirPath("@2014-12-13 > @2014-12-12").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan20', () => {
      expect(parseFhirPath("@2014-12-13T12:00:01 > @2014-12-13T12:00:00").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan21', () => {
      expect(parseFhirPath("@T12:00:01 > @T12:00:00").eval(patient)).toEqual([true]);
    });

    test('testGreaterThan22', () => {
      expect(parseFhirPath("Observation.value > 100 '[lb_av]'").eval(observation)).toEqual([true]);
    });

    test('testGreaterThan23', () => {
      expect(() => parseFhirPath("@2018-03 > @2018-03-01").eval(patient)).not.toThrow();
    });

    test.skip('testGreaterThan24', () => {
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
      expect(parseFhirPath("(1 | 2 | 3).count() = 3").eval(patient)).toEqual([true]);
    });

    test('testUnion2', () => {
      expect(parseFhirPath("(1 | 2 | 2).count() = 2").eval(patient)).toEqual([true]);
    });

    test('testUnion3', () => {
      expect(parseFhirPath("(1|1).count() = 1").eval(patient)).toEqual([true]);
    });

    test('testUnion4', () => {
      expect(parseFhirPath("1.union(2).union(3).count() = 3").eval(patient)).toEqual([true]);
    });

    test('testUnion5', () => {
      expect(parseFhirPath("1.union(2.union(3)).count() = 3").eval(patient)).toEqual([true]);
    });

    test('testUnion6', () => {
      expect(parseFhirPath("(1 | 2).combine(2).count() = 3").eval(patient)).toEqual([true]);
    });

    test('testUnion7', () => {
      expect(parseFhirPath("1.combine(1).count() = 2").eval(patient)).toEqual([true]);
    });

    test('testUnion8', () => {
      expect(parseFhirPath("1.combine(1).union(2).count() = 2").eval(patient)).toEqual([true]);
    });

  });

  describe('testIntersect', () => {

    test('testIntersect1', () => {
      expect(parseFhirPath("(1 | 2 | 3).intersect(2 | 4) = 2").eval(patient)).toEqual([true]);
    });

    test('testIntersect2', () => {
      expect(parseFhirPath("(1 | 2).intersect(4).empty()").eval(patient)).toEqual([true]);
    });

    test('testIntersect3', () => {
      expect(parseFhirPath("(1 | 2).intersect({}).empty()").eval(patient)).toEqual([true]);
    });

    test('testIntersect4', () => {
      expect(parseFhirPath("1.combine(1).intersect(1).count() = 1").eval(patient)).toEqual([true]);
    });

  });

  describe('testExclude', () => {

    test('testExclude1', () => {
      expect(parseFhirPath("(1 | 2 | 3).exclude(2 | 4) = 1 | 3").eval(patient)).toEqual([true]);
    });

    test('testExclude2', () => {
      expect(parseFhirPath("(1 | 2).exclude(4) = 1 | 2").eval(patient)).toEqual([true]);
    });

    test('testExclude3', () => {
      expect(parseFhirPath("(1 | 2).exclude({}) = 1 | 2").eval(patient)).toEqual([true]);
    });

    test('testExclude4', () => {
      expect(parseFhirPath("1.combine(1).exclude(2).count() = 2").eval(patient)).toEqual([true]);
    });

  });

  describe('testIn', () => {

    test('testIn1', () => {
      expect(parseFhirPath("1 in (1 | 2 | 3)").eval(patient)).toEqual([true]);
    });

    test('testIn2', () => {
      expect(parseFhirPath("1 in (2 | 3)").eval(patient)).toEqual([false]);
    });

    test('testIn3', () => {
      expect(parseFhirPath("'a' in ('a' | 'c' | 'd')").eval(patient)).toEqual([true]);
    });

    test('testIn4', () => {
      expect(parseFhirPath("'b' in ('a' | 'c' | 'd')").eval(patient)).toEqual([false]);
    });

  });

  describe('testContainsCollection', () => {

    test('testContainsCollection1', () => {
      expect(parseFhirPath("(1 | 2 | 3) contains 1").eval(patient)).toEqual([true]);
    });

    test('testContainsCollection2', () => {
      expect(parseFhirPath("(2 | 3) contains 1").eval(patient)).toEqual([false]);
    });

    test('testContainsCollection3', () => {
      expect(parseFhirPath("('a' | 'c' | 'd') contains 'a'").eval(patient)).toEqual([true]);
    });

    test('testContainsCollection4', () => {
      expect(parseFhirPath("('a' | 'c' | 'd') contains 'b'").eval(patient)).toEqual([false]);
    });

  });

  describe('testBooleanLogicAnd', () => {

    test('testBooleanLogicAnd1', () => {
      expect(parseFhirPath("(true and true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd2', () => {
      expect(parseFhirPath("(true and false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd3', () => {
      expect(parseFhirPath("(true and {}).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd4', () => {
      expect(parseFhirPath("(false and true) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd5', () => {
      expect(parseFhirPath("(false and false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd6', () => {
      expect(parseFhirPath("(false and {}) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd7', () => {
      expect(parseFhirPath("({} and true).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd8', () => {
      expect(parseFhirPath("({} and false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicAnd9', () => {
      expect(parseFhirPath("({} and {}).empty()").eval(patient)).toEqual([true]);
    });

  });

  describe('testBooleanLogicOr', () => {

    test('testBooleanLogicOr1', () => {
      expect(parseFhirPath("(true or true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr2', () => {
      expect(parseFhirPath("(true or false) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr3', () => {
      expect(parseFhirPath("(true or {}) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr4', () => {
      expect(parseFhirPath("(false or true) = true").eval(patient)).toEqual([true]);
    });

    test.skip('testBooleanLogicOr5', () => {
      expect(parseFhirPath("(false or false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr6', () => {
      expect(parseFhirPath("(false or {}).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr7', () => {
      expect(parseFhirPath("({} or true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr8', () => {
      expect(parseFhirPath("({} or false).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicOr9', () => {
      expect(parseFhirPath("({} or {}).empty()").eval(patient)).toEqual([true]);
    });

  });

  describe('testBooleanLogicXOr', () => {

    test('testBooleanLogicXOr1', () => {
      expect(parseFhirPath("(true xor true) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr2', () => {
      expect(parseFhirPath("(true xor false) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr3', () => {
      // The official test expects this to be true.
      // However, according to the spec, I believe this should be false.
      //
      // The spec says:
      //   "Returns true if exactly one of the operands evaluates to true,
      //    false if either both operands evaluate to true or both operands evaluate to false,
      //    and the empty collection ({ }) otherwise:"
      //
      // I believe the first condition holds:  exactly one of the operands evaluates to true.
      // Therefore, it should return true.
      // Which should not satisfy .empty().
      expect(parseFhirPath("(true xor {}).empty()").eval(patient)).toEqual([false]);
    });

    test('testBooleanLogicXOr4', () => {
      expect(parseFhirPath("(false xor true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr5', () => {
      expect(parseFhirPath("(false xor false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr6', () => {
      expect(parseFhirPath("(false xor {}).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr7', () => {
      // The official test expects this to be true.
      // However, according to the spec, I believe this should be false.
      //
      // The spec says:
      //   "Returns true if exactly one of the operands evaluates to true,
      //    false if either both operands evaluate to true or both operands evaluate to false,
      //    and the empty collection ({ }) otherwise:"
      //
      // I believe the first condition holds:  exactly one of the operands evaluates to true.
      // Therefore, it should return true.
      // Which should not satisfy .empty().
      expect(parseFhirPath("({} xor true).empty()").eval(patient)).toEqual([false]);
    });

    test('testBooleanLogicXOr8', () => {
      expect(parseFhirPath("({} xor false).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanLogicXOr9', () => {
      expect(parseFhirPath("({} xor {}).empty()").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testBooleanImplies', () => {

    test('testBooleanImplies1', () => {
      expect(parseFhirPath("(true implies true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies2', () => {
      expect(parseFhirPath("(true implies false) = false").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies3', () => {
      expect(parseFhirPath("(true implies {}).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies4', () => {
      expect(parseFhirPath("(false implies true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies5', () => {
      expect(parseFhirPath("(false implies false) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies6', () => {
      expect(parseFhirPath("(false implies {}) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies7', () => {
      expect(parseFhirPath("({} implies true) = true").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies8', () => {
      expect(parseFhirPath("({} implies false).empty()").eval(patient)).toEqual([true]);
    });

    test('testBooleanImplies9', () => {
      expect(parseFhirPath("({} implies {}).empty()").eval(patient)).toEqual([true]);
    });

  });

  describe('testPlus', () => {

    test('testPlus1', () => {
      expect(parseFhirPath("1 + 1 = 2").eval(patient)).toEqual([true]);
    });

    test('testPlus2', () => {
      expect(parseFhirPath("1 + 0 = 1").eval(patient)).toEqual([true]);
    });

    test('testPlus3', () => {
      expect(parseFhirPath("1.2 + 1.8 = 3.0").eval(patient)).toEqual([true]);
    });

    test('testPlus4', () => {
      expect(parseFhirPath("'a'+'b' = 'ab'").eval(patient)).toEqual([true]);
    });

  });

  describe('testConcatenate', () => {

    test('testConcatenate1', () => {
      expect(parseFhirPath("'a' & 'b' = 'ab'").eval(patient)).toEqual([true]);
    });

    test('testConcatenate2', () => {
      expect(parseFhirPath("'1' & {} = '1'").eval(patient)).toEqual([true]);
    });

    test('testConcatenate3', () => {
      expect(parseFhirPath("{} & 'b' = 'b'").eval(patient)).toEqual([true]);
    });

    test.skip('testConcatenate4', () => {
      expect(() => parseFhirPath("(1 | 2 | 3) & 'b' = '1,2,3b'").eval(patient)).toThrow();
    });

  });

  describe('testMinus', () => {

    test('testMinus1', () => {
      expect(parseFhirPath("1 - 1 = 0").eval(patient)).toEqual([true]);
    });

    test('testMinus2', () => {
      expect(parseFhirPath("1 - 0 = 1").eval(patient)).toEqual([true]);
    });

    test('testMinus3', () => {
      expect(parseFhirPath("1.8 - 1.2 = 0.6").eval(patient)).toEqual([true]);
    });

    test.skip('testMinus4', () => {
      expect(() => parseFhirPath("'a'-'b' = 'ab'").eval(patient)).toThrow();
    });

  });

  describe('testMultiply', () => {

    test('testMultiply1', () => {
      expect(parseFhirPath("1.2 * 1.8 = 2.16").eval(patient)).toEqual([true]);
    });

    test('testMultiply2', () => {
      expect(parseFhirPath("1 * 1 = 1").eval(patient)).toEqual([true]);
    });

    test('testMultiply3', () => {
      expect(parseFhirPath("1 * 0 = 0").eval(patient)).toEqual([true]);
    });

  });

  describe('testDivide', () => {

    test('testDivide1', () => {
      expect(parseFhirPath("1 / 1 = 1").eval(patient)).toEqual([true]);
    });

    test('testDivide2', () => {
      expect(parseFhirPath("4 / 2 = 2").eval(patient)).toEqual([true]);
    });

    test('testDivide3', () => {
      expect(parseFhirPath("4.0 / 2.0 = 2.0").eval(patient)).toEqual([true]);
    });

    test('testDivide4', () => {
      expect(parseFhirPath("1 / 2 = 0.5").eval(patient)).toEqual([true]);
    });

    test('testDivide5', () => {
      expect(parseFhirPath("1.2 / 1.8 = 0.66666667").eval(patient)).toEqual([true]);
    });

    test('testDivide6', () => {
      expect(() => parseFhirPath("1 / 0").eval(patient)).not.toThrow();
    });

  });

  describe('testDiv', () => {

    test('testDiv1', () => {
      expect(parseFhirPath("1 div 1 = 1").eval(patient)).toEqual([true]);
    });

    test('testDiv2', () => {
      expect(parseFhirPath("4 div 2 = 2").eval(patient)).toEqual([true]);
    });

    test('testDiv3', () => {
      expect(parseFhirPath("5 div 2 = 2").eval(patient)).toEqual([true]);
    });

    test('testDiv4', () => {
      expect(parseFhirPath("2.2 div 1.8 = 1").eval(patient)).toEqual([true]);
    });

    test('testDiv5', () => {
      expect(() => parseFhirPath("5 div 0").eval(patient)).not.toThrow();
    });

  });

  describe('testMod', () => {

    test('testMod1', () => {
      expect(parseFhirPath("1 mod 1 = 0").eval(patient)).toEqual([true]);
    });

    test('testMod2', () => {
      expect(parseFhirPath("4 mod 2 = 0").eval(patient)).toEqual([true]);
    });

    test('testMod3', () => {
      expect(parseFhirPath("5 mod 2 = 1").eval(patient)).toEqual([true]);
    });

    test('testMod4', () => {
      expect(parseFhirPath("2.2 mod 1.8 = 0.4").eval(patient)).toEqual([true]);
    });

    test('testMod5', () => {
      expect(() => parseFhirPath("5 mod 0").eval(patient)).not.toThrow();
    });

  });

  describe('testRound', () => {

    test('testRound1', () => {
      expect(parseFhirPath("1.round() = 1").eval(patient)).toEqual([true]);
    });

    test.skip('testRound2', () => {
      expect(parseFhirPath("3.14159.round(3) = 2").eval(patient)).toEqual([true]);
    });

  });

  describe('testSqrt', () => {

    test('testSqrt1', () => {
      expect(parseFhirPath("81.sqrt() = 9.0").eval(patient)).toEqual([true]);
    });

    test('testSqrt2', () => {
      expect(() => parseFhirPath("(-1).sqrt()").eval(patient)).not.toThrow();
    });

  });

  describe('testAbs', () => {

    test('testAbs1', () => {
      expect(parseFhirPath("(-5).abs() = 5").eval(patient)).toEqual([true]);
    });

    test('testAbs2', () => {
      expect(parseFhirPath("(-5.5).abs() = 5.5").eval(patient)).toEqual([true]);
    });

    test('testAbs3', () => {
      expect(parseFhirPath("(-5.5 'mg').abs() = 5.5 'mg'").eval(patient)).toEqual([true]);
    });

  });

  describe('testCeiling', () => {

    test('testCeiling1', () => {
      expect(parseFhirPath("1.ceiling() = 1").eval(patient)).toEqual([true]);
    });

    test('testCeiling2', () => {
      expect(parseFhirPath("(-1.1).ceiling() = -1").eval(patient)).toEqual([true]);
    });

    test('testCeiling3', () => {
      expect(parseFhirPath("1.1.ceiling() = 2").eval(patient)).toEqual([true]);
    });

  });

  describe('testExp', () => {

    test('testExp1', () => {
      expect(parseFhirPath("0.exp() = 1").eval(patient)).toEqual([true]);
    });

    test('testExp2', () => {
      expect(parseFhirPath("(-0.0).exp() = 1").eval(patient)).toEqual([true]);
    });

  });

  describe('testFloor', () => {

    test('testFloor1', () => {
      expect(parseFhirPath("1.floor() = 1").eval(patient)).toEqual([true]);
    });

    test('testFloor2', () => {
      expect(parseFhirPath("2.1.floor() = 2").eval(patient)).toEqual([true]);
    });

    test('testFloor3', () => {
      expect(parseFhirPath("(-2.1).floor() = -3").eval(patient)).toEqual([true]);
    });

  });

  describe('testLn', () => {

    test('testLn1', () => {
      expect(parseFhirPath("1.ln() = 0.0").eval(patient)).toEqual([true]);
    });

    test('testLn2', () => {
      expect(parseFhirPath("1.0.ln() = 0.0").eval(patient)).toEqual([true]);
    });

  });

  describe('testLog', () => {

    test('testLog1', () => {
      expect(parseFhirPath("16.log(2) = 4.0").eval(patient)).toEqual([true]);
    });

    test('testLog2', () => {
      expect(parseFhirPath("100.0.log(10.0) = 2.0").eval(patient)).toEqual([true]);
    });

  });

  describe('testPower', () => {

    test('testPower1', () => {
      expect(parseFhirPath("2.power(3) = 8").eval(patient)).toEqual([true]);
    });

    test('testPower2', () => {
      expect(parseFhirPath("2.5.power(2) = 6.25").eval(patient)).toEqual([true]);
    });

    test('testPower3', () => {
      expect(() => parseFhirPath("(-1).power(0.5)").eval(patient)).not.toThrow();
    });

  });

  describe('testTruncate', () => {

    test('testTruncate1', () => {
      expect(parseFhirPath("101.truncate() = 101").eval(patient)).toEqual([true]);
    });

    test('testTruncate2', () => {
      expect(parseFhirPath("1.00000001.truncate() = 1").eval(patient)).toEqual([true]);
    });

    test('testTruncate3', () => {
      expect(parseFhirPath("(-1.56).truncate() = -1").eval(patient)).toEqual([true]);
    });

  });

  describe('testPrecedence', () => {

    test.skip('test unary precedence', () => {
      expect(() => parseFhirPath("-1.convertsToInteger()").eval(patient)).toThrow();
    });

    test('testPrecedence2', () => {
      expect(parseFhirPath("1+2*3+4 = 11").eval(patient)).toEqual([true]);
    });

    test('testPrecedence3', () => {
      expect(parseFhirPath("1 > 2 is Boolean").eval(patient)).toEqual([true]);
    });

    test.skip('testPrecedence4', () => {
      expect(parseFhirPath("1 | 1 is Integer").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testVariables', () => {

    test('testVariables1', () => {
      expect(parseFhirPath("%sct = 'http://snomed.info/sct'").eval(patient)).toEqual([true]);
    });

    test('testVariables2', () => {
      expect(parseFhirPath("%loinc = 'http://loinc.org'").eval(patient)).toEqual([true]);
    });

    test('testVariables3', () => {
      expect(parseFhirPath("%ucum = 'http://unitsofmeasure.org'").eval(patient)).toEqual([true]);
    });

    test('testVariables4', () => {
      expect(parseFhirPath("%`vs-administrative-gender` = 'http://hl7.org/fhir/ValueSet/administrative-gender'").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testExtension', () => {

    test('testExtension1', () => {
      expect(parseFhirPath("Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime').exists()").eval(patient)).toEqual([true]);
    });

    test('testExtension2', () => {
      expect(parseFhirPath("Patient.birthDate.extension(%`ext-patient-birthTime`).exists()").eval(patient)).toEqual([true]);
    });

    test('testExtension3', () => {
      expect(parseFhirPath("Patient.birthDate.extension('http://hl7.org/fhir/StructureDefinition/patient-birthTime1').empty()").eval(patient)).toEqual([true]);
    });

  });

  describe.skip('testType', () => {

    test('testType1', () => {
      expect(parseFhirPath("1.type().namespace = 'System'").eval(patient)).toEqual([true]);
    });

    test('testType2', () => {
      expect(parseFhirPath("1.type().name = 'Integer'").eval(patient)).toEqual([true]);
    });

    test('testType3', () => {
      expect(parseFhirPath("true.type().namespace = 'System'").eval(patient)).toEqual([true]);
    });

    test('testType4', () => {
      expect(parseFhirPath("true.type().name = 'Boolean'").eval(patient)).toEqual([true]);
    });

    test('testType5', () => {
      expect(parseFhirPath("true.is(Boolean)").eval(patient)).toEqual([true]);
    });

    test('testType6', () => {
      expect(parseFhirPath("true.is(System.Boolean)").eval(patient)).toEqual([true]);
    });

    test('testType7', () => {
      expect(parseFhirPath("true is Boolean").eval(patient)).toEqual([true]);
    });

    test('testType8', () => {
      expect(parseFhirPath("true is System.Boolean").eval(patient)).toEqual([true]);
    });

    test('testType9', () => {
      expect(parseFhirPath("Patient.active.type().namespace = 'FHIR'").eval(patient)).toEqual([true]);
    });

    test('testType10', () => {
      expect(parseFhirPath("Patient.active.type().name = 'boolean'").eval(patient)).toEqual([true]);
    });

    test('testType11', () => {
      expect(parseFhirPath("Patient.active.is(boolean)").eval(patient)).toEqual([true]);
    });

    test('testType12', () => {
      expect(parseFhirPath("Patient.active.is(Boolean).not()").eval(patient)).toEqual([true]);
    });

    test('testType13', () => {
      expect(parseFhirPath("Patient.active.is(FHIR.boolean)").eval(patient)).toEqual([true]);
    });

    test('testType14', () => {
      expect(parseFhirPath("Patient.active.is(System.Boolean).not()").eval(patient)).toEqual([true]);
    });

    test('testType15', () => {
      expect(parseFhirPath("Patient.type().namespace = 'FHIR'").eval(patient)).toEqual([true]);
    });

    test('testType16', () => {
      expect(parseFhirPath("Patient.type().name = 'Patient'").eval(patient)).toEqual([true]);
    });

    test('testType17', () => {
      expect(parseFhirPath("Patient.is(Patient)").eval(patient)).toEqual([true]);
    });

    test('testType18', () => {
      expect(parseFhirPath("Patient.is(FHIR.Patient)").eval(patient)).toEqual([true]);
    });

    test('testType19', () => {
      expect(parseFhirPath("Patient.is(FHIR.`Patient`)").eval(patient)).toEqual([true]);
    });

    test('testType20', () => {
      expect(parseFhirPath("Patient.ofType(Patient).type().name").eval(patient)).toEqual(["Patient"]);
    });

    test('testType21', () => {
      expect(parseFhirPath("Patient.ofType(FHIR.Patient).type().name").eval(patient)).toEqual(["Patient"]);
    });

    test('testType22', () => {
      expect(parseFhirPath("Patient.is(System.Patient).not()").eval(patient)).toEqual([true]);
    });

    test('testType23', () => {
      expect(parseFhirPath("Patient.ofType(FHIR.`Patient`).type().name").eval(patient)).toEqual(["Patient"]);
    });

  });

  describe('testConformsTo', () => {

    test('testConformsTo', () => {
      expect(parseFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Patient')").eval(patient)).toEqual([true]);
    });

    test('testConformsTo', () => {
      expect(parseFhirPath("conformsTo('http://hl7.org/fhir/StructureDefinition/Person')").eval(patient)).toEqual([false]);
    });

    test('testConformsTo', () => {
      expect(() => parseFhirPath("conformsTo('http://trash')").eval(patient)).toThrow();
    });

  });

});
