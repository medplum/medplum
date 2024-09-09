import { AccessPolicyResource } from '@medplum/fhirtypes';
import { InternalSchemaElement } from './typeschema/types';
import { getPathDifference, splitN } from './utils';

export interface ExtendedInternalSchemaElement extends InternalSchemaElement {
  readonly?: boolean;
}

export type ExtendedElementProperties = { readonly: boolean; hidden: boolean };

/*
Throughout ElementsContext and the ResourceForm components, we use the following terminology:
"path" refers to the FHIR path to an element including the resourceType, e.g. Patient.name.family
"key" is a contextually relative path to an element not prefixed by the resourceType, e.g. name.family,
*/

/**
 * Information for the set of elements at a given path within in a resource. This mostly exists to
 * normalize access to elements regardless of whether they are from a profile, extension, or slice.
 */
export type ElementsContextType = {
  /** The FHIR path from the root resource to which the keys of `elements` are relative. */
  path: string;
  /**
   * The mapping of keys to `ExtendedInternalSchemaElement` at the current `path` relative to the
   * root resource. `elements` originate from either `InternalTypeSchema.elements` or
   * `SliceDefinition.elements` when the elements context is created within a slice.
   */
  elements: Record<string, ExtendedInternalSchemaElement>;
  /**
   * Similar mapping as `elements`, but with keys being the full path from the root resource rather
   * than relative to `path`, in other words, the keys of the Record are `${path}.${key}`.
   */
  elementsByPath: Record<string, ExtendedInternalSchemaElement>;
  /** The URL, if any, of the resource profile or extension from which the `elements` collection originated. */
  profileUrl: string | undefined;
  /** Whether debug logging is enabled */
  debugMode: boolean;
  /** The `AccessPolicyResource` provided, if any, used to determine hidden and readonly elements. */
  accessPolicyResource?: AccessPolicyResource;
  /**
   * Used to get an `ExtendedElementProperties` object for an element at a given path. This
   * is primarily useful when working with elements not included in `InternalTypeSchema.elements`
   * as is the case for nested elements that have not been modified by a profile or extension,
   * e.g. Patient.name.family.
   *
   * This function does not attempt to determine if the input `path` is actually an element in the
   * resource. When a syntactically correct path to a nonexistent element, e.g. Patient.foobar, is provided,
   * a `ExtendedElementProperties` object with default values is returned.
   *
   * @param path - The full path to an element in the resource, e.g. Patient.name.family
   * @returns An `ExtendedElementProperties` object with `readonly` and `hidden` properties for the
   * element at `path`, or `undefined` if the input path is malformed.
   */
  getExtendedProps(path: string): ExtendedElementProperties | undefined;
  /** `true` if this is a default/placeholder `ElementsContextType` */
  isDefaultContext?: boolean;
};

export function buildElementsContext({
  parentContext,
  path,
  elements,
  profileUrl,
  debugMode,
  accessPolicyResource,
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
  accessPolicyResource?: AccessPolicyResource;
}): ElementsContextType | undefined {
  if (path === parentContext?.path) {
    return undefined;
  }

  debugMode ??= parentContext?.debugMode ?? false;
  accessPolicyResource ??= parentContext?.accessPolicyResource;

  let mergedElements: Record<string, ExtendedInternalSchemaElement> = mergeElementsForContext(
    path,
    elements,
    parentContext,
    Boolean(debugMode)
  );

  const keyPrefix = splitN(path, '.', 2)[1] as string | undefined;
  mergedElements = removeHiddenFields(mergedElements, accessPolicyResource, keyPrefix);
  mergedElements = markReadonlyFields(mergedElements, accessPolicyResource, keyPrefix);

  const elementsByPath: Record<string, ExtendedInternalSchemaElement> = Object.create(null);
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[path + '.' + key] = property;
  }

  /*
  Since AccessPolicyResource.readonlyFields and hiddenFields are always relative to the root resource, we propagate
  a memoized `getExtendedProps` from the outermost ElementsContext
  */
  let getExtendedProps: (path: string) => ExtendedElementProperties | undefined;
  if (parentContext && !parentContext.isDefaultContext) {
    getExtendedProps = parentContext.getExtendedProps;
  } else {
    const memoizedExtendedProps: Record<string, ExtendedElementProperties> = Object.create(null);
    getExtendedProps = (path: string): ExtendedElementProperties | undefined => {
      const key = splitN(path, '.', 2)[1] as string | undefined;
      if (!key) {
        return undefined;
      }

      if (!memoizedExtendedProps[key]) {
        const hidden = matchesKeyPrefixes(key, accessPolicyResource?.hiddenFields);
        memoizedExtendedProps[key] = {
          hidden,
          // hidden implies readonly even if it's not explicitly marked as such
          readonly: hidden || matchesKeyPrefixes(key, accessPolicyResource?.readonlyFields),
        };
      }
      return memoizedExtendedProps[key];
    };
  }

  return {
    path: path,
    elements: mergedElements,
    elementsByPath,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    debugMode,
    getExtendedProps,
    accessPolicyResource,
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

function removeHiddenFields(
  elements: Record<string, InternalSchemaElement>,
  accessPolicyResource: AccessPolicyResource | undefined,
  keyPrefix?: string
): Record<string, InternalSchemaElement> {
  if (!accessPolicyResource?.hiddenFields?.length) {
    return elements;
  }

  const prefix = keyPrefix ? keyPrefix + '.' : '';
  return Object.fromEntries(
    Object.entries(elements).filter(([key]) => !matchesKeyPrefixes(prefix + key, accessPolicyResource.hiddenFields))
  );
}

function markReadonlyFields(
  elements: Record<string, InternalSchemaElement>,
  accessPolicyResource: AccessPolicyResource | undefined,
  keyPrefix?: string
): Record<string, ExtendedInternalSchemaElement> {
  if (!accessPolicyResource?.readonlyFields?.length) {
    return elements;
  }

  const result: Record<string, ExtendedInternalSchemaElement> = Object.create(null);

  const prefix = keyPrefix ? keyPrefix + '.' : '';
  for (const [key, element] of Object.entries(elements)) {
    const isReadonly = matchesKeyPrefixes(prefix + key, accessPolicyResource.readonlyFields);
    if (isReadonly) {
      // shallow-clone `element` to avoid modifying the in-memory DATA_TYPES cache access via `getDataType`
      result[key] = { ...element, readonly: true };
    } else {
      result[key] = element;
    }
  }

  return result;
}

function matchesKeyPrefixes(key: string, prefixes: string[] | undefined): boolean {
  // It might be a performance win to convert prefixes to a set, but the
  // cardinality of prefixes, i.e. hidden/readonly fields, is expected to be small (< 10)
  // such that the memory overhead of a set is not worth the performance gain.

  if (!prefixes?.length) {
    return false;
  }

  const keyParts = key.split('.');
  for (let i = 1; i <= keyParts.length; i++) {
    const key = keyParts.slice(0, i).join('.');
    if (prefixes.includes(key)) {
      return true;
    }
  }
  return false;
}
