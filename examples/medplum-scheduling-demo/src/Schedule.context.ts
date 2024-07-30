import { Schedule } from '@medplum/fhirtypes';
import { createContext } from 'react';

export const ScheduleContext = createContext<{ schedule?: Schedule }>({});
