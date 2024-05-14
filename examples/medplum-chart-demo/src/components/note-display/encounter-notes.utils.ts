import { Annotation, CodeableConcept, Coding, Quantity, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

interface Answers {
  reasonForVisit: CodeableConcept;
  date: string;
  diastolic: Quantity;
  systolic: Quantity;
  height?: Quantity;
  weight?: Quantity;
  assessment?: Annotation[];
}

interface GeneralAnswers extends Answers {
  noteType: 'general';
}

interface ObstetricAnswers extends Answers {
  totalWeightGain?: Quantity;
  gravida?: number;
  para?: number;
  gestationalWeeks?: number;
  gestationalDays?: number;
  noteType: 'obstetric';
}

interface GynecologyAnswers extends Answers {
  lastPeriod?: string;
  contraception?: Coding;
  lastMammogram?: string;
  smokingStatus?: Coding;
  drugUse?: Coding;
  housingStatus?: Coding;
  visitLength?: number;
  noteType: 'gynecology';
}

export function parseAnswers(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  noteType: string
): GeneralAnswers | GynecologyAnswers | ObstetricAnswers {
  switch (noteType) {
    case 'obstetric':
      return parseObstetricAnswers(answers, noteType);
    case 'gynecology':
      return parseGynecologyAnswers(answers, noteType);
    default:
      return parseGeneralAnswers(answers, noteType);
  }
}

function parseGynecologyAnswers(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  noteType: string
): GynecologyAnswers {
  const genericAnswers = parseGenericAnswers(answers, noteType);

  const lastPeriod = answers['last-period'].valueDate;
  const contraception = answers['contraception'].valueCoding;
  const lastMammogram = answers['mammogram'].valueDate;

  const smokingStatus = answers['smoking'].valueCoding;
  const drugUse = answers['drugs'].valueCoding;
  const housingStatus = answers['housing'].valueCoding;

  const visitLength = answers['visit-length'].valueInteger;
  const assessment: Annotation[] = [];
  if (answers['assessment'].valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    ...genericAnswers,
    lastPeriod,
    contraception,
    lastMammogram,
    smokingStatus,
    drugUse,
    housingStatus,
    visitLength,
    assessment,
    noteType: 'gynecology',
  };
}

function parseObstetricAnswers(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  noteType: string
): ObstetricAnswers {
  const genericAnswers = parseGenericAnswers(answers, noteType);

  const totalWeightGain = answers['total-weight-gain'].valueQuantity;

  const gravida = answers['gravida'].valueInteger;
  const para = answers['para'].valueInteger;
  const gestationalWeeks = answers['gestational-age-weeks'].valueInteger;
  const gestationalDays = answers['gestational-age-days'].valueInteger;

  const assessment: Annotation[] = [];

  if (answers['assessment'].valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    ...genericAnswers,
    totalWeightGain,
    gravida,
    para,
    gestationalWeeks,
    gestationalDays,
    assessment,
    noteType: 'obstetric',
  };
}

function parseGeneralAnswers(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  noteType: string
): GeneralAnswers {
  // Parse out the note into a more easily usable data structure
  const genericAnswers = parseGenericAnswers(answers, noteType);

  const assessment: Annotation[] = [];

  if (answers['assessment'].valueString) {
    assessment.push({ text: answers['assessment'].valueString });
  }

  return {
    ...genericAnswers,
    assessment,
    noteType: 'general',
  };
}

function parseGenericAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>, noteType: string): Answers {
  if (noteType !== 'general' && noteType !== 'obstetric' && noteType !== 'gynecology') {
    throw new Error('Invalid note type');
  }

  const reasonForVisit: CodeableConcept = {
    coding: [answers['reason-for-visit'].valueCoding as Coding],
  };

  const date = answers['date'].valueDate as string;

  const diastolic = {
    value: answers['diastolic'].valueInteger,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.com',
    code: 'mm[Hg]',
  };

  const systolic = {
    value: answers['systolic'].valueInteger,
    unit: 'mmHg',
    system: 'http://unitsofmeasure.com',
    code: 'mm[Hg]',
  };

  const height = answers['height'].valueQuantity;

  const weight = answers['weight'].valueQuantity;

  return {
    reasonForVisit,
    date,
    diastolic,
    systolic,
    height,
    weight,
  };
}
