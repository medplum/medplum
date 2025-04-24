import { Questionnaire } from '@medplum/fhirtypes';
import { createContext } from 'react';

export const IntakeQuestionnaireContext = createContext<{ questionnaire?: Questionnaire }>({});
