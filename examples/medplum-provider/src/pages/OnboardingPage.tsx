import { Questionnaire } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm } from '@medplum/react';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function OnboardingPage(): JSX.Element | null {
  return (
    <Document>
      <QuestionnaireForm
        questionnaire={questionnaire}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
      />
    </Document>
  );
}

export const questionnaire: Questionnaire = {
  id: '54127-6-x',
  meta: {
    versionId: '1',
    lastUpdated: '2022-07-03T03:13:02.000-04:00',
    source: '#qWxii09ZAuzB2C9W',
    profile: ['http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire|2.7'],
    tag: [
      {
        code: 'lformsVersion: 30.3.0',
      },
    ],
  },
  extension: [
    {
      url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext',
      extension: [
        {
          url: 'name',
          valueId: 'patient',
        },
        {
          url: 'type',
          valueCode: 'Patient',
        },
        {
          url: 'descripton',
          valueString: 'For filling in patient information as the subject for the form',
        },
      ],
    },
  ],
  date: '2018-11-05T16:54:56-05:00',
  identifier: [
    {
      system: 'http://loinc.org',
      value: '54127-6',
    },
  ],
  code: [
    {
      system: 'http://loinc.org',
      code: '54127-6',
      display: 'US Surgeon General family health portrait',
    },
  ],
  subjectType: ['Patient', 'Person'],
  status: 'draft',
  name: 'US Surgeon General family health portrait',
  title: 'US Surgeon General family health portrait',
  resourceType: 'Questionnaire',
  item: [
    {
      type: 'group',
      code: [
        {
          system: 'http://loinc.org',
          code: '54126-8',
          display: 'Health history',
        },
      ],
      required: false,
      linkId: '/54126-8',
      text: 'Health history',
      item: [
        {
          type: 'string',
          code: [
            {
              system: 'http://loinc.org',
              code: '54125-0',
              display: 'Name',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
              valueExpression: {
                description: 'Name from patient resource',
                language: 'text/fhirpath',
                expression: "%patient.name[0].select(given.first() + ' ' +  family)",
              },
            },
          ],
          required: false,
          linkId: '/54126-8/54125-0',
          text: 'Name',
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54131-8',
              display: 'Gender',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/54131-8',
          text: 'Gender',
          answerOption: [
            {
              valueCoding: {
                code: 'LA2-8',
                display: 'Male',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA3-6',
                display: 'Female',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA46-8',
                display: 'Other',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'date',
          code: [
            {
              system: 'http://loinc.org',
              code: '21112-8',
              display: 'Birth Date',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
              valueExpression: {
                description: 'Birth date from patient resource',
                language: 'text/fhirpath',
                expression: '%patient.birthDate',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/21112-8',
          text: 'Birth Date',
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54132-6',
              display: 'Twin',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/54132-6',
          text: 'Twin',
          answerOption: [
            {
              valueCoding: {
                code: 'LA10427-5',
                display: 'Yes - Identical (Same)',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10428-3',
                display: 'Yes - Fraternal (Different)',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54128-4',
              display: 'Adopted',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/54128-4',
          text: 'Adopted',
          answerOption: [
            {
              valueCoding: {
                code: 'LA33-6',
                display: 'Yes',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54135-9',
              display: 'Parents related',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/54135-9',
          text: 'Parents related',
          answerOption: [
            {
              valueCoding: {
                code: 'LA33-6',
                display: 'Yes',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'decimal',
          code: [
            {
              system: 'http://loinc.org',
              code: '8302-2',
              display: 'Body height',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationLinkPeriod',
              valueDuration: {
                value: 100,
                unit: 'year',
                system: 'http://unitsofmeasure.org',
                code: 'a',
              },
            },
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationExtract',
              valueBoolean: true,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: {
                code: '[in_i]',
                system: 'http://unitsofmeasure.org',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/8302-2',
          text: 'Body height',
        },
        {
          type: 'decimal',
          code: [
            {
              system: 'http://loinc.org',
              code: '29463-7',
              display: 'Weight',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationLinkPeriod',
              valueDuration: {
                value: 100,
                unit: 'year',
                system: 'http://unitsofmeasure.org',
                code: 'a',
              },
            },
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationExtract',
              valueBoolean: true,
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
              valueCoding: {
                code: 'kg',
                system: 'http://unitsofmeasure.org',
              },
            },
          ],
          required: false,
          linkId: '/54126-8/29463-7',
          text: 'Weight',
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54134-2',
              display: 'Race',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54126-8/54134-2',
          text: 'Race',
          answerOption: [
            {
              valueCoding: {
                code: 'LA10608-0',
                display: 'American Indian or Alaska Native',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA6156-9',
                display: 'Asian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10614-8',
                display: '-- Asian Indian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10615-5',
                display: '-- Chinese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10616-3',
                display: '-- Filipino',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10617-1',
                display: '-- Japanese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10618-9',
                display: '-- Korean',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10620-5',
                display: '-- Vietnamese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10619-7',
                display: '-- Other Asian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10610-6',
                display: 'Black or African American',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10611-4',
                display: 'Native Hawaiian or Other Pacific Islander',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10623-9',
                display: '-- Native Hawaiian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10622-1',
                display: '-- Guamanian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10621-3',
                display: '-- Chamorro',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10625-4',
                display: '-- Samoan',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10624-7',
                display: '-- Other Pacific Islander',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA4457-3',
                display: 'White',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10613-0',
                display: 'Other/Unknown/Refuse To Answer',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54133-4',
              display: 'Ethnicity',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'autocomplete',
                    display: 'Auto-complete',
                  },
                ],
                text: 'Auto-complete',
              },
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54126-8/54133-4',
          text: 'Ethnicity',
          answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-Ethnicity',
        },
        {
          type: 'group',
          code: [
            {
              system: 'http://loinc.org',
              code: '54137-5',
              display: 'Diseases history panel',
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54126-8/54137-5',
          text: 'Diseases history panel',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54140-9',
                  display: 'History of diseases',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'autocomplete',
                        display: 'Auto-complete',
                      },
                    ],
                    text: 'Auto-complete',
                  },
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/terminology-server',
                  valueUrl: 'https://clinicaltables.nlm.nih.gov/fhir/R4',
                },
              ],
              required: false,
              linkId: '/54126-8/54137-5/54140-9',
              text: 'History of diseases',
              answerValueSet: 'http://clinicaltables.nlm.nih.gov/fhir/R4/ValueSet/conditions',
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54130-0',
                  display: 'Age range at onset of disease',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/54126-8/54137-5/54130-0',
              text: 'Age range at onset of disease',
              answerOption: [
                {
                  valueCoding: {
                    code: 'LA10402-8',
                    display: 'Pre-Birth',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10403-6',
                    display: 'Newborn',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10394-7',
                    display: 'Infancy',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10395-4',
                    display: 'Childhood',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10404-4',
                    display: 'Adolescence',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10396-2',
                    display: '20-29',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10397-0',
                    display: '30-39',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10398-8',
                    display: '40-49',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10399-6',
                    display: '50-59',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10400-2',
                    display: 'OVER 60',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA4489-6',
                    display: 'Unknown',
                    system: 'http://loinc.org',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      code: [
        {
          system: 'http://loinc.org',
          code: '54114-4',
          display: 'Family member health history',
        },
      ],
      required: false,
      repeats: true,
      linkId: '/54114-4',
      text: 'Family member health history',
      item: [
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54136-7',
              display: 'Relationship to patient',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-displayCategory',
              valueCodeableConcept: {
                coding: [
                  {
                    display: 'The relationship of a family member to the patient.',
                  },
                ],
                text: 'The relationship of a family member to the patient.',
              },
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54136-7',
          text: 'Relationship to patient',
          answerOption: [
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'DAU',
                },
              ],
              valueCoding: {
                code: 'LA10405-1',
                display: 'Daughter',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'GRNDDAU',
                },
              ],
              valueCoding: {
                code: 'LA10406-9',
                display: 'Granddaughter',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'GRNDSON',
                },
              ],
              valueCoding: {
                code: 'LA10407-7',
                display: 'Grandson',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'HBRO',
                },
              ],
              valueCoding: {
                code: 'LA10408-5',
                display: 'Half-brother',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'HSIS',
                },
              ],
              valueCoding: {
                code: 'LA10409-3',
                display: 'Half-sister',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'MAUNT',
                },
              ],
              valueCoding: {
                code: 'LA10410-1',
                display: 'Maternal Aunt',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'MCOUSN',
                },
              ],
              valueCoding: {
                code: 'LA10411-9',
                display: 'Maternal Cousin',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'MGRFTH',
                },
              ],
              valueCoding: {
                code: 'LA10412-7',
                display: 'Maternal Grandfather',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'MGRMTH',
                },
              ],
              valueCoding: {
                code: 'LA10413-5',
                display: 'Maternal Grandmother',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'MUNCLE',
                },
              ],
              valueCoding: {
                code: 'LA10414-3',
                display: 'Maternal Uncle',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NBRO',
                },
              ],
              valueCoding: {
                code: 'LA10415-0',
                display: 'Brother',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NFTH',
                },
              ],
              valueCoding: {
                code: 'LA10416-8',
                display: 'Father',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NMTH',
                },
              ],
              valueCoding: {
                code: 'LA10417-6',
                display: 'Mother',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NSIS',
                },
              ],
              valueCoding: {
                code: 'LA10418-4',
                display: 'Sister',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NEPHEW',
                },
              ],
              valueCoding: {
                code: 'LA10419-2',
                display: 'Nephew',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'NIECE',
                },
              ],
              valueCoding: {
                code: 'LA10420-0',
                display: 'Niece',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'PAUNT',
                },
              ],
              valueCoding: {
                code: 'LA10421-8',
                display: 'Paternal Aunt',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'PCOUSN',
                },
              ],
              valueCoding: {
                code: 'LA10422-6',
                display: 'Paternal Cousin',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'PGRFTH',
                },
              ],
              valueCoding: {
                code: 'LA10423-4',
                display: 'Paternal Grandfather',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'PGRMTH',
                },
              ],
              valueCoding: {
                code: 'LA10424-2',
                display: 'Paternal Grandmother',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'PUNCLE',
                },
              ],
              valueCoding: {
                code: 'LA10425-9',
                display: 'Paternal Uncle',
                system: 'http://loinc.org',
              },
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                  valueString: 'SON',
                },
              ],
              valueCoding: {
                code: 'LA10426-7',
                display: 'Son',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'string',
          code: [
            {
              system: 'http://loinc.org',
              code: '54138-3',
              display: 'Name',
            },
          ],
          required: false,
          linkId: '/54114-4/54138-3',
          text: 'Name',
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54123-5',
              display: 'Gender',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
              valueExpression: {
                description: 'Gender from patient resource',
                language: 'text/fhirpath',
                expression: '%patient.gender',
              },
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54123-5',
          text: 'Gender',
          answerOption: [
            {
              valueCoding: {
                code: 'LA2-8',
                display: 'Male',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA3-6',
                display: 'Female',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA46-8',
                display: 'Other',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54139-1',
              display: 'Living?',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54139-1',
          text: 'Living?',
          answerOption: [
            {
              valueCoding: {
                code: 'LA33-6',
                display: 'Yes',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA4489-6',
                display: 'Unknown',
                system: 'http://loinc.org',
              },
            },
          ],
          item: [
            {
              type: 'date',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54124-3',
                  display: 'Date of Birth',
                },
              ],
              required: false,
              linkId: '/54114-4/54139-1/54124-3',
              text: 'Date of Birth',
              enableWhen: [
                {
                  answerCoding: {
                    code: 'LA33-6',
                    system: 'http://loinc.org',
                  },
                  question: '/54114-4/54139-1',
                  operator: '=',
                },
              ],
            },
            {
              type: 'decimal',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54141-7',
                  display: 'Current Age',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
                  valueCoding: {
                    code: 'a',
                    display: 'year',
                    system: 'http://unitsofmeasure.org',
                  },
                },
              ],
              required: false,
              linkId: '/54114-4/54139-1/54141-7',
              text: 'Current Age',
              enableWhen: [
                {
                  answerCoding: {
                    code: 'LA33-6',
                    system: 'http://loinc.org',
                  },
                  question: '/54114-4/54139-1',
                  operator: '=',
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54112-8',
                  display: 'Cause of Death',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/54114-4/54139-1/54112-8',
              text: 'Cause of Death',
              enableWhen: [
                {
                  answerCoding: {
                    code: 'LA32-8',
                    system: 'http://loinc.org',
                  },
                  question: '/54114-4/54139-1',
                  operator: '=',
                },
              ],
              answerOption: [
                {
                  valueCoding: {
                    code: 'LA10533-0',
                    display: 'Blood Clots',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10572-8',
                    display: '-- Blood Clot in Leg',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10573-6',
                    display: '-- Blood Clot in Lungs',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10524-9',
                    display: 'Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10549-6',
                    display: '-- Bone Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10536-3',
                    display: '-- Breast Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10537-1',
                    display: '-- Colon Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10548-8',
                    display: '-- Esophageal Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10547-0',
                    display: '-- Gastric Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10541-3',
                    display: '-- Kidney Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10545-4',
                    display: '-- Leukemia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10542-1',
                    display: '-- Lung Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10546-2',
                    display: '-- Muscle Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10539-7',
                    display: '-- Ovarian Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10538-9',
                    display: '-- Prostate Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10543-9',
                    display: '-- Skin Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10540-5',
                    display: '-- Thyroid Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10544-7',
                    display: '-- Uterine Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10550-4',
                    display: '-- Other Cancer',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10529-8',
                    display: 'Diabetes',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10551-2',
                    display: '-- Diabetes Type 1',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10552-0',
                    display: '-- Diabetes Type 2',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10553-8',
                    display: '-- Gestational Diabetes',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10532-2',
                    display: 'Gastrointestinal Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10554-6',
                    display: "-- Crohn's Disease",
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10555-3',
                    display: '-- Irritable Bowel Syndrome',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10556-1',
                    display: '-- Ulceritive Colitis',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10557-9',
                    display: '-- Colon Polyps',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10523-1',
                    display: 'Heart Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10558-7',
                    display: '-- Heart Attack',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10526-4',
                    display: 'High Cholesterol/Hyperlipidemia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA7444-8',
                    display: 'Hypertension',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10528-0',
                    display: 'Kidney Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10565-2',
                    display: '-- Cystic Kidney Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10566-0',
                    display: '-- Kidney Disease Present From Birth',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10567-8',
                    display: '-- Nephrosis',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10568-6',
                    display: '-- Nephritis',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10569-4',
                    display: '-- Nephrotic Syndrome',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10570-2',
                    display: '-- Diabetic Kidney Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10571-0',
                    display: '-- Other/Unknown',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10531-4',
                    display: 'Lung Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10559-5',
                    display: '-- COPD',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10560-3',
                    display: '-- Chronic Bronchitis',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10561-1',
                    display: '-- Emphysema',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10562-9',
                    display: '-- Chronic Lower Respiratory Disease',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10563-7',
                    display: '-- Influenza/Pneumonia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10564-5',
                    display: '-- Asthma',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10590-0',
                    display: 'Neurological Disorders',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10527-2',
                    display: 'Osteoporosis',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10535-5',
                    display: 'Psychological Disorders',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10574-4',
                    display: '-- Anxiety',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10575-1',
                    display: '-- Bipolar/Manic Depressive Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10576-9',
                    display: '-- Depression',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10577-7',
                    display: '-- Attention Deficit Hyper Activity',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10578-5',
                    display: '-- Autism',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10579-3',
                    display: '-- Personality Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10580-1',
                    display: '-- Eating Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10581-9',
                    display: '-- Obsessive Compulsive Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10582-7',
                    display: '-- Panic Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10583-5',
                    display: '-- Post Traumatic Stress Disorder',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10584-3',
                    display: '-- Schizophrenia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10585-0',
                    display: '-- Social Phobia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10586-8',
                    display: '-- Dementia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10591-8',
                    display: 'Septicemia',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10522-3',
                    display: 'Stroke/Brain Attack',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10530-6',
                    display: 'Sudden Infant Death Syndrome',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10595-9',
                    display: 'Cause of Death',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10587-6',
                    display: '-- Suicide',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10588-4',
                    display: '-- Accidental Death',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10589-2',
                    display: '-- Other/Unexpected',
                    system: 'http://loinc.org',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54113-6',
                  display: 'Age at Death',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/54114-4/54139-1/54113-6',
              text: 'Age at Death',
              enableWhen: [
                {
                  answerCoding: {
                    code: 'LA32-8',
                    system: 'http://loinc.org',
                  },
                  question: '/54114-4/54139-1',
                  operator: '=',
                },
              ],
              answerOption: [
                {
                  valueCoding: {
                    code: 'LA10402-8',
                    display: 'Pre-Birth',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10403-6',
                    display: 'Newborn',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10394-7',
                    display: 'Infancy',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10395-4',
                    display: 'Childhood',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10404-4',
                    display: 'Adolescence',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10396-2',
                    display: '20-29',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10397-0',
                    display: '30-39',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10398-8',
                    display: '40-49',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10399-6',
                    display: '50-59',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10400-2',
                    display: 'OVER 60',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA4489-6',
                    display: 'Unknown',
                    system: 'http://loinc.org',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54121-9',
              display: 'Twin',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54121-9',
          text: 'Twin',
          answerOption: [
            {
              valueCoding: {
                code: 'LA10427-5',
                display: 'Yes - Identical (Same)',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10428-3',
                display: 'Yes - Fraternal (Different)',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54122-7',
              display: 'Adopted',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54122-7',
          text: 'Adopted',
          answerOption: [
            {
              valueCoding: {
                code: 'LA33-6',
                display: 'Yes',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54119-3',
              display: 'Race',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54114-4/54119-3',
          text: 'Race',
          answerOption: [
            {
              valueCoding: {
                code: 'LA10608-0',
                display: 'American Indian or Alaska Native',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA6156-9',
                display: 'Asian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10614-8',
                display: '-- Asian Indian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10615-5',
                display: '-- Chinese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10616-3',
                display: '-- Filipino',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10617-1',
                display: '-- Japanese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10618-9',
                display: '-- Korean',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10620-5',
                display: '-- Vietnamese',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10619-7',
                display: '-- Other Asian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10610-6',
                display: 'Black or African American',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10611-4',
                display: 'Native Hawaiian or Other Pacific Islander',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10623-9',
                display: '-- Native Hawaiian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10622-1',
                display: '-- Guamanian',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10621-3',
                display: '-- Chamorro',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10625-4',
                display: '-- Samoan',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10624-7',
                display: '-- Other Pacific Islander',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA4457-3',
                display: 'White',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10613-0',
                display: 'Other/Unknown/Refuse To Answer',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54120-1',
              display: 'Ethnicity',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54114-4/54120-1',
          text: 'Ethnicity',
          answerOption: [
            {
              valueCoding: {
                code: 'LA6214-6',
                display: 'Hispanic or Latino',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10599-1',
                display: '-- Central American',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10600-7',
                display: '-- Cuban',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10601-5',
                display: '-- Dominican(Republic)',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10602-3',
                display: '-- Mexican',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10605-6',
                display: '-- Puerto Rican',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10606-4',
                display: '-- South American',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10604-9',
                display: '-- Other Latin American',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10603-1',
                display: '-- Other Hispanic/Latino/Spanish',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10597-5',
                display: 'Non-Hispanic or Latino',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10598-3',
                display: 'Ashkenazi Jewish',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA10607-2',
                display: 'Unknown/No answer',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'choice',
          code: [
            {
              system: 'http://loinc.org',
              code: '54118-5',
              display: 'Parents related',
            },
          ],
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                coding: [
                  {
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                    code: 'drop-down',
                    display: 'Drop down',
                  },
                ],
                text: 'Drop down',
              },
            },
          ],
          required: false,
          linkId: '/54114-4/54118-5',
          text: 'Parents related',
          answerOption: [
            {
              valueCoding: {
                code: 'LA33-6',
                display: 'Yes',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'LA32-8',
                display: 'No',
                system: 'http://loinc.org',
              },
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'http://loinc.org',
              code: '54117-7',
              display: 'Diseases history panel',
            },
          ],
          required: false,
          repeats: true,
          linkId: '/54114-4/54117-7',
          text: 'Diseases history panel',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54116-9',
                  display: 'History of diseases',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'autocomplete',
                        display: 'Auto-complete',
                      },
                    ],
                    text: 'Auto-complete',
                  },
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-externallydefined',
                  valueUri: 'https://clinicaltables.nlm.nih.gov/api/conditions/v3/search',
                },
              ],
              required: false,
              linkId: '/54114-4/54117-7/54116-9',
              text: 'History of diseases',
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'http://loinc.org',
                  code: '54115-1',
                  display: 'Age range at onset of disease',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/54114-4/54117-7/54115-1',
              text: 'Age range at onset of disease',
              answerOption: [
                {
                  valueCoding: {
                    code: 'LA10402-8',
                    display: 'Pre-Birth',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10403-6',
                    display: 'Newborn',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10394-7',
                    display: 'Infancy',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10395-4',
                    display: 'Childhood',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10404-4',
                    display: 'Adolescence',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10396-2',
                    display: '20-29',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10397-0',
                    display: '30-39',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10398-8',
                    display: '40-49',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10399-6',
                    display: '50-59',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA10400-2',
                    display: 'OVER 60',
                    system: 'http://loinc.org',
                  },
                },
                {
                  valueCoding: {
                    code: 'LA4489-6',
                    display: 'Unknown',
                    system: 'http://loinc.org',
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
