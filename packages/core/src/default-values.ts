/* eslint-disable no-debugger */
import { Resource } from '@medplum/fhirtypes';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
  SlicingRules,
} from './typeschema/types';
import { arrayify, capitalize, deepClone, isObject, isPopulated, splitOnceRight } from './utils';
import { getNestedProperty } from './typeschema/crawler';
import { TypedValue } from './types';
import { matchDiscriminant } from './typeschema/validation';
import {
  ElementsContextType,
  SchemaCrawler,
  SchemaVisitor,
  VisitorSliceDefinition,
  VisitorSlicingRules,
} from './schema-crawler';

type ConsoleDebug = typeof console.debug;

export function applyDefaultValuesToResource(
  resource: Resource,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): Resource {
  const debugMode = Boolean(options?.debug);
  const visitor = new DefaultValueVisitor();
  const crawler = new SchemaCrawler(schema, visitor);
  visitor.setRootValue(resource, 'resource');
  crawler.crawlResource(debugMode);
  return visitor.getDefaultValue();
}

type SliceValue = any;

type SlicingContext = {
  path: string;
  slicing: SlicingRules;
  valuesBySliceName: Record<string, SliceValue>;
};

type SliceContext = {
  slice: VisitorSliceDefinition;
};

type ValueContext = {
  path: string;
  type: 'resource' | 'element' | 'slice';
  typedValues: TypedValue[];
};

export class DefaultValueVisitor implements SchemaVisitor {
  // private readonly inputResource: Resource;
  // private readonly outputResource: Resource;

  private inputRootValue: any;
  private outputRootValue: any;

  private readonly schemaStack: InternalTypeSchema[];
  private valueStack: ValueContext[];
  private readonly slicingContextStack: SlicingContext[];
  private readonly sliceContextStack: SliceContext[];

  private debugMode: boolean = true;

  constructor() {
    // this.inputResource = resource;
    // this.outputResource = deepClone(this.inputResource);

    this.schemaStack = [];
    this.valueStack = [];
    this.slicingContextStack = [];
    this.sliceContextStack = [];
  }

  private get schema(): InternalTypeSchema {
    return this.schemaStack[this.schemaStack.length - 1];
  }

  // private get slicingContext(): SlicingContext {
  // return this.slicingContextStack[this.slicingContextStack.length - 1];
  // }

  // private get sliceContext(): SliceContext {
  // return this.sliceContextStack[this.sliceContextStack.length - 1];
  // }

