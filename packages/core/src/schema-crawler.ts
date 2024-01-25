/* eslint-disable no-debugger */
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  tryGetProfile,
} from './typeschema/types';
import { isPopulated } from './utils';

function isSupportedSliceDefinition(slice: SliceDefinition): slice is SupportedSliceDefinition {
  return slice.type !== undefined && slice.type.length > 0;
}

type SupportedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export type VisitorSliceDefinition = SupportedSliceDefinition;
export type VisitorSlicingRules = Omit<SlicingRules, 'slices'> & {
  slices: VisitorSliceDefinition[];
  // slices: SupportedSliceDefinition[];
};

export interface SchemaVisitor {
  onEnterResource?: (schema: InternalTypeSchema) => void;
  onExitResource?: () => void;

  // visitElement: (path: string, element: InternalSchemaElement) => void;
  onEnterElement?: (path: string, element: InternalSchemaElement, elementsContext: ElementsContextType) => void;
  onExitElement?: () => void;

  onEnterSlicing?: (path: string, slicing: VisitorSlicingRules) => void;
  onExitSlicing?: () => void;

  onEnterSlice?: (path: string, slice: VisitorSliceDefinition) => void;
  onExitSlice?: () => void;
}

export class SchemaCrawler {
  private readonly rootSchema: InternalTypeSchema;
  private readonly visitor: SchemaVisitor;
  private readonly rootPath: string;
  private readonly elementsContextStack: ElementsContextType[];

  private schema: InternalTypeSchema;
  private debugMode: boolean = false;
  private sliceAllowList: SliceDefinition[] | undefined;

