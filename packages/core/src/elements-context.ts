import { InternalSchemaElement } from './typeschema/types';
import { getPathDifference } from './utils';

/**
 * Information for the set of elements at a given path within in a resource. This mostly exists to
 * normalize access to elements regardless of whether they are from a profile, extension, or slice.
 */
export type ElementsContextType = {
  /** The FHIR path from the root resource to which the keys of `elements` are relative. */
  path: string;
  /**
   * The mapping of keys to `InternalSchemaElement` at the current `path` relative to the
   * root resource. `elements` originate from either `InternalTypeSchema.elements` or
   * `SliceDefinition.elements` when the elements context is created within a slice.
   */
  elements: Record<string, InternalSchemaElement>;
  /**
   * Similar mapping as `elements`, but with keys being the full path from the root resource rather
   * than relative to `path`, in other words, the keys of the Record are `${path}.${key}`.
   */
  elementsByPath: Record<string, InternalSchemaElement>;
  /** The URL, if any, of the resource profile or extension from which the `elements` collection originated. */
  profileUrl: string | undefined;
  /** Whether debug logging is enabled */
  debugMode: boolean;
};

export function buildElementsContext({
  parentContext,
  path,
  elements,
  profileUrl,
  debugMode,
}: {
  /** The most recent `ElementsContextType` in which this context is being built. */
  parentContext: ElementsContextType | undefined;
  /** The FHIR path from the root resource to which the keys of `elements` are relative. */
  path: string;
  /**
   * The mapping of keys to `InternalSchemaElement` at the current `path` relative to the
   * root resource. This should be either `InternalTypeSchema.elements` or `SliceDefinition.elements`.
   */
  elements: Record<string, InternalSchemaElement>;
  /** The URL, if any, of the resource profile or extension from which the `elements` collection originated. */
  profileUrl?: string;
  /** Whether debug logging is enabled */
  debugMode?: boolean;
}): ElementsContextType | undefined {
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
    elements: mergedElements,
    elementsByPath,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
  };
}

function mergeElementsForContext(
  path: string,
  elements: Record<string, InternalSchemaElement>,
  parentContext: ElementsContextType | undefined,
  debugMode: boolean
): Record<string, InternalSchemaElement> {
  const result: Record<string, InternalSchemaElement> = Object.create(null);

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
  // this is ever hit. Leaving the debug logging in for now.
  if (debugMode) {
    console.assert(usedNewElements, 'Unnecessary ElementsContext; not using any newly provided elements');
  }
  return result;
}
