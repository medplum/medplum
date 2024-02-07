import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  tryGetProfile,
} from './typeschema/types';
import { isPopulated } from './utils';

function isSupportedSliceDefinition(slice: SliceDefinition): slice is SupportedSliceDefinition {
  return isPopulated(slice.type);
}

type SupportedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export type VisitorSliceDefinition = SupportedSliceDefinition;
export type VisitorSlicingRules = Omit<SlicingRules, 'slices'> & {
  slices: VisitorSliceDefinition[];
};

export interface SchemaVisitor {
  onEnterSchema?: (schema: InternalTypeSchema) => void;
  onExitSchema?: () => void;

  onEnterResource?: (schema: InternalTypeSchema) => void;
  onExitResource?: () => void;

  onEnterElement?: (path: string, element: InternalSchemaElement, elementsContext: ElementsContextType) => void;
  onExitElement?: (path: string, element: InternalSchemaElement, elementsContext: ElementsContextType) => void;

  onEnterSlice?: (path: string, slice: VisitorSliceDefinition, slicing: VisitorSlicingRules) => void;
  onExitSlice?: (path: string, slice: VisitorSliceDefinition, slicing: VisitorSlicingRules) => void;
}

export class SchemaCrawler {
  private readonly rootSchema: InternalTypeSchema & { type: string };
  private readonly visitor: SchemaVisitor;
  private readonly elementsContextStack: ElementsContextType[];

  private debugMode: boolean = false;
  private sliceAllowList: SliceDefinition[] | undefined;

