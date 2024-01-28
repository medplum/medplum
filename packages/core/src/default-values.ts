/* eslint-disable no-debugger */
import { Resource } from '@medplum/fhirtypes';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SliceDiscriminator,
  SlicingRules,
} from './typeschema/types';
import { arrayify, capitalize, deepClone, isObject, isPopulated } from './utils';
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

export function applyDefaultValues(
  resource: Resource,
  schema: InternalTypeSchema,
  options?: { debug?: boolean }
): Resource {
  const debugMode = Boolean(options?.debug);
  const visitor = new DefaultValueVisitor(resource);
  const crawler = new SchemaCrawler(schema, visitor);
  crawler.crawlSchema(debugMode);
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
  // values: TypedValue[][];
};

type ValueContext = {
  path: string;
  type: 'resource' | 'element' | 'slice';
  typedValues: TypedValue[];
};

// type NestedPropertyReturnVal = (TypedValue | TypedValue[] | undefined)[];

class DefaultValueVisitor implements SchemaVisitor {
  private readonly inputResource: Resource;
  private readonly outputResource: Resource;

  private readonly schemaStack: InternalTypeSchema[];
  private valueStack: ValueContext[];
  private readonly slicingContextStack: SlicingContext[];
  private readonly sliceContextStack: SliceContext[];

  private debugMode: boolean = true;

  constructor(resource: Resource) {
    this.inputResource = resource;
    this.outputResource = deepClone(this.inputResource);

    this.schemaStack = [];
    this.valueStack = [];
    this.slicingContextStack = [];
    this.sliceContextStack = [];
  }

  private get schema(): InternalTypeSchema {
    return this.schemaStack[this.schemaStack.length - 1];
  }

  private get slicingContext(): SlicingContext {
    return this.slicingContextStack[this.slicingContextStack.length - 1];
  }

  private get sliceContext(): SliceContext {
    return this.sliceContextStack[this.sliceContextStack.length - 1];
  }

