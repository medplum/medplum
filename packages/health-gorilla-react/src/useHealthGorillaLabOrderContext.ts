import { useContext } from 'react';
import { HealthGorillaLabOrderContext } from './HealthGorillaLabOrderProvider';
import { UseHealthGorillaLabOrderReturn } from './useHealthGorillaLabOrder';

export function useHealthGorillaLabOrderContext(): UseHealthGorillaLabOrderReturn {
  const context = useContext(HealthGorillaLabOrderContext);
  if (context === undefined) {
    throw new Error('useHealthGorillaLabOrderContext must be used within a HealthGorillaLabOrderProvider');
  }
  return context;
}
