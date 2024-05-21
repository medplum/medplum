import { AccessPolicyResource } from '@medplum/fhirtypes';
import { InternalSchemaElement } from './typeschema/types';
import { getPathDifference, splitN } from './utils';

export interface AnnotatedInternalSchemaElement extends InternalSchemaElement {
  readonly?: boolean;
}

/**
 * Information for the set of elements at a given path within in a resource. This mostly exists to
 * normalize access to elements regardless of whether they are from a profile, extension, or slice.
 */
export type ElementsContextType = {
  /** The FHIR path from the root resource to which the keys of `elements` are relative. */
  path: string;
  /**
   * The mapping of keys to `AnnotatedInternalSchemaElement` at the current `path` relative to the
   * root resource. `elements` originate from either `InternalTypeSchema.elements` or
   * `SliceDefinition.elements` when the elements context is created within a slice.
   */
  elements: Record<string, AnnotatedInternalSchemaElement>;
  /**
   * Similar mapping as `elements`, but with keys being the full path from the root resource rather
   * than relative to `path`, in other words, the keys of the Record are `${path}.${key}`.
   */
  elementsByPath: Record<string, AnnotatedInternalSchemaElement>;
  /** The URL, if any, of the resource profile or extension from which the `elements` collection originated. */
  profileUrl: string | undefined;
  /** Whether debug logging is enabled */
  debugMode: boolean;
  accessPolicyResource?: AccessPolicyResource;
  getExtendedProps(path: string): ExtendedElementProps | undefined;
};

type ExtendedElementProps = { readonly: boolean; hidden: boolean };

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

  accessPolicyResource ??= parentContext?.accessPolicyResource;

  let mergedElements: Record<string, AnnotatedInternalSchemaElement> = mergeElementsForContext(
    path,
    elements,
    parentContext,
    Boolean(debugMode)
  );
  mergedElements = removeHiddenFields(mergedElements, accessPolicyResource);
  mergedElements = markReadonlyFields(mergedElements, accessPolicyResource);

  const elementsByPath: Record<string, AnnotatedInternalSchemaElement> = Object.create(null);
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[path + '.' + key] = property;
  }

  // Since AccessPolicyResource are always specified from the root of a resource, we can (and should)
  // memoize getExtendedProps since its input are full paths regardless of the depth/location of the
  // ElementsContext within the resource.
  let getExtendedProps: (path: string) => ExtendedElementProps | undefined;
  if (parentContext) {
    getExtendedProps = parentContext.getExtendedProps;
  } else {
    const memoizedExtendedProps: Record<string, ExtendedElementProps> = Object.create(null);
    getExtendedProps = (path: string): ExtendedElementProps => {
      const [resourceType, key] = splitN(path, '.', 2);
      if (accessPolicyResource?.resourceType) {
        console.assert([resourceType, '*'].includes(accessPolicyResource.resourceType), 'Unexpected resource type');
      }

      if (!memoizedExtendedProps[key]) {
        memoizedExtendedProps[key] = {
          readonly: matchesKeyPrefixes(key, accessPolicyResource?.readonlyFields),
          hidden: matchesKeyPrefixes(key, accessPolicyResource?.hiddenFields),
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
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
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
  accessPolicyResource: AccessPolicyResource | undefined
): Record<string, InternalSchemaElement> {
  if (!accessPolicyResource?.hiddenFields?.length) {
    return elements;
  }

  const hiddenKeyPrefixes = new Set<string>();
  for (const field of accessPolicyResource.hiddenFields) {
    hiddenKeyPrefixes.add(field);
  }

  const result: Record<string, InternalSchemaElement> = Object.create(null);

  for (const [key, element] of Object.entries(elements)) {
    const isHidden = matchesKeyPrefixes(key, accessPolicyResource.hiddenFields);
    if (!isHidden) {
      result[key] = element;
    }
  }

  return result;
}

function markReadonlyFields(
  elements: Record<string, InternalSchemaElement>,
  accessPolicyResource: AccessPolicyResource | undefined
): Record<string, AnnotatedInternalSchemaElement> {
  if (!accessPolicyResource?.readonlyFields?.length) {
    return elements;
  }

  const result: Record<string, AnnotatedInternalSchemaElement> = Object.create(null);

  for (const [key, element] of Object.entries(elements)) {
    const isReadonly = matchesKeyPrefixes(key, accessPolicyResource.readonlyFields) || true;
    if (isReadonly) {
      result[key] = { ...element, readonly: true };
    } else {
      result[key] = element;
    }
  }

  return result;
}

function matchesKeyPrefixes(key: string, prefixes: string[] | undefined): boolean {
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
