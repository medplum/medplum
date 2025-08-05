import { createContext } from 'react';
import { UseHealthGorillaLabOrderReturn } from './useHealthGorillaLabOrder';

export const HealthGorillaLabOrderContext = createContext<UseHealthGorillaLabOrderReturn | undefined>(undefined);
