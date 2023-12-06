import { Encounter, Reference } from '@medplum/fhirtypes';
import { createContext } from 'react';

export const QuestionnaireFormContext = createContext<{ subject?: Reference; encounter?: Reference<Encounter> }>({});