  constructor(schema: InternalTypeSchema, visitor: SchemaVisitor, elements?: InternalTypeSchema['elements']) {
    if (schema.type === undefined) {
      throw new Error('schema must specify a type');
    }

    this.rootSchema = schema as InternalTypeSchema & { type: string };
    this.elementsContextStack = [
      buildElementsContext({
        parentContext: undefined,
        parentPath: this.rootSchema.type as string,
        elements: elements ?? this.rootSchema.elements,
        profileUrl: this.rootSchema.name === this.rootSchema.type ? undefined : this.rootSchema.url,
      }),
    ];
    this.visitor = visitor;
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[${this.rootSchema.name}]`, ...data);
    }
  }

  private get elementsContext(): ElementsContextType {
    return this.elementsContextStack[this.elementsContextStack.length - 1];
  }

  crawlElement(element: InternalSchemaElement, key: string, path: string): void {
    if (this.visitor.onEnterSchema) {
      this.visitor.onEnterSchema(this.rootSchema);
    }

    const allowedElements = Object.fromEntries(
      Object.entries(this.elementsContext.elements).filter(([elementKey]) => {
        return elementKey.startsWith(key);
      })
    );

    this.crawlElementsImpl(allowedElements, path);

    if (this.visitor.onExitSchema) {
      this.visitor.onExitSchema();
    }
  }

  crawlSlice(key: string, slice: SliceDefinition, slicing: SlicingRules): void {
    const visitorSlicing = this.prepareSlices(slicing.slices, slicing);

    if (!isPopulated(visitorSlicing.slices)) {
      throw new Error(`cannot crawl slice ${slice.name} since it has no type information`);
    }

    if (this.visitor.onEnterSchema) {
      this.visitor.onEnterSchema(this.rootSchema);
    }

    this.sliceAllowList = [slice];

    this.crawlSliceImpl(visitorSlicing.slices[0], slice.path, visitorSlicing);
    this.sliceAllowList = undefined;

    if (this.visitor.onExitSchema) {
      this.visitor.onExitSchema();
    }
  }

  crawlResource(debug?: boolean): void {
    if (this.visitor.onEnterSchema) {
      this.visitor.onEnterSchema(this.rootSchema);
    }

    this.debugMode = Boolean(debug);

    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.crawlElementsImpl(this.rootSchema.elements, this.rootSchema.type);

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
    if (this.visitor.onExitSchema) {
      this.visitor.onExitSchema();
    }
  }

  private crawlElementsImpl(elements: InternalTypeSchema['elements'], path: string): void {
    const elementTree = createElementTree(elements);
    for (const node of elementTree) {
      this.crawlElementNode(node, path);
    }
  }

  private crawlElementNode(node: ElementNode, path: string): void {
    const nodePath = path + '.' + node.key;
    if (this.visitor.onEnterElement) {
      this.visitor.onEnterElement(nodePath, node.element, this.elementsContext);
    }

    for (const child of node.children) {
      this.crawlElementNode(child, path);
    }

    if (isPopulated(node.element?.slicing?.slices)) {
      this.crawlSlicingImpl(node.element.slicing, nodePath);
    }

    if (this.visitor.onExitElement) {
      this.visitor.onExitElement(nodePath, node.element, this.elementsContext);
    }
  }

  private prepareSlices(slices: SliceDefinition[], slicing: SlicingRules): VisitorSlicingRules {
    const supportedSlices: SupportedSliceDefinition[] = [];
    for (const slice of slices) {
      if (!isSupportedSliceDefinition(slice)) {
        this.debug(`Ignoring slice ${slice.name} since it has no type information`);
        continue;
      }
      const profileUrl = slice.type.find((t) => isPopulated(t.profile))?.profile?.[0];
      if (isPopulated(profileUrl)) {
        const schema = tryGetProfile(profileUrl);
        if (schema) {
          slice.typeSchema = schema;
        } else {
          this.debug(`Schema for slice ${slice.name} and profile ${profileUrl} not found`);
        }
      }
      supportedSlices.push(slice);
    }

    const visitorSlicing = slicing as VisitorSlicingRules;
    visitorSlicing.slices = supportedSlices;

    return visitorSlicing;
  }

  private crawlSlicingImpl(slicing: SlicingRules, path: string): void {
    const visitorSlicing = this.prepareSlices(slicing.slices, slicing);

    for (const slice of visitorSlicing.slices) {
      if (isPopulated(this.sliceAllowList)) {
        if (this.sliceAllowList.includes(slice)) {
          this.crawlSliceImpl(slice, path, visitorSlicing);
        }
      } else {
        this.crawlSliceImpl(slice, path, visitorSlicing);
      }
    }
  }

  private crawlSliceImpl(slice: VisitorSliceDefinition, path: string, slicing: VisitorSlicingRules): void {
    if (this.visitor.onEnterSlice) {
      this.visitor.onEnterSlice(path, slice, slicing);
    }

    const sliceSchema = slice.typeSchema;
    if (sliceSchema) {
      if (this.visitor.onEnterSchema) {
        this.visitor.onEnterSchema(sliceSchema);
      }
    }

    const sliceElements = sliceSchema?.elements ?? slice.elements;
    let elementsContext: ElementsContextType | undefined;
    if (isPopulated(sliceElements)) {
      elementsContext = buildElementsContext({
        parentContext: this.elementsContext,
        elements: sliceElements,
        parentPath: path,
      });
      this.elementsContextStack.push(elementsContext);
    }
    this.crawlElementsImpl(sliceElements, path);

    if (elementsContext) {
      this.elementsContextStack.pop();
    }

    if (sliceSchema) {
      if (this.visitor.onExitSchema) {
        this.visitor.onExitSchema();
      }
    }

    if (this.visitor.onExitSlice) {
      this.visitor.onExitSlice(path, slice, slicing);
    }
  }
}

export type ElementsContextType = {
  elements: Record<string, InternalSchemaElement>;
  elementsByPath: Record<string, InternalSchemaElement>;
  profileUrl: string | undefined;
};

function buildElementsContext({
  parentContext,
  elements,
  parentPath,
  profileUrl,
  debugMode,
}: {
  elements: InternalTypeSchema['elements'] | undefined;
  parentPath: string;
  parentContext: ElementsContextType | undefined;
  profileUrl?: string;
  debugMode?: boolean;
}): ElementsContextType {
  const mergedElements: ElementsContextType['elements'] = mergeElementsForContext(
    parentPath,
    elements,
    parentContext,
    Boolean(debugMode)
  );

  const elementsByPath: ElementsContextType['elementsByPath'] = Object.create(null);

  for (const [key, property] of Object.entries(mergedElements)) {
    elementsByPath[parentPath + '.' + key] = property;
  }

  return {
    profileUrl: profileUrl ?? parentContext?.profileUrl,
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

type ElementNode = {
  key: string;
  element: InternalSchemaElement;
  children: ElementNode[];
};

/**
 * Creates a tree of InternalSchemaElements nested by their key hierarchy:
 *
 * @param elements -
 * @returns The list of root nodes of the tree
 */
function createElementTree(elements: Record<string, InternalSchemaElement>): ElementNode[] {
  const rootNodes: ElementNode[] = [];

  function isChildKey(parentKey: string, childKey: string): boolean {
    return childKey.startsWith(parentKey + '.');
  }

  function addNode(currentNode: ElementNode, newNode: ElementNode): void {
    for (const child of currentNode.children) {
      // If the new node is a child of an existing child, recurse deeper
      if (isChildKey(child.key, newNode.key)) {
        addNode(child, newNode);
        return;
      }
    }
    // Otherwise, add it here
    currentNode.children.push(newNode);
  }

  const elementEntries = Object.entries(elements);
  /*
   By sorting beforehand, we guarantee that no false root nodes are created.
   e.g. if 'a.b' were to be added to the tree before 'a', 'a.b' would be made a
   root node when it should be a child of 'a'.
  */
  elementEntries.sort();

  for (const [key, element] of elementEntries) {
    const newNode: ElementNode = { key, element, children: [] };

    let added = false;
    for (const rootNode of rootNodes) {
      if (isChildKey(rootNode.key, key)) {
        addNode(rootNode, newNode);
        added = true;
        break;
      }
    }

    // If the string is not a child of any existing node, add it as a new root
    if (!added) {
      rootNodes.push(newNode);
    }
  }

  return rootNodes;
}