  constructor(schema: InternalTypeSchema, visitor: SchemaVisitor) {
    this.rootSchema = schema;
    this.elementsContextStack = [
      buildElementsContext({
        parentContext: undefined,
        parentPath: this.rootSchema.type as string,
        elements: this.rootSchema.elements,
        parentType: this.rootSchema.type,
        profileUrl: this.rootSchema.name === this.rootSchema.type ? undefined : this.rootSchema.url,
      }),
    ];
    this.schema = schema;
    this.visitor = visitor;
    this.rootPath = schema.type as string;
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[${this.schema.name}]`, ...data);
    }
  }

  private get elementsContext(): ElementsContextType {
    return this.elementsContextStack[this.elementsContextStack.length - 1];
  }

  crawlElement(element: InternalSchemaElement, key: string): void {
    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.crawlElementImpl(element, this.rootPath + '.' + key);

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  crawlSlice(element: InternalSchemaElement, key: string, slice: SliceDefinition): void {
    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.sliceAllowList = [slice];
    this.crawlElementImpl(element, this.rootPath + '.' + key);
    this.sliceAllowList = undefined;

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  crawlSchema(debug?: boolean): void {
    this.debugMode = Boolean(debug);

    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.crawlElementsImpl(this.rootSchema.elements, this.rootPath);

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  private crawlElementsImpl(elements: InternalTypeSchema['elements'], path: string): void {
    for (const [key, element] of Object.entries(elements)) {
      const elementPath = path + '.' + key;
      this.crawlElementImpl(element, elementPath);
    }
  }

  private crawlElementImpl(element: InternalSchemaElement, path: string): void {
    // TODO - is a schema ever going to be found here?
    const profileUrl = element.type.find((t) => isPopulated(t.profile))?.profile?.[0];
    const profile = isPopulated(profileUrl) ? tryGetProfile(profileUrl) : undefined;
    if (profile) {
      console.assert('UNEXPECTE profile found...');
      debugger;
      this.schema = profile;
    }

    if (this.visitor.onEnterElement) {
      this.visitor.onEnterElement(path, element, this.elementsContext);
    }

    // this.visitor.visitElement(path, element);

    if (isPopulated(element?.slicing?.slices)) {
      this.crawlSlicingImpl(element.slicing, path);
    }

    if (this.visitor.onExitElement) {
      this.visitor.onExitElement();
    }
  }

  private crawlSlicingImpl(slicing: SlicingRules, path: string): void {
    const slices = slicing.slices;
    // if (this.sliceAllowList) {
    // slices = slices.filter((s) => this.sliceAllowList?.includes(s));
    // }
    const supportedSlices: SupportedSliceDefinition[] = [];
    for (const slice of slices) {
      if (isSupportedSliceDefinition(slice)) {
        const profileUrl = slice.type?.find((t) => isPopulated(t.profile))?.profile?.[0];
        if (isPopulated(profileUrl)) {
          const schema = isPopulated(profileUrl) ? tryGetProfile(profileUrl) : undefined;
          if (profileUrl && !schema) {
            this.debug('SLICE PROFILE SCHEMA NOT FOUND', profileUrl);
          }
          slice.typeSchema = schema;
        }
        supportedSlices.push(slice);
      }
    }

    // TODO - should also crawl unsupported slices for completeness

    const visitorSlicing = slicing as VisitorSlicingRules;
    visitorSlicing.slices = supportedSlices;

    if (this.visitor.onEnterSlicing) {
      this.visitor.onEnterSlicing(path, visitorSlicing);
    }

    for (const slice of visitorSlicing.slices) {
      if (this.sliceAllowList !== undefined) {
        if (this.sliceAllowList.includes(slice)) {
          this.crawlSliceImpl(slice, path);
        }
      } else {
        this.crawlSliceImpl(slice, path);
      }
    }

    if (this.visitor.onExitSlicing) {
      this.visitor.onExitSlicing();
    }
  }

  private crawlSliceImpl(slice: VisitorSliceDefinition, path: string): void {
    if (this.visitor.onEnterSlice) {
      this.visitor.onEnterSlice(path, slice);
    }

    const sliceType = slice.typeSchema?.type ?? slice.type[0].code;
    const sliceElements = slice.typeSchema?.elements ?? slice.elements;
    let elementsContext: ElementsContextType | undefined;
    if (isPopulated(sliceElements)) {
      elementsContext = buildElementsContext({
        parentContext: this.elementsContext,
        elements: sliceElements,
        parentPath: path,
        parentType: sliceType,
      });
      this.elementsContextStack.push(elementsContext);
    }
    this.crawlElementsImpl(sliceElements, path);

    if (elementsContext) {
      this.elementsContextStack.pop();
    }

    if (this.visitor.onExitSlice) {
      this.visitor.onExitSlice();
    }
  }
}

export type ElementsContextType = {
  elements: Record<string, InternalSchemaElement>;
  elementsByPath: Record<string, InternalSchemaElement>;
  profileUrl: string | undefined;
  debugMode: boolean;
};

function buildElementsContext({
  parentContext,
  elements,
  parentPath,
  parentType,
  profileUrl,
  debugMode,
}: {
  elements: InternalTypeSchema['elements'] | undefined;
  parentPath: string;
  parentContext: ElementsContextType | undefined;
  parentType: string | undefined;
  profileUrl?: string;
  debugMode?: boolean;
}): ElementsContextType {
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

  /*
  function getElementByPath(path: string): InternalSchemaElement | undefined {
    return elementsByPath[path];
  }

  function getModifiedNestedElement(nestedElementPath: string): InternalSchemaElement | undefined {
    return nestedPaths[nestedElementPath];
  }
  */

  return {
    debugMode: debugMode ?? false,
    profileUrl: profileUrl ?? parentContext?.profileUrl,
    //getModifiedNestedElement,
    //getElementByPath,
    elements: mergedElements,
    elementsByPath,
  };
}

function mergeElementsForContext(
  parentPath: string,
  elements: Record<string, InternalSchemaElement> | undefined,
  parentContext: ElementsContextType | undefined,
  debugMode: boolean
): Record<string, InternalSchemaElement> {
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
