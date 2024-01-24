import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  TypedValue,
  capitalize,
  deepClone,
  isObject,
  isPopulated,
  tryGetProfile,
} from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

type ConsoleDebug = typeof console.debug;

export function applyDefaultValues(
  resource: Resource,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): Resource {
  const debugMode = Boolean(options?.debug);
  const debugMsg: ConsoleDebug = debugMode ? console.debug : () => undefined;

  const result = deepClone(resource);
  const pathParts: string[] = [resource.resourceType];

  const visitor = new DefaultValueVisitor(resource);
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawl();
  return visitor.getDefaultValue();

  debugMsg(`applyDefaultValues BEGIN\nvalue: ${JSON.stringify(result)}`);
  for (const [key, element] of Object.entries(schema.elements)) {
    pathParts.push(key);
    const path = resource.resourceType + '.' + key;

    let activeSchema: InternalTypeSchema;
    const typeProfileUrl = element.type.find((t) => isPopulated(t.profile))?.profile?.[0];
    if (typeProfileUrl) {
      activeSchema = tryGetProfile(typeProfileUrl);
      // change active schema
    } else {
      activeSchema = schema;
    }

    console.log(activeSchema.name, path);

    if (isPopulated(element.slicing)) {
      element.slicing.slices;
    }

    // if (element.fixed || element.pattern) {
    //   debugMsg(
    //     `applyDefaultValues key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
    //   );
    //   debugMsg('applyDefaultValues top', JSON.stringify(result, undefined, 2));
    // } else {
    //   continue;
    // }

    pathParts.pop();
  }

  // const result = modifyDefaultValueImpl({ type: parentType, value: defaultValue }, mergedElements, Boolean(debugMode));
  // return result;

  return resource;
}

interface SchemaVisitor {
  visitElement: (path: string, element: InternalSchemaElement) => void;
}

class SchemaCrawler {
  private readonly rootSchema: InternalTypeSchema;
  private schema: InternalTypeSchema;
  private readonly visitor: SchemaVisitor;
  private readonly initialPath: string;

  constructor(schema: InternalTypeSchema, visitor: SchemaVisitor) {
    this.rootSchema = schema;
    this.schema = schema;
    this.visitor = visitor;

    this.initialPath = schema.type as string;
  }

  crawl(): void {
    for (const [key, element] of Object.entries(this.rootSchema.elements)) {
      const path = this.initialPath + '.' + key;
      this.crawlElement(element, key, path);
    }
  }

  private crawlElement(element: InternalSchemaElement, key: string, path: string): void {
    const profileUrl = element.type.find((t) => isPopulated(t.profile))?.profile?.[0];
    const profile = isPopulated(profileUrl) ? tryGetProfile(profileUrl) : undefined;
    if (profile) {
      this.schema = profile;
    }

    if (isPopulated(element?.slicing?.slices)) {
      this.crawlSlicing(element.slicing, element);
    }

    this.visitor.visitElement(path, element);
  }
  private crawlSlicing(slicing: SlicingRules, element: InternalSchemaElement): void {
    for (const slice of slicing.slices) {
      console.log('SLICE', slice);

      const profileUrl = slice.type?.find((t) => isPopulated(t.profile))?.profile?.[0];
      if (isPopulated(profileUrl)) {
        const profile = tryGetProfile(profileUrl);
        console.log('SLICE profile URL', profileUrl);
        if (profile) {
          console.log('SLICE PROFILE', slice.name, profile.url);
        }
      }
    }
  }
}

class DefaultValueVisitor implements SchemaVisitor {
  private readonly resource: Resource;
  constructor(resource: Resource) {
    this.resource = resource;
  }

  visitElement(path: string, element: InternalSchemaElement): void {
    console.log(path, element.fixed?.value ?? element.pattern?.value);
  }

  getDefaultValue(): Resource {
    return this.resource;
  }
}

// export function applyDefaultValuesAtPath<T>(value: T, path: string, profileUrl: string, debug?: boolean): T {
// return value;
// }

