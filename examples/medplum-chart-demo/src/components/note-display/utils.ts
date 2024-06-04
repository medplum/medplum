import { CodeableConcept, Coding, Quantity, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

export interface Answers {
  reasonForVisit: CodeableConcept;
  date: string;
  diastolic: Quantity;
  systolic: Quantity;
  height?: Quantity;
  weight?: Quantity;
}

export function parseGenericAnswers(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  noteType: string
): Answers {
  if (noteType !== '1287706006' && noteType !== '83607001' && noteType !== '163497009') {
    throw new Error('Invalid note type');
  }

  const reasonForVisit: CodeableConcept = {
    coding: [answers['reason-for-visit']?.valueCoding as Coding],
  };

  const date = answers['date']?.valueDate as string;

  const diastolic = {
    value: answers['diastolic']?.valueInteger,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.com',
    code: 'mm[Hg]',
  };

  const systolic = {
    value: answers['systolic']?.valueInteger,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.com',
    code: 'mm[Hg]',
  };

  const height = answers['height']?.valueQuantity;

  const weight = answers['weight']?.valueQuantity;

  return {
    reasonForVisit,
    date,
    diastolic,
    systolic,
    height,
    weight,
  };
}
