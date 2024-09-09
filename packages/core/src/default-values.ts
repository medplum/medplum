import { Resource } from '@medplum/fhirtypes';
import { SchemaCrawler, SchemaVisitor, VisitorSlicingRules } from './schema-crawler';
import { SliceDefinitionWithTypes, getValueSliceName } from './typeschema/slices';
import { InternalSchemaElement, InternalTypeSchema, SliceDefinition, SlicingRules } from './typeschema/types';
import { capitalize, deepClone, getPathDifference, isComplexTypeCode, isEmpty, isObject, isPopulated } from './utils';
import { ElementsContextType } from './elements-context';

/**
 * Used when an array entry, typically an empty one, needs to be assigned
 * to a given slice even though it doesn't match the slice's discriminator.
 */
const SLICE_NAME_KEY = '__sliceName';

/**
 * Adds default values to `resource` based on the supplied `schema`. Default values includes all required fixed and pattern
 * values specified on elements in the schema. If an element has a fixed/pattern value but is optional, i.e.
 * `element.min === 0`, the default value is not added.
 *
 * @param resource - The resource to which default values should be added.
 * @param schema - The schema to use for adding default values.
 * @returns A clone of `resource` with default values added.
 */
export function applyDefaultValuesToResource(resource: Resource, schema: InternalTypeSchema): Resource {
  const visitor = new DefaultValueVisitor(resource, resource.resourceType, 'resource');
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlResource();
  return visitor.getDefaultValue();
}

/**
 * Adds default values to `existingValue` for the given `key` and its children. If `key` is undefined,
 * default values are added to all elements in `elements`. Default values consist of all fixed and pattern
 * values defined in the relevant elements.
 * @param existingValue - The
 * @param elements - The elements to which default values should be added.
 * @param key - (optional) The key of the element(s) for which default values should be added. Elements with nested
 * keys are also included. If undefined, default values for all elements are added.
 * @returns `existingValue` with default values added
 */
export function applyDefaultValuesToElement(
  existingValue: object,
  elements: Record<string, InternalSchemaElement>,
  key?: string
): object {
  for (const [elementKey, element] of Object.entries(elements)) {
    if (key === undefined || key === elementKey) {
      applyFixedOrPatternValue(existingValue, elementKey, element, elements);
      continue;
    }

    const keyDifference = getPathDifference(key, elementKey);
    if (keyDifference !== undefined) {
      applyFixedOrPatternValue(existingValue, keyDifference, element, elements);
    }
  }

  return existingValue;
}

export function applyDefaultValuesToElementWithVisitor(
  existingValue: any,
  path: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>,
  schema: InternalTypeSchema
): any {
  const inputValue: object = existingValue ?? Object.create(null);

  const [parentPath, key] = splitOnceRight(path, '.');
  const parent = Object.create(null);
  setValueAtKey(parent, inputValue, key, element);

  const visitor = new DefaultValueVisitor(parent, parentPath, 'element');
  const crawler = new SchemaCrawler(schema, visitor, elements);
  crawler.crawlElement(element, key, parentPath);
  const modifiedContainer = visitor.getDefaultValue();

  return getValueAtKey(modifiedContainer, key, element, elements);
}

export function getDefaultValuesForNewSliceEntry(
  key: string,
  slice: SliceDefinition,
  slicing: SlicingRules,
  schema: InternalTypeSchema
): Resource {
  const visitor = new DefaultValueVisitor([{ [SLICE_NAME_KEY]: slice.name }], slice.path, 'element');
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlSlice(key, slice, slicing);
  return visitor.getDefaultValue()[0];
}

type ValueContext = {
  type: 'resource' | 'element' | 'slice';
  path: string;
  values: any[];
};

class DefaultValueVisitor implements SchemaVisitor {
  private rootValue: any;

  private readonly schemaStack: InternalTypeSchema[];
  private readonly valueStack: ValueContext[];

  constructor(rootValue: any, path: string, type: ValueContext['type']) {
    this.schemaStack = [];
    this.valueStack = [];

    this.rootValue = deepClone(rootValue);
    this.valueStack.splice(0, this.valueStack.length, {
      type,
      path,
      values: [this.rootValue],
    });
  }

  private get schema(): InternalTypeSchema {
    return this.schemaStack[this.schemaStack.length - 1];
  }

