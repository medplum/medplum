import { createContext } from 'react';

export const FormContext = createContext<{ submitting: boolean }>({
  submitting: false,
});
FormContext.displayName = 'FormContext';