  private get value(): ValueContext {
    return this.valueStack[this.valueStack.length - 1];
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[ApplyDefaults][${this.schema.name}]`, ...data);
    }
  }

  private getValueAtPath(
    path: string,
    value: TypedValue,
    valuePath: string,
    profileUrl: string | undefined
  ): (TypedValue | TypedValue[] | undefined)[] {
    let pathDiff: string;
    if (path.startsWith(valuePath)) {
      pathDiff = path.slice(valuePath.length + 1);
    } else {
      debugger;
      return [];
    }

    return getNestedProperty(value, pathDiff, { profileUrl, includeEmptyValues: false });
  }

  /*
  private getValuesAtPath(
    path: string,
    profileUrl: string | undefined
  ): (NestedPropertyReturnVal | NestedPropertyReturnVal[])[] {
    const [_resourceType, _restOfPath] = splitN(path, '.', 2);
    const valueContext = this.value;
    let pathDiff: string;
    if (path.startsWith(valueContext.path)) {
      pathDiff = path.slice(valueContext.path.length + 1);
    } else {
      return [];
    }
    return valueContext.value.map((v) => {
      if (Array.isArray(v)) {
        return v.map((innerV) => getNestedProperty(innerV, pathDiff, { profileUrl }));
      } else {
        return getNestedProperty(v, pathDiff, {
          profileUrl,
        });
      }
    });
    // return getNestedProperty({ type: this.inputResource.resourceType, value: this.inputResource }, restOfPath, {
    // profileUrl,
    // });
  }*/

  onEnterResource(schema: InternalTypeSchema): void {
    this.valueStack.push({
      type: 'resource',
      path: this.inputResource.resourceType,
      typedValues: [{ type: schema.name, value: this.outputResource }],
    });
    this.schemaStack.push(schema);
  }

  onExitResource(): void {
    const valueContext = this.valueStack.pop();
    if (!valueContext) {
      throw new Error('Expected valueContext to exist when exiting resource');
    }
    this.debug('onExitResource', JSON.stringify(valueContext.typedValues));
    console.assert(this.valueStack.length === 0, 'Expected valueStack to be empty when exiting resource');

    this.schemaStack.pop();
    console.assert(this.schemaStack.length === 0, 'Expected schema stack to be empty when exiting resource');
  }

  onEnterElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    const parentPath = this.value.path;
    const parentTVs = this.value.typedValues;
    const key = getPathDifference(parentPath, path);
    this.debug('onEnterElement', path);

    if (path === 'Observation.code') {
      // debugger;
    }
    if (path === 'Observation.category') {
      // debugger;
    }
    if (path === 'Observation.category.coding.code') {
      // debugger;
    }
    const elementTVs: TypedValue[] = [];

    for (let i = 0; i < parentTVs.length; i++) {
      const parentTV = parentTVs[i];
      let elementValues: (TypedValue | TypedValue[] | undefined)[];
      if (Array.isArray(parentTV.value)) {
        const parentType = parentTV.type;
        // applyMinimum(parentValue, key, element, elementsContext.elements, true);
        if (!isPopulated(parentTV.value)) {
          debugger;
          this.debug(`parentValue is missing: ${JSON.stringify(parentTV.value)}`);
        }

        const modifiedParentValue = applyFixedOrPatternValue(parentTV, key, element, elementsContext.elements, true);
        debugger; //what is this?
        const flattenedElementValues = (modifiedParentValue as any[])
          .map((innerParentValue) =>
            this.getValueAtPath(path, { type: parentType, value: innerParentValue }, parentPath, this.schema?.url)
          )
          .flat()
          .filter((v) => v !== undefined);
        elementValues = flattenedElementValues;
      } else {
        if (path === 'Observation.category.coding.id') {
          debugger;
        }
        // applyMinimum(parentValue, key, element, elementsContext.elements, true);
        const modifiedParentValue = applyFixedOrPatternValue(parentTV, key, element, elementsContext.elements, true);
        if (parentTV.value === undefined && isPopulated(modifiedParentValue)) {
          if (this.value.type === 'slice') {
            this.value.typedValues[i] = { type: 'TODO', value: [modifiedParentValue] };
          } else if (this.value.type === 'resource') {
            throw new Error('This should not happen?');
          } else {
            throw new Error('Cannot have element nested below element');
          }
        }

        const modifiedParentTV = { type: parentTV.type, value: modifiedParentValue };

        const badGetValue = this.getValueAtPath(path, modifiedParentTV, parentPath, this.schema?.url);
        const goodGetValue = getValueAtKey(
          modifiedParentValue,
          getPathDifference(parentPath, path),
          element,
          elementsContext.elements
        );
        this.debug(`good vs bad\nbad:\n${JSON.stringify(badGetValue)}\ngood:\n${JSON.stringify(goodGetValue)}`);

        elementValues = this.getValueAtPath(path, modifiedParentTV, parentPath, this.schema?.url);
        /*
        if (element.isArray && element.min > 0 && elementValues.length === 0) {
          const emptyArray: any[] = [];
          (emptyArray as any).__w = `onEnterElement[${key}] min > 0`;
          parentValue.push(emptyArray);
          sliceValues.push(emptyArray);
        }*/
      }

      if (elementValues.length === 0) {
        elementTVs.push({ type: 'undefined', value: undefined });
      } else {
        for (const elementValue of elementValues) {
          let typedValue: TypedValue;

          if (elementValue === undefined) {
            typedValue = { type: 'undefined', value: undefined };
          } else if (Array.isArray(elementValue)) {
            debugger; //why?
            if (elementValue.length === 0) {
              // debugger;
            }
            typedValue = {
              type: element.type[0].code, //elementValue[0].type,
              value: elementValue.map((e) => e.value),
            };
          } else {
            typedValue = elementValue;
          }

          elementTVs.push(typedValue);

          if (typedValue.value !== undefined) {
            this.debug('elementValue', JSON.stringify(typedValue));
          }
        }
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

  onExitElement(path: string, element: InternalSchemaElement, elementsContext: ElementsContextType): void {
    const elementValueContext = this.valueStack.pop();
    if (!elementValueContext) {
      throw new Error('Expected value context to exist when exiting element');
    }

    this.debug('onExitElement', elementValueContext.path);
    this.debug(elementValueContext.typedValues);
    for (let i = 0; i < this.value.typedValues.length; i++) {
      const elementTV = elementValueContext.typedValues[i];
      if (elementTV === undefined) {
        debugger;
      }
      if (!isPopulated(elementTV.value)) {
        continue;
      }
      const parentPath = this.value.path;
      const parentTV = this.value.typedValues[i];
      const parentType = parentTV.type;
      const parentValue = parentTV.value;
      const elementKey = getPathDifference(parentPath, elementValueContext.path);

      this.debug(
        `attach element to parent\nparentType: ${parentType}\nparentValue:\n${JSON.stringify(parentValue)}\nelementKey: ${elementKey}\nelementType: ${elementTV.type}\nelementValue:\n${JSON.stringify(elementTV.value)}`
      );
      const elementValueInParent = getValueAtKey(parentValue, elementKey, element, elementsContext.elements);
      if (Object.is(elementValueInParent, elementTV.value)) {
        console.log('Nothing to do; element value already attached');
        continue;
      }
      debugger;
      this.debug(`elementValueInParent: ${JSON.stringify(elementValueInParent)}`);
      if (element.isArray) {
        if (!Array.isArray(elementTV.value)) {
          throw new Error(`Expected array value for element ${path}`);
        }
      } else {
        if (Array.isArray(elementTV.value)) {
          throw new Error(`Expected non-array value for element ${path}`);
        }
        this.debug('nonArray', elementTV.value);
      }
      /*
        if (parentValue === undefined) {
          this.value.values[i] = elementValue;
        } else {
          if (!Array.isArray(this.value.values[i].value)) {
            throw new Error('Sliced element should have an array value');
          }
          this.value.values[i].value.push(...elementValue.value);
        }*/
    }
  }

  onEnterSlicing(path: string, slicing: VisitorSlicingRules): void {
    const valuesBySliceName: Record<string, SliceValue> = {};
    for (const slice of slicing.slices) {
      valuesBySliceName[slice.name] = [];
    }
    // const existingValue = this.getValueAtPath(path);
    // if (Array.isArray(existingValue)) {
    // valuesBySliceName = assignValuesIntoSlices(existingValue, slicing.slices, slicing, this.schema);
    // } else {
    // valuesBySliceName = {};
    // }

    this.slicingContextStack.push({ path, slicing, valuesBySliceName });
    // this.debug(`onEnterSlicing values:\n${JSON.stringify(valuesBySliceName, undefined, 2)}`);
  }

  onExitSlicing(): void {
    const context = this.slicingContextStack.pop();
    if (!context) {
      throw new Error('Expected slicing context to exist');
    }
  }

  onEnterSlice(path: string, slice: VisitorSliceDefinition): void {
    this.debug('onEnterSlice', path, slice.name);

    const elementTVs = this.value.typedValues;
    const sliceTVs: TypedValue[] = [];
    for (const elementTV of elementTVs) {
      if (elementTV.value === undefined) {
        //TODO
      } else if (!Array.isArray(elementTV.value)) {
        throw new Error('Expected undefined or array value in sliced element');
      }

      let elementType = elementTV.type;
      let elementValueArray: any[] = elementTV.value;

      if (elementTV.value === undefined) {
        // if (slice.min > 0) {
        // elementType = slice.typeSchema?.name ?? slice.type[0].code;
        // elementValueArray = [];
        // }
      }

      if (isPopulated(elementValueArray)) {
        this.debug('finding existing slice values in', JSON.stringify(elementValueArray));
        const existingSliceValues: any[] = [];
        for (const arrayValue of elementValueArray) {
          const sliceName = getValueSliceName(
            arrayValue,
            [slice],
            this.slicingContext.slicing.discriminator,
            slice.typeSchema,
            this.schema.url
          );
          if (sliceName === slice.name) {
            this.debug(`found exisitng value for slice ${sliceName}`, JSON.stringify(arrayValue));
            existingSliceValues.push(arrayValue);
          }
        }
        if (slice.min > 0 && existingSliceValues.length === 0) {
          // TODO - is it possible that emptySlice should be something besides an object, e.g. a string for a simple type
          // const emptySliceValue = Object.create(null);
          // emptySliceValue.__w = `onEnterSlice[${slice.name}] min > 0`;
          // parentValue.push(emptySliceValue);
          // sliceValues.push(emptySliceValue);
        }
        sliceTVs.push({ type: elementType, value: existingSliceValues });
      } else {
        sliceTVs.push({ type: 'undefined', value: undefined });
      }
    }

    this.valueStack.push({
      type: 'slice',
      path,
      typedValues: sliceTVs,
    });
    this.sliceContextStack.push({ slice });

    if (slice.typeSchema) {
      this.schemaStack.push(slice.typeSchema);
    }
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

    if (sliceCtx.slice.typeSchema) {
      this.schemaStack.pop();
    }

    this.debug('onExitSlice', sliceCtx.slice.name, JSON.stringify(sliceValueContext.typedValues));
    this.debug('parentValue', JSON.stringify(this.value.typedValues));
    for (let i = 0; i < this.value.typedValues.length; i++) {
      const elementTV = this.value.typedValues[i];
      const elementType = elementTV.type;
      const elementValue = elementTV.value;
      const sliceTVs = sliceValueContext.typedValues[i];
      if (isPopulated(sliceTVs.value)) {
        if (!Array.isArray(sliceTVs.value)) {
          throw new Error('Slice value should be an array');
        }
        this.debug(
          `attach slice to element\nelementType:\n${elementType}\nelementValue:\n${JSON.stringify(this.value.typedValues[i].value)}\nsliceValues:\n${JSON.stringify(sliceTVs)}`
        );
        if (elementValue === undefined) {
          this.value.typedValues[i] = sliceTVs;
        } else if (!Array.isArray(elementValue)) {
          throw new Error('Sliced element should have an array value');
        }

        this.value.typedValues[i].value.push(...sliceTVs.value);
        this.debug(`result:\n${JSON.stringify(this.value.typedValues[i].value)}`);
      }
    }
  }

  getDefaultValue(): Resource {
    return this.inputResource;
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
      // TODO loop through all possible codes
      const code = keyPartElem.type[0].code;
      keyPart = keyPart.replace('[x]', capitalize(code));
    }

    // final part of the key
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
    // const elementKey = keyParts.slice(0, i + 1).join('.');
    // debug(`creating empty value for ${elementKey}`);
    // last[keyPart] = elements[elementKey].isArray ? [Object.create(null)] : Object.create(null);
    // debug('setting last to', JSON.stringify(last[keyPart], undefined, 2));
  }

  return answer;
}

// export function applyDefaultValuesAtPath<T>(value: T, path: string, profileUrl: string, debug?: boolean): T {
// return value;
// }

function applyMinimum(
  input: TypedValue,
  key: string,
  element: InternalSchemaElement,
  elements: Record<string, InternalSchemaElement>,
  debugMode: boolean
): any {
  const inputType = input.type;
  const inputValue = input.value;
  const outputValue = inputValue;

  if (inputValue === undefined || inputValue === null) {
    throw new Error('inputValue cannot be undefined or null');
  }

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => applyMinimum({ type: inputType, value: iv }, key, element, elements, debugMode));
  }

  inputValue satisfies object;

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  if (element.min > 0) {
    const elementType = element.type[0].code;
    if (elementType.startsWith(elementType[0].toUpperCase())) {
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
            if (element.isArray) {
              // item[keyPart] = [Object.create(null)];
              item[keyPart] = [];
            } else {
              item[keyPart] = Object.create(null);
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
    }
  }
  return outputValue;
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

  // const outputValue = inputValue === undefined ? undefined : deepClone(inputValue);
  const outputValue = inputValue; // === undefined ? undefined : deepClone(inputValue);

  const debug: ConsoleDebug = debugMode ? console.debug : () => undefined;

  debug(
    `applyFixedPattern key: ${key} ${element.fixed ? 'fixed' : 'pattern'}: ${JSON.stringify((element.fixed ?? element.pattern)?.value)}`
  );
  debug(`begin`, JSON.stringify(inputValue, undefined, 2));

  // debugger;
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

/*
function modifyDefaultValueImpl(
  defaultValue: TypedValue,
  elements: ElementsContextType['elements'],
  debugMode: boolean
): any {
  const inputType = defaultValue.type;
  const inputValue: any = defaultValue.value;

  if (Array.isArray(inputValue)) {
    return inputValue.map((iv) => modifyDefaultValueImpl({ type: inputType, value: iv }, elements, debugMode));
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
*/

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


*/
type ConsoleDebug = typeof console.debug;

export function assignValuesIntoSlices(
  values: any[],
  slices: SliceDefinition[],
  slicing: SlicingRules,
  sliceSchema: InternalTypeSchema | undefined,
  profileUrl: string | undefined
): any[][] {
  if (!slicing || slicing.slices.length === 0) {
    return [values];
  }

  // store values in an array of arrays: one for each slice plus another for non-sliced values
  const slicedValues: any[][] = new Array(slices.length + 1);
  for (let i = 0; i < slicedValues.length; i++) {
    slicedValues[i] = [];
  }

  for (const value of values) {
    const sliceName = getValueSliceName(value, slices, slicing.discriminator, sliceSchema, profileUrl);

    // values not matched to a slice go in the last entry for non-slice
    const sliceIndex = sliceName ? slices.findIndex((slice) => slice.name === sliceName) : slices.length;
    slicedValues[sliceIndex].push(value);
  }

  // add placeholder empty values
  for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
    const slice = slices[sliceIndex];
    const sliceValues = slicedValues[sliceIndex];

    if (sliceValues.length < slice.min) {
      while (sliceValues.length < slice.min) {
        sliceValues.push(undefined);
      }
    } else if (sliceValues.length === 0) {
      sliceValues.push(undefined);
    }
  }

  return slicedValues;
}