  private get value(): ValueContext {
    return this.valueStack[this.valueStack.length - 1];
  }

  onEnterSchema(schema: InternalTypeSchema): void {
    this.schemaStack.push(schema);
  }

  onExitSchema(): void {
    this.schemaStack.pop();
  }

  onEnterElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    // eld-6: Fixed value may only be specified if there is one type
    // eld-7: Pattern may only be specified if there is one type
    // It may be possible to optimize this by checking element.type.length > 1 and short-circuiting

    const parentValues = this.value.values;
    const parentPath = this.value.path;
    const key = getPathDifference(parentPath, path);
    if (key === undefined) {
      throw new Error(`Expected ${path} to be prefixed by ${parentPath}`);
    }
    const elementValues: any[] = [];

    for (const parentValue of parentValues) {
      if (parentValue === undefined) {
        continue;
      }

      const parentArray: any[] = Array.isArray(parentValue) ? parentValue : [parentValue];
      for (const parent of parentArray) {
        applyMinimums(parent, key, element, elementsContext.elements);
        applyFixedOrPatternValue(parent, key, element, elementsContext.elements);
        const elementValue = getValueAtKey(parent, key, element, elementsContext.elements);
        if (elementValue !== undefined) {
          elementValues.push(elementValue);
        }
      }
    }

    this.valueStack.push({
      type: 'element',
      path: path,
      values: elementValues,
    });
  }

  onExitElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    const elementValueContext = this.valueStack.pop();
    if (!elementValueContext) {
      throw new Error('Expected value context to exist when exiting element');
    }

    const key = getPathDifference(this.value.path, path);
    if (key === undefined) {
      throw new Error(`Expected ${path} to be prefixed by ${this.value.path}`);
    }

    for (const parentValue of this.value.values) {
      const elementValue = getValueAtKey(parentValue, key, element, elementsContext.elements);

      // remove empty items from arrays
      if (Array.isArray(elementValue)) {
        for (let i = elementValue.length - 1; i >= 0; i--) {
          const value: any = elementValue[i];
          if (!isPopulated(value)) {
            elementValue.splice(i, 1);
          }
        }
      }

      if (isEmpty(elementValue)) {
        // setting undefined to delete the key
        setValueAtKey(parentValue, undefined, key, element);
      }
    }
  }

  onEnterSlice(path: string, slice: SliceDefinitionWithTypes, slicing: VisitorSlicingRules): void {
    const elementValues = this.value.values;
    const sliceValues: any[] = [];

    for (const elementValue of elementValues) {
      if (elementValue === undefined) {
        continue;
      }

      if (!Array.isArray(elementValue)) {
        throw new Error('Expected array value for sliced element');
      }

      const matchingItems: any[] = this.getMatchingSliceValues(elementValue, slice, slicing);
      sliceValues.push(matchingItems);
    }

    this.valueStack.push({
      type: 'slice',
      path,
      values: sliceValues,
    });
  }

  getMatchingSliceValues(elementValue: any[], slice: SliceDefinitionWithTypes, slicing: VisitorSlicingRules): any[] {
    const matchingItems: any[] = [];
    for (const arrayItem of elementValue) {
      const sliceName: string | undefined =
        arrayItem[SLICE_NAME_KEY] ?? getValueSliceName(arrayItem, [slice], slicing.discriminator, this.schema.url);

      if (sliceName === slice.name) {
        matchingItems.push(arrayItem);
      }
    }

    // Make sure at least slice.min values exist
    for (let i = matchingItems.length; i < slice.min; i++) {
      if (isComplexTypeCode(slice.type[0].code)) {
        const emptySliceValue = Object.create(null);
        matchingItems.push(emptySliceValue);

        // push onto input array so that it propagates upwards as well
        elementValue.push(emptySliceValue);
      }
    }

    return matchingItems;
  }

  onExitSlice(): void {
    const sliceValuesContext = this.valueStack.pop();
    if (!sliceValuesContext) {
      throw new Error('Expected value context to exist in onExitSlice');
    }

    for (const sliceValueArray of sliceValuesContext.values) {
      for (let i = sliceValueArray.length - 1; i >= 0; i--) {
        const sliceValue = sliceValueArray[i];
        if (SLICE_NAME_KEY in sliceValue) {
          delete sliceValue[SLICE_NAME_KEY];
        }
      }
    }
  }

  getDefaultValue(): any {
    return this.rootValue;
  }
}

