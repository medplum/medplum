import { ElementsContextType } from '@medplum/core';
import React from 'react';

export const ElementsContext = React.createContext<ElementsContextType>({
  path: '',
  profileUrl: undefined,
  elements: Object.create(null),
  elementsByPath: Object.create(null),
  debugMode: false,
});
ElementsContext.displayName = 'ElementsContext';
