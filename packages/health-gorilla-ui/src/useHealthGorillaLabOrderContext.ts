import { useContext } from 'react';
import { UseHealthGorillaLabOrderReturn } from './useHealthGorillaLabOrder';
import { HealthGorillaLabOrderContext } from './HealthGorillaLabOrderProvider';

export function useHealthGorillaLabOrderContext(): UseHealthGorillaLabOrderReturn {
  const context = useContext(HealthGorillaLabOrderContext);
  if (context === undefined) {
    throw new Error('useHealthGorillaLabOrderContext must be used within a HealthGorillaLabOrderProvider');
  }
  return context;
}