function modifyDefaultValueImpl(
  defaultValue: TypedValue,
  elements: ElementsContextType['elements'],
  debugMode: boolean
): any {
  const inputType = defaultValue.type;
  const inputValue: any = defaultValue.value;

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => modifyDefaultValueImpl({ type: defaultValue.type, value: iv }, elements, debugMode));
  }

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  const outputValue: any = deepClone(inputValue);
  debug(`modifyDV  INPUT\ntype: ${inputType}\nvalue: ${JSON.stringify(outputValue)}`);

  for (const [key, element] of Object.entries(elements)) {
    if (element.fixed || element.pattern) {
      debug(
        `modifyDV key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
      );
      debug('modifyDV top', JSON.stringify(outputValue, undefined, 2));
    } else {
      continue;
    }

    const keyParts = key.split('.');
    let last: any = outputValue;
    for (let i = 0; i < keyParts.length; i++) {
      let keyPart = keyParts[i];
      if (keyPart.includes('[x]')) {
        const keyPartElem = elements[keyParts.slice(0, i + 1).join('.')];
        const code = keyPartElem.type[0].code;
        keyPart = keyPart.replace('[x]', capitalize(code));
      }

      if (i === keyParts.length - 1) {
        const lastArray = Array.isArray(last) ? last : [last];
        for (const item of lastArray) {
          if (element.fixed) {
            item[keyPart] = applyFixed(item[keyPart], element.fixed.value, debug);
          } else if (element.pattern) {
            item[keyPart] = applyPattern(item[keyPart], element.pattern.value, debug);
          }
        }
      } else {
        if (!(keyPart in last)) {
          const elementKey = keyParts.slice(0, i + 1).join('.');
          debug(`creating empty value for ${elementKey}`);
          last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
        }
        debug('setting last to', JSON.stringify(last[keyPart], undefined, 2));
        last = last[keyPart];
      }
    }
    debug('modifyDV bottom', JSON.stringify(outputValue, undefined, 2));
  }

  debug('modifyDV OUTPUT', JSON.stringify(outputValue));
  return outputValue;
}

function applyFixed(value: any, fixed: any, debug: ConsoleDebug): any {
  if (value === undefined) {
    debug('applyFixed', fixed);
    return fixed;
  }
  return value;
}

function applyPattern(existingValue: any, pattern: any, debug: ConsoleDebug): any {
  try {
    const result = existingValue === undefined ? undefined : deepClone(existingValue);

    if (Array.isArray(pattern)) {
      if (Array.isArray(existingValue) || existingValue === undefined || existingValue === null) {
        if ((existingValue?.length ?? 0) > 0) {
          throw new Error(
            'Cannot yet apply a pattern to a non-empty array since that would require considering cardinality and slicing'
          );
        } else {
          return [pattern];
        }
      } else {
        throw new Error('Type of value incompatible with array pattern');
      }
    } else if (isObject(pattern)) {
      if (isObject(existingValue) || existingValue === undefined || existingValue === null) {
        const resultObj = (result ?? Object.create(null)) as { [key: string]: any };
        for (const key of Object.keys(pattern)) {
          const output = applyPattern(resultObj[key], pattern[key], debug);
          debug(
            `object set ${key}`,
            JSON.stringify({ existing: resultObj[key] ?? null, pattern: pattern[key], output }, undefined, 2)
          );
          resultObj[key] = applyPattern(resultObj[key], pattern[key], debug);
        }
        return resultObj;
      } else {
        throw new Error('Type of value incompatible with object pattern');
      }
    }

    throw new Error('Unexpected type of pattern');
  } catch (ex) {
    return existingValue;
  }
}

// export type ElementsContextType = {
// debugMode: boolean;
// profileUrl: string | undefined;
// /**
//  * Get the element definition for the specified path if it has been modified by a profile.
//  * @param nestedElementPath - The path of the nested element
//  * @returns The modified element definition if it has been modified by the active profile or undefined. If undefined,
//  * the element has the default definition for the given type.
//  */
// getModifiedNestedElement: (nestedElementPath: string) => InternalSchemaElement | undefined;
// getElementByPath: (path: string) => InternalSchemaElement | undefined;
// elements: Record<string, InternalSchemaElement>;
// elementsByPath: Record<string, InternalSchemaElement>;
// modifyDefaultValue: <T extends object>(defaultValue: T, debugMode?: boolean) => T;
// };
//
// export type BuildElementsContextArgs = {
// elements: InternalTypeSchema['elements'] | undefined;
// parentPath: string;
// parentContext: ElementsContextType | undefined;
// parentType: string;
// profileUrl?: string;
// debugMode?: boolean;
// };

/*
export function buildElementsContext({
  parentContext,
  elements,
  parentPath,
  parentType,
  profileUrl,
  debugMode,
}: BuildElementsContextArgs): ElementsContextType {
  if (debugMode) {
    console.debug('Building ElementsContext', { parentPath, profileUrl, elements });
  }
  const mergedElements: ElementsContextType['elements'] = mergeElementsForContext(
    parentPath,
    elements,
    parentContext,
    Boolean(debugMode)
  );

  const nestedPaths: Record<string, InternalSchemaElement> = Object.create(null);
  const elementsByPath: ElementsContextType['elementsByPath'] = Object.create(null);

  const seenKeys = new Set<string>();
  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[parentPath + '.' + key] = property;

    const [beginning, _last] = splitOnceRight(key, '.');
    // assume paths are hierarchically sorted, e.g. identifier comes before identifier.id
    if (seenKeys.has(beginning)) {
      nestedPaths[parentType + '.' + key] = property;
    }
    seenKeys.add(key);
  }

  function getElementByPath(path: string): InternalSchemaElement | undefined {
    return elementsByPath[path];
  }

  function getModifiedNestedElement(nestedElementPath: string): InternalSchemaElement | undefined {
    return nestedPaths[nestedElementPath];
  }

  function modifyDefaultValue<T extends object>(defaultValue: T, debugMode?: boolean): T {
    const result = modifyDefaultValueImpl(
      { type: parentType, value: defaultValue },
      mergedElements,
      Boolean(debugMode)
    );
    return result;
  }

  return {
    debugMode: debugMode ?? parentContext?.debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    getModifiedNestedElement,
    getElementByPath,
    elements: mergedElements,
    elementsByPath,
    modifyDefaultValue,
  };
}

function mergeElementsForContext(
  parentPath: string,
  elements: BuildElementsContextArgs['elements'],
  parentContext: BuildElementsContextArgs['parentContext'],
  debugMode: boolean
): ElementsContextType['elements'] {
  const result: ElementsContextType['elements'] = Object.create(null);

  if (parentContext) {
    const parentPathPrefix = parentPath + '.';
    for (const [path, element] of Object.entries(parentContext.elementsByPath)) {
      if (path.startsWith(parentPathPrefix)) {
        const key = path.slice(parentPathPrefix.length);
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

  // TODO if no new elements are used, the elementscontext is very likely not necessary;
  // there could be an optimization where buildElementsContext returns undefined in this case
  // to avoid needless contexts
  if (debugMode && parentContext && !usedNewElements) {
    console.debug('ElementsContext elements same as parent context');
  }
  return result;
}

type ConsoleDebug = typeof console.debug;

*/
