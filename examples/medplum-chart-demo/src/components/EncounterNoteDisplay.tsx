import { formatDate, getQuestionnaireAnswers } from '@medplum/core';
import {
  CodeableConcept,
  Coding,
  Encounter,
  Quantity,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Document, QuantityDisplay } from '@medplum/react';

interface EncounterNoteDisplayProps {
  response: QuestionnaireResponse;
  encounter: Encounter;
}

interface EncounterNoteAnswer {
  'encounter-date': { valueString: string };
  'reason-for-visit': { valueCoding: Coding };
  'diastolic-blood-pressure'?: { valueInteger: number };
  'systolic-blood-pressure'?: { valueInteger: number };
  'vitals-height'?: { valueInteger: number };
  'vitals-weight'?: { valueInteger: number };
  'hot-flashes'?: { valueBoolean: boolean };
  'hot-flashes-details'?: { valueString: string };
  'mood-swings'?: { valueBoolean: boolean };
  'mood-swings-details'?: { valueString: string };
  'vaginal-dryness'?: { valueBoolean: boolean };
  'vaginal-dryness-details'?: { valueString: string };
  'sleep-disturbance'?: { valueBoolean: boolean };
  'sleep-disturbance-details'?: { valueString: string };
  'self-reported-history'?: { valueString: string };
  'blood-clots-details'?: { valueString: string };
  'stroke-details'?: { valueString: string };
  'breast-cancer-details'?: { valueString: string };
  'endometrial-cancer-details'?: { valueString: string };
  'irregular-bleeding-details'?: { valueString: string };
  'bmi>30-details'?: { valueString: string };
}

export function EncounterNoteDisplay(props: EncounterNoteDisplayProps): JSX.Element {
  function checkForValidResponse() {
    const response = props.response;
    const encounter = props.encounter;

    if (response.encounter?.reference !== `Encounter/${encounter.id}`) {
      throw new Error('Invalid note');
    }
  }
  checkForValidResponse();

  const answers = getQuestionnaireAnswers(props.response);

  const displayValues = parseAnswers(answers);

  function parseAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>) {
    const reasonForVisit: CodeableConcept = {
      coding: [answers['reason-for-visit'].valueCoding as Coding],
    };

    const date = answers['encounter-date'].valueString as string;

    const diastolic = {
      value: answers['diastolic-blood-pressure'].valueInteger,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.com',
      code: 'mm[Hg]',
    };

    const systolic = {
      value: answers['systolic-blood-pressure'].valueInteger,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.com',
      code: 'mm[Hg]',
    };

    const height = {
      value: answers['vitals-height'].valueInteger,
      unit: 'cm',
      system: 'http://unitsofmeasure.com',
      code: 'cm',
    };

    const weight = {
      value: answers['vitals-weight'].valueInteger,
      unit: 'lbs.',
      system: 'http://unitsofmeasure.com',
      code: '[lb_av]',
    };

    return {
      reasonForVisit,
      date,
      diastolic,
      systolic,
      height,
      weight,
      bmi: calculateBMI(answers['vitals-height'].valueInteger, answers['vitals-weight'].valueInteger),
    };
  }

  function calculateBMI(height?: number, weight?: number): Quantity | undefined {
    if (!weight || !height) {
      return undefined;
    }
    const weightKg = weight * 2.2;

    const bmi = (weightKg / height / height) * 10000;

    return {
      value: bmi,
      unit: 'kg/m^2',
    };
  }

  return (
    <Document>
      <div key="date">
        <h3>Date of Encounter</h3>
        <p>{formatDate(displayValues.date)}</p>
      </div>
      <div key="reason-for-visit">
        <h3>Reason for Visit</h3>
        <CodeableConceptDisplay value={displayValues.reasonForVisit} />
      </div>
      <div key="vitals">
        <h3>Vitals</h3>
        <div>
          <h4>Blood Pressure</h4>
          <div>
            <h5>Systolic BP</h5>
            <QuantityDisplay value={displayValues.systolic} />
          </div>
          <div>
            <h5>Diastolic BP</h5>
            <QuantityDisplay value={displayValues.diastolic} />
          </div>
        </div>
        <div>
          <h4>Height (cm)</h4>
          <QuantityDisplay value={displayValues.height} />
        </div>
        <div>
          <h4>Weight</h4>
          <QuantityDisplay value={displayValues.weight} />
        </div>
        <div>
          <h4>BMI</h4>
          <QuantityDisplay value={displayValues.bmi} />
        </div>
      </div>
    </Document>
  );
}