  private get value(): ValueContext {
    return this.valueStack[this.valueStack.length - 1];
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[ApplyDefaults][${this.schema.name}]`, ...data);
    }
  }

  setRootValue(rootValue: any, type: ValueContext['type']): void {
    this.inputRootValue = rootValue;
    this.outputRootValue = deepClone(rootValue);

    this.valueStack.push({
      type: type,
      path: 'TODO', // this.inputRootValue.resourceType,
      typedValues: [{ type: 'TODO', value: this.outputRootValue }],
    });
  }

  onEnterSchema(schema: InternalTypeSchema): void {
    this.schemaStack.push(schema);
  }

  onExitSchema(): void {
    this.schemaStack.pop();
    // console.assert(this.schemaStack.length === 0, 'Expected schema stack to be empty when exiting resource');
  }

  onEnterResource(): void {
    this.valueStack.push({
      type: 'resource',
      path: this.inputRootValue.resourceType,
      typedValues: [{ type: this.schema.name, value: this.outputRootValue }],
    });
  }

  onExitResource(): void {
    const valueContext = this.valueStack.pop();
    if (!valueContext) {
      throw new Error('Expected valueContext to exist when exiting resource');
    }
    this.debug('onExitResource', JSON.stringify(valueContext.typedValues, undefined, 2));
    console.assert(this.valueStack.length === 0, 'Expected valueStack to be empty when exiting resource');
  }

  onEnterElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    this.debug(`onEnterElement ${path} ${element.min > 0 ? `min: ${element.min}` : ''}`);

    const parentTVs = this.value.typedValues;
    const parentPath = this.value.path;
    const key = getPathDifference(parentPath, path);

    // eld-6	Rule	Fixed value may only be specified if there is one type
    // eld-7	Rule	Pattern may only be specified if there is one type
    const canSkip = element.type.length > 1;

    const elementType = element.type[0].code;
    const elements = elementsContext.elements;
    const isComplex = isComplexTypeCode(elementType);

    const elementTVs: TypedValue[] = [];

    if (path === 'Patient.extension.url') {
      debugger;
    }

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < parentTVs.length; i++) {
      const parentTV = parentTVs[i];

      if (parentTV.value === undefined) {
        elementTVs.push({ type: 'undefined', value: undefined });
        continue;
      }

      if (canSkip) {
        elementTVs.push({
          type: 'TODO-skip',
          value: getValueAtKey(parentTV.value, key, element, elementsContext.elements),
        });
        continue;
      }

      let parentArray: any[];
      if (Array.isArray(parentTV.value)) {
        parentArray = parentTV.value;
      } else {
        parentArray = [parentTV.value];
      }

      for (const parent of parentArray) {
        if (key.includes('.')) {
          // check intermediate value for existence. If it doesn't exist, i.e. (=== undefined), then fixed/pattern
          // values for nested elements should not be applied
          const [directParentKey, _lastKeyPart] = splitOnceRight(key, '.');
          const directParentElement = elements[directParentKey];
          const directParentValue = getValueAtKey(parent, directParentKey, directParentElement, elements);
          if (directParentValue === undefined) {
            continue;
          }
        }

        const existingValue = getValueAtKey(parent, key, element, elements);

        if (element.min > 0 && existingValue === undefined) {
          if (isComplex) {
            if (element.isArray) {
              setValueAtKey(parent, [Object.create(null)], key, element);
            } else {
              if (element.min > 1) {
                throw new Error('Element min count greater than 1 for non-array element.');
              }
              this.debug(`created empty value for ${key}`);
              setValueAtKey(parent, Object.create(null), key, element);
            }
          }
        }

        applyFixedOrPatternValue(parentTV, key, element, elements, true);
      }

      if (Array.isArray(parentTV.value)) {
        elementTVs.push({
          type: 'TODO-isArray',
          value: parentTV.value.map((pv) => getValueAtKey(pv, key, element, elementsContext.elements)),
        });
      } else {
        elementTVs.push({
          type: 'TODO-nonArray',
          value: getValueAtKey(parentTV.value, key, element, elementsContext.elements),
        });
      }
    }

    if (elementTVs.length !== this.value.typedValues.length) {
      debugger;
    }
    this.valueStack.push({
      type: 'element',
      path: path,
      typedValues: elementTVs,
    });
  }

  onExitElement(path: string, _element: InternalSchemaElement, _elementsContext: ElementsContextType): void {
    const elementValueContext = this.valueStack.pop();
    if (!elementValueContext) {
      throw new Error('Expected value context to exist when exiting element');
    }
    this.debug(`onExitElement ${path}\n${JSON.stringify(elementValueContext.typedValues)}`);

    // TODO: remove all this for now?
    for (let valueIndex = 0; valueIndex < elementValueContext.typedValues.length; valueIndex++) {
      const elementValue = elementValueContext.typedValues[valueIndex].value;
      if (Array.isArray(elementValue)) {
        for (let i = elementValue.length - 1; i >= 0; i--) {
          const value = elementValue[i];
          // for (const value of elementValue) {
          if (value !== undefined && !isPopulated(value)) {
            this.debug(`empty value found in array`, JSON.stringify(value));
            elementValue.splice(i, 1);
          }
        }
      } else if (elementValue !== undefined && !isPopulated(elementValue)) {
        const parentValue = this.value.typedValues[valueIndex].value;
        const fromParent = getValueAtKey(
          parentValue,
          getPathDifference(this.value.path, path),
          _element,
          _elementsContext.elements
        );
        this.debug(
          `empty value found on object\n${JSON.stringify(elementValue)}\nfrom parent:\n${JSON.stringify(fromParent)}`,
          elementValue === fromParent
        );
        setValueAtKey(parentValue, undefined, getPathDifference(this.value.path, path), _element);
      }
    }
  }

  onEnterSlicing(path: string, slicing: VisitorSlicingRules): void {
    const valuesBySliceName: Record<string, SliceValue> = Object.create(null);
    for (const slice of slicing.slices) {
      valuesBySliceName[slice.name] = [];
    }
    this.slicingContextStack.push({ path, slicing, valuesBySliceName });
  }

  onExitSlicing(): void {
    const context = this.slicingContextStack.pop();
    if (!context) {
      throw new Error('Expected slicing context to exist');
    }
  }

  onEnterSlice(path: string, slice: VisitorSliceDefinition, slicing: VisitorSlicingRules): void {
    this.debug(`onEnterSlice[${slice.name}] ${path} ${slice.min > 0 ? `min: ${slice.min}` : ''}`);

    const elementTVs = this.value.typedValues;
    const sliceTVs: TypedValue[] = [];
    const sliceType = slice.type[0].code;
    const isComplex = isComplexTypeCode(sliceType);

    for (const elementTV of elementTVs) {
      if (elementTV.value === undefined) {
        continue;
      }

      debugger;

      if (!Array.isArray(elementTV.value)) {
        throw new Error('Expected array value for sliced element');
      }

      const elementValueArray: any[] = elementTV.value;

      const sliceValues: any[] = [];
      for (const arrayValue of elementValueArray) {
        const sliceName = getValueSliceName(
          arrayValue,
          [slice],
          slicing.discriminator,
          slice.typeSchema,
          this.schema.url
        );
        if (sliceName === slice.name) {
          this.debug(`found exisitng value for slice ${sliceName}`, JSON.stringify(arrayValue));
          sliceValues.push(arrayValue);
        }
      }
      if (sliceValues.length < slice.min) {
        if (isComplex) {
          const emptySliceValue = Object.create(null);
          this.debug(`created empty slice[${slice.name}] entry since found < slice.min`);
          elementValueArray.push(emptySliceValue);
          sliceValues.push(emptySliceValue);
        } else {
          // what should happen if the slice is a simple type?
        }
      }
      sliceTVs.push({ type: sliceType, value: sliceValues });
    }

    this.valueStack.push({
      type: 'slice',
      path,
      typedValues: sliceTVs,
    });
    this.sliceContextStack.push({ slice });
  }

  onExitSlice(): void {
    const sliceValueContext = this.valueStack.pop();
    if (!sliceValueContext) {
      throw new Error('Expected value context to exist in onExitSlice');
    }

    const sliceCtx = this.sliceContextStack.pop();
    if (!sliceCtx) {
      throw new Error('Expected slice context to exist on exit');
    }

    this.debug('onExitSlice', sliceCtx.slice.name, JSON.stringify(sliceValueContext.typedValues));
    this.debug('parentValue', JSON.stringify(this.value.typedValues));
  }

  getDefaultValue(): Resource {
    return this.outputRootValue;
  }
}

function isDiscriminatorComponentMatch(
  typedValue: TypedValue,
  discriminator: SliceDiscriminator,
  slice: SliceDefinition,
  sliceSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined
): boolean {
  const nestedProp = getNestedProperty(typedValue, discriminator.path, { profileUrl: sliceSchema?.url ?? profileUrl });

  if (nestedProp) {
    const elementList = sliceSchema?.elements ?? slice.elements;
    return arrayify(nestedProp)?.some((v: any) => matchDiscriminant(v, discriminator, slice, elementList)) ?? false;
  } else {
    console.assert(false, 'getNestedProperty[%s] in isDiscriminatorComponentMatch missed', discriminator.path);
  }

  return false;
}

function getValueSliceName(
  value: any,
  slices: SliceDefinition[],
  discriminators: SliceDiscriminator[],
  sliceSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined
): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const slice of slices) {
    const sliceType = sliceSchema?.name ?? slice.type?.[0].code ?? 'TODO';
    const typedValue: TypedValue = {
      value,
      type: sliceType,
    };
    if (discriminators.every((d) => isDiscriminatorComponentMatch(typedValue, d, slice, sliceSchema, profileUrl))) {
      return slice.name;
    }
  }
  return undefined;
}

function getPathDifference(parentPath: string, path: string): string {
  if (!path.startsWith(parentPath)) {
    throw new Error(`Expected ${path} to be prefixed by ${parentPath}`);
  }
  return path.slice(parentPath.length + 1);
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
  if (!isPopulated(value)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((valueItem) => getValueAtKey(valueItem, key, element, elements));
  }

  if (!isObject(value)) {
    throw new Error('Expected value to be an object');
  }

  const keyParts = key.split('.');
  let last: any = value;
  let answer;
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
    }

    // intermediate key part
    if (Array.isArray(last)) {
      last = last.map((lastItem) => {
        return lastItem[keyPart];
      });
    } else if (isObject(last)) {
      if (!(keyPart in last) || last[keyPart] === undefined) {
        return undefined;
      }
      last = last[keyPart];
    } else {
      throw new Error('Expected value at intermediate key part to be an array or object');
    }
  }

  return answer;
}

function applyFixedOrPatternValue(
  inputTV: TypedValue,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>,
  debugMode: boolean
): any {
  if (!(element.fixed || element.pattern)) {
    return inputTV.value;
  }

  const inputType = inputTV.type;
  let inputValue = inputTV.value;

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) =>
      applyFixedOrPatternValue({ type: inputType, value: iv }, key, element, elements, debugMode)
    );
  }

  if (inputValue === undefined || inputValue === null) {
    inputValue = Object.create(null);
  }

  const outputValue = inputValue;

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  debug(
    `applyFixedPattern key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
  );
  debug(`begin`, JSON.stringify(inputValue, undefined, 2));

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
      debug('setting last to', JSON.stringify(last[keyPart]));
      last = last[keyPart];
    }
  }
  debug(`done`, JSON.stringify(outputValue, undefined, 2));

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
          return pattern;
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

function isComplexTypeCode(code: string): boolean {
  return code.startsWith(code[0].toUpperCase());
}
