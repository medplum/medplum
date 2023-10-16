import { Flex, Text, Box } from '@mantine/core';
import { Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'phq-9-example',
  meta: {
    profile: ['http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire'],
  },
  url: 'http://hl7.org/fhir/us/core/Questionnaire/phq-9-example',
  version: '7.0.0-ballot',
  name: 'PHQ9Example',
  title: 'PHQ-9 Example',
  status: 'active',
  experimental: true,
  subjectType: ['Patient'],
  date: '2023-03-31',
  publisher: 'HL7 International / Cross-Group Projects',
  contact: [
    {
      name: 'HL7 International / Cross-Group Projects',
      telecom: [
        {
          system: 'url',
          value: 'http://www.hl7.org/Special/committees/cgp',
        },
        {
          system: 'email',
          value: 'cgp@lists.HL7.org',
        },
      ],
    },
  ],
  jurisdiction: [
    {
      coding: [
        {
          system: 'urn:iso:std:iso:3166',
          code: 'US',
        },
      ],
    },
  ],
  copyright: 'Used by permission of HL7 International, all rights reserved Creative Commons License',
  code: [
    {
      system: 'http://loinc.org',
      code: '44249-1',
      display: 'PHQ-9 quick depression assessment panel [Reported.PHQ]',
    },
  ],
  item: [
    {
      linkId: '/44250-9',
      code: [
        {
          system: 'http://loinc.org',
          code: '44250-9',
          display: 'Little interest or pleasure in doing things in last 2 weeks',
        },
      ],
      text: 'Little interest or pleasure in doing things?',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44255-8',
      code: [
        {
          system: 'http://loinc.org',
          code: '44255-8',
          display: 'Feeling down, depressed, or hopeless in last 2 weeks',
        },
      ],
      text: 'Feeling down, depressed, or hopeless?',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44259-0',
      code: [
        {
          system: 'http://loinc.org',
          code: '44259-0',
          display: 'Trouble falling or staying asleep, or sleeping too much',
        },
      ],
      text: 'Trouble falling or staying asleep, or sleeping too much',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44254-1',
      code: [
        {
          system: 'http://loinc.org',
          code: '44254-1',
          display: 'Feeling tired or having little energy',
        },
      ],
      text: 'Feeling tired or having little energy',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44251-7',
      code: [
        {
          system: 'http://loinc.org',
          code: '44251-7',
          display: 'Poor appetite or overeating',
        },
      ],
      text: 'Poor appetite or overeating',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44258-2',
      code: [
        {
          system: 'http://loinc.org',
          code: '44258-2',
          display: 'Feeling bad about yourself-or that you are a failure or have let yourself or your family down',
        },
      ],
      text: 'Feeling bad about yourself-or that you are a failure or have let yourself or your family down',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44252-5',
      code: [
        {
          system: 'http://loinc.org',
          code: '44252-5',
          display: 'Trouble concentrating on things, such as reading the newspaper or watching television',
        },
      ],
      text: 'Trouble concentrating on things, such as reading the newspaper or watching television',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44253-3',
      code: [
        {
          system: 'http://loinc.org',
          code: '44253-3',
          display:
            'Moving or speaking so slowly that other people could have noticed. Or the opposite-being so fidgety or restless that you have been moving around a lot more than usual',
        },
      ],
      text: 'Moving or speaking so slowly that other people could have noticed. Or the opposite-being so fidgety or restless that you have been moving around a lot more than usual',
      type: 'choice',
      required: true,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44260-8',
      code: [
        {
          system: 'http://loinc.org',
          code: '44260-8',
          display: 'Thoughts that you would be better off dead, or of hurting yourself in some way',
        },
      ],
      text: 'Thoughts that you would be better off dead, or of hurting yourself in some way',
      type: 'choice',
      required: false,
      answerOption: [
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '0',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 0,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6568-5',
            display: 'Not at all',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '1',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 1,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6569-3',
            display: 'Several days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '2',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 2,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6570-1',
            display: 'More than half the days',
          },
        },
        {
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
              valueString: '3',
            },
            {
              url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
              valueDecimal: 3,
            },
          ],
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6571-9',
            display: 'Nearly every day',
          },
        },
      ],
    },
    {
      linkId: '/44261-6',
      code: [
        {
          system: 'http://loinc.org',
          code: '44261-6',
          display: 'Patient Health Questionnaire 9 item (PHQ-9) total score [Reported]',
        },
      ],
      text: 'Patient health questionnaire 9 item total score',
      type: 'decimal',
      required: false,
    },
    {
      linkId: '/69722-7',
      code: [
        {
          system: 'http://loinc.org',
          code: '69722-7',
          display:
            'How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?',
        },
      ],
      text: 'How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?',
      type: 'choice',
      required: false,
      answerOption: [
        {
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6572-7',
            display: 'Not difficult at all',
          },
        },
        {
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6573-5',
            display: 'Somewhat difficult',
          },
        },
        {
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6575-0',
            display: 'Very difficult',
          },
        },
        {
          valueCoding: {
            system: 'http://loinc.org',
            code: 'LA6574-3',
            display: 'Extremely difficult',
          },
        },
      ],
    },
  ],
};

export function SoapNote(): JSX.Element {
  const { id } = useParams();
  const medplum = useMedplum();

  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    const response = await medplum.createResource(questionnaireResponse);

    const newTask: Task = {
      resourceType: 'Task',
      status: 'ready',
      intent: 'order',
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '44249-1',
            display: 'PHQ-9 quick depression assessment panel [Reported.PHQ]',
          },
        ],
      },
      focus: {
        reference: `QuestionnaireResponse/${response.id}`,
      },
      for: {
        reference: `Patient/${id}`,
      },
    };
    await medplum.createResource(newTask);
    setSubmitted(true);
  }

  return (
    <Box w="37.5%">
      <Document>
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={!submitted ? handleSubmit : console.log} />

        {submitted ? (
          <Flex justify={'flex-end'} mt={8}>
            <Text mr={8}>Submitted</Text>
            <IconCircleCheck color="#79d290" size={24} />
          </Flex>
        ) : null}
      </Document>
    </Box>
  );
}