function applyMinimums(
  parent: any,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>
): void {
  const existingValue = getValueAtKey(parent, key, element, elements);

  if (element.min > 0 && existingValue === undefined) {
    if (isComplexTypeCode(element.type[0].code)) {
      if (element.isArray) {
        setValueAtKey(parent, [Object.create(null)], key, element);
      } else {
        setValueAtKey(parent, Object.create(null), key, element);
      }
    }
  }
}

function setValueAtKey(parent: any, value: any, key: string, element: InternalSchemaElement): void {
  if (key.includes('.')) {
    throw new Error('key cannot be nested');
  }

  let resolvedKey = key;

  if (key.includes('[x]')) {
    const code = element.type[0].code;
    resolvedKey = key.replace('[x]', capitalize(code));
  }

  if (value === undefined) {
    delete parent[resolvedKey];
  } else {
    parent[resolvedKey] = value;
  }
}

function getValueAtKey(
  value: object,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>
): any {
  const keyParts = key.split('.');
  let last: any = value;
  let answer: any;
  for (let i = 0; i < keyParts.length; i++) {
    let keyPart = keyParts[i];
    if (keyPart.includes('[x]')) {
      const keyPartElem = elements[keyParts.slice(0, i + 1).join('.')];
      // should this loop through all possible types instead of using type[0]?
      const code = keyPartElem.type[0].code;
      keyPart = keyPart.replace('[x]', capitalize(code));
    }

    // final key part
    if (i === keyParts.length - 1) {
      if (Array.isArray(last)) {
        answer = last.map((item) => item[keyPart]);
      } else {
        answer = last[keyPart];
      }
      continue;
    }

    // intermediate key part
    if (Array.isArray(last)) {
      last = last.map((lastItem) => lastItem[keyPart]);
    } else if (isObject(last)) {
      if (last[keyPart] === undefined) {
        return undefined;
      }
      last = last[keyPart];
    } else {
      return undefined;
    }
  }

  return answer;
}

export function applyFixedOrPatternValue(
  inputValue: any,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>
): any {
  if (!(element.fixed || element.pattern)) {
    return inputValue;
  }

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => applyFixedOrPatternValue(iv, key, element, elements));
  }

  if (inputValue === undefined || inputValue === null) {
    inputValue = Object.create(null);
  }

  const outputValue = inputValue;

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
          item[keyPart] ??= element.fixed.value;
        } else if (element.pattern) {
          item[keyPart] = applyPattern(item[keyPart], element.pattern.value);
        }
      }
    } else {
      if (!(keyPart in last)) {
        const elementKey = keyParts.slice(0, i + 1).join('.');
        last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
      }
      last = last[keyPart];
    }
  }
  return outputValue;
}

function applyPattern(existingValue: any, pattern: any): any {
  if (Array.isArray(pattern) && (Array.isArray(existingValue) || existingValue === undefined)) {
    if ((existingValue?.length ?? 0) > 0) {
      // Cannot yet apply a pattern to a non-empty array since that would require considering cardinality and slicing
      return existingValue;
    }
    return deepClone(pattern);
  } else if (isObject(pattern)) {
    if ((isObject(existingValue) && !Array.isArray(existingValue)) || existingValue === undefined) {
      const resultObj = (deepClone(existingValue) ?? Object.create(null)) as { [key: string]: any };
      for (const key of Object.keys(pattern)) {
        resultObj[key] = applyPattern(resultObj[key], pattern[key]);
      }
      return resultObj;
    }
  }

  return existingValue;
}

/**
 * Splits a string on the last occurrence of the delimiter
 * @param str - The string to split
 * @param delim - The delimiter string
 * @returns An array of two strings; the first consisting of the beginning of the
 * string up to the last occurrence of the delimiter. the second is the remainder of the
 * string after the last occurrence of the delimiter. If the delimiter is not present
 * in the string, the first element is empty and the second is the input string.
 */
function splitOnceRight(str: string, delim: string): [string, string] {
  const delimIndex = str.lastIndexOf(delim);
  if (delimIndex === -1) {
    return ['', str];
  }
  const beginning = str.substring(0, delimIndex);
  const last = str.substring(delimIndex + delim.length);
  return [beginning, last];
}
