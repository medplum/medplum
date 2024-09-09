import { ExtendedInternalSchemaElement, ElementsContextType, isPopulated } from '@medplum/core';
import { createContext } from 'react';
import { DEFAULT_IGNORED_NON_NESTED_PROPERTIES, DEFAULT_IGNORED_PROPERTIES } from '../constants';

export const ElementsContext = createContext<ElementsContextType>({
  path: '',
  profileUrl: undefined,
  elements: Object.create(null),
  elementsByPath: Object.create(null),
  getExtendedProps: () => {
    return { readonly: false, hidden: false };
  },
  accessPolicyResource: undefined,
  debugMode: false,
  isDefaultContext: true,
});
ElementsContext.displayName = 'ElementsContext';

export const EXTENSION_KEYS = ['extension', 'modifierExtension'];
export const IGNORED_PROPERTIES = ['id', ...DEFAULT_IGNORED_PROPERTIES].filter(
  (prop) => !EXTENSION_KEYS.includes(prop)
);

export function getElementsToRender(
  inputElements: Record<string, ExtendedInternalSchemaElement>
): [string, ExtendedInternalSchemaElement][] {
  const result = Object.entries(inputElements).filter(([key, element]) => {
    if (!isPopulated(element.type)) {
      return false;
    }

    if (element.max === 0) {
      return false;
    }

    // toLowerCase to handle Extension.url as well as Extension.extension.url, etc.
    if (element.path.toLowerCase().endsWith('extension.url') && element.fixed) {
      return false;
    }

    if (EXTENSION_KEYS.includes(key) && !isPopulated(element.slicing?.slices)) {
      // an extension property without slices has no nested extensions
      return false;
    } else if (IGNORED_PROPERTIES.includes(key)) {
      return false;
    } else if (DEFAULT_IGNORED_NON_NESTED_PROPERTIES.includes(key) && element.path.split('.').length === 2) {
      return false;
    }

    // Profiles can include nested elements in addition to their containing element, e.g.:
    // identifier, identifier.use, identifier.system
    // Skip nested elements, e.g. identifier.use, since they are handled by the containing element
    if (key.includes('.')) {
      return false;
    }

    return true;
  });

  return result;
}
