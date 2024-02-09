import { InternalSchemaElement } from './typeschema/types';
import { getPathDifference } from './utils';

export type ElementsContextType = {
  path: string;
  profileUrl: string | undefined;
  elements: Record<string, InternalSchemaElement>;
  elementsByPath: Record<string, InternalSchemaElement>;
  debugMode: boolean;
};

export function buildElementsContext({
  parentContext,
  elements,
  path,
  profileUrl,
  debugMode,
}: {
  elements: Record<string, InternalSchemaElement>;
  path: string;
  parentContext: ElementsContextType | undefined;
  profileUrl?: string;
  debugMode?: boolean;
}): ElementsContextType | undefined {
  if (debugMode) {
    console.debug('Building ElementsContext', { path, profileUrl, elements });
  }

  if (path === parentContext?.path) {
    return undefined;
  }

  const mergedElements: ElementsContextType['elements'] = mergeElementsForContext(
    path,
    elements,
    parentContext,
    Boolean(debugMode)
  );
  const elementsByPath: Record<string, InternalSchemaElement> = Object.create(null);

  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[path + '.' + key] = property;
  }

  return {
    path: path,
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    elements: mergedElements,
    elementsByPath,
  };
}

function mergeElementsForContext(
  path: string,
  elements: Record<string, InternalSchemaElement>,
  parentContext: ElementsContextType | undefined,
  debugMode: boolean
): Record<string, InternalSchemaElement> {
  const result: Record<string, InternalSchemaElement> = Object.create(null);

  if (debugMode) {
    console.log('Merging elements for context', {
      path,
      elements,
      parentPath: parentContext?.path,
      parentElements: parentContext?.elementsByPath,
    });
  }
  if (parentContext) {
    for (const [elementPath, element] of Object.entries(parentContext.elementsByPath)) {
      const key = getPathDifference(path, elementPath);
      if (key !== undefined) {
        result[key] = element;
      }
    }
  }

  let usedNewElements = false;
  if (elements) {
    for (const [key, element] of Object.entries(elements)) {
      if (!(key in result)) {
        result[key] = element;
        usedNewElements = true;
      }
    }
  }

  // if no new elements are used, the ElementsContext is unnecessary.
  // We could add another guard against unnecessary contexts if usedNewElements is false,
  // but unnecessary contexts **should** already be taken care before
  // this function is called. Leaving the debug logging in for now.
  if (debugMode && !usedNewElements) {
    console.debug('Unnecessary ElementsContext; not using any newly provided elements');
  }
  return result;
}
