import { ElementsContextType, buildElementsContext } from './elements-context';
import { SliceDefinitionWithTypes, isSliceDefinitionWithTypes } from './typeschema/slices';
import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  tryGetProfile,
} from './typeschema/types';
import { isPopulated } from './utils';

export type VisitorSlicingRules = Omit<SlicingRules, 'slices'> & {
  slices: SliceDefinitionWithTypes[];
};

export interface SchemaVisitor {
  /**
   * Called when entering a schema. This is called once for the root profile and once for each
   * extension with a profile associated with it.
   * @param schema - The schema being entered.
   */
  onEnterSchema?: (schema: InternalTypeSchema) => void;
  /**
   * Called when exiting a schema. See `onEnterSchema` for more information.
   * @param schema - The schema being exited.
   */
  onExitSchema?: (schema: InternalTypeSchema) => void;

  /**
   * Called when entering an element. This is called for every element in the schema in a
   * tree-like fashion. If the element has slices, the slices are crawled after `onEnterElement`
   * but before `onExitElement`.
   *
   * @example
   * Example of tree-like method invocation ordering:
   * '''typescript
   * onEnterElement('Patient.name')
   * onEnterElement('Patient.name.given')
   * onExitElement('Patient.name.given')
   * onEnterElement('Patient.name.family')
   * onExitElement('Patient.name.family')
   * onExitElement('Patient.name')
   * '''
   *
   *
   * @param path - The full path of the element being entered, even if within an extension. e.g The
   * path of the ombCategory extension within the US Core Race extension will be
   * 'Patient.extension.extension.value[x]' rather than 'Extension.extension.value[x]'. The latter is
   * accessible on the element parameter.
   * @param element - The element being entered.
   * @param elementsContext - The context of the elements currently being crawled.
   */
  onEnterElement?: (path: string, element: InternalSchemaElement, elementsContext: ElementsContextType) => void;

  /**
   * Called when exiting an element. See `onEnterElement` for more information.
   * @param path - The full path of the element being exited.
   * @param element - The element being exited.
   * @param elementsContext - The context of the elements currently being crawled.
   */
  onExitElement?: (path: string, element: InternalSchemaElement, elementsContext: ElementsContextType) => void;

  /**
   * Called when entering a slice. Called for every slice in a given sliced element. `onEnterElement` and `onExitElement`
   * will be called in a tree-like fashion for elements within the slice followed by `onExitSlice`.
   *
   * @example
   * Example of a sliced element being crawled with some elements excluded for brevity:
   * '''typescript
   * onEnterElement  ('Observation.component')
   *
   * // systolic
   * onEnterSlice    ('Observation.component', systolicSlice, slicingRules)
   * onEnterElement  ('Observation.component.code')
   * onExitElement   ('Observation.component.code')
   * onEnterElement  ('Observation.component.value[x]')
   * onEnterElement  ('Observation.component.value[x].code')
   * onExitElement   ('Observation.component.value[x].code')
   * onEnterElement  ('Observation.component.value[x].system')
   * onExitElement   ('Observation.component.value[x].system')
   * onExitElement   ('Observation.component.value[x]')
   * onExitSlice     ('Observation.component', systolicSlice, slicingRules)
   *
   * // similar set of invocations for diastolic slice
   *
   * onExitElement  ('Observation.component')
   * '''
   *
   * @param path - The full path of the sliced element being entered. See `onEnterElement` for more information.
   * @param slice - The slice being entered.
   * @param slicing - The slicing rules related to the slice being entered.
   */
  onEnterSlice?: (path: string, slice: SliceDefinitionWithTypes, slicing: VisitorSlicingRules) => void;

  /**
   * Called when exiting a slice. See `onEnterSlice` for more information.
   * @param path - The full path of the sliced element being exited. See `onEnterElement` for more information.
   * @param slice - The slice being exited.
   * @param slicing - The slicing rules related to the slice.
   */
  onExitSlice?: (path: string, slice: SliceDefinitionWithTypes, slicing: VisitorSlicingRules) => void;
}

export class SchemaCrawler {
  private readonly rootSchema: InternalTypeSchema & { type: string };
  private readonly visitor: SchemaVisitor;
  private readonly elementsContextStack: ElementsContextType[];
  private sliceAllowList: SliceDefinition[] | undefined;

  constructor(schema: InternalTypeSchema, visitor: SchemaVisitor, elements?: InternalTypeSchema['elements']) {
    if (schema.type === undefined) {
      throw new Error('schema must include a type');
    }
    this.rootSchema = schema as InternalTypeSchema & { type: string };

    const rootContext = buildElementsContext({
      parentContext: undefined,
      path: this.rootSchema.type,
      elements: elements ?? this.rootSchema.elements,
      profileUrl: this.rootSchema.name === this.rootSchema.type ? undefined : this.rootSchema.url,
    });
    if (rootContext === undefined) {
      throw new Error('Could not create root elements context');
    }

    this.elementsContextStack = [rootContext];
    this.visitor = visitor;
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
      this.visitor.onExitSchema(this.rootSchema);
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
      this.visitor.onExitSchema(this.rootSchema);
    }
  }

  crawlResource(): void {
    if (this.visitor.onEnterSchema) {
      this.visitor.onEnterSchema(this.rootSchema);
    }

    this.crawlElementsImpl(this.rootSchema.elements, this.rootSchema.type);

    if (this.visitor.onExitSchema) {
      this.visitor.onExitSchema(this.rootSchema);
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
    const slicesToVisit: SliceDefinitionWithTypes[] = [];
    for (const slice of slices) {
      if (!isSliceDefinitionWithTypes(slice)) {
        continue;
      }
      const profileUrl = slice.type.find((t) => isPopulated(t.profile))?.profile?.[0];
      if (isPopulated(profileUrl)) {
        const schema = tryGetProfile(profileUrl);
        if (schema) {
          slice.typeSchema = schema;
        }
      }
      slicesToVisit.push(slice);
    }

    const visitorSlicing = { ...slicing, slices: slicesToVisit } as VisitorSlicingRules;
    return visitorSlicing;
  }

  private crawlSlicingImpl(slicing: SlicingRules, path: string): void {
    const visitorSlicing = this.prepareSlices(slicing.slices, slicing);

    for (const slice of visitorSlicing.slices) {
      if (this.sliceAllowList === undefined || this.sliceAllowList.includes(slice)) {
        this.crawlSliceImpl(slice, path, visitorSlicing);
      }
    }
  }

  private crawlSliceImpl(slice: SliceDefinitionWithTypes, path: string, slicing: VisitorSlicingRules): void {
    const sliceSchema = slice.typeSchema;
    if (sliceSchema) {
      if (this.visitor.onEnterSchema) {
        this.visitor.onEnterSchema(sliceSchema);
      }
    }

    if (this.visitor.onEnterSlice) {
      this.visitor.onEnterSlice(path, slice, slicing);
    }

    let elementsContext: ElementsContextType | undefined;

    const sliceElements = sliceSchema?.elements ?? slice.elements;
    if (isPopulated(sliceElements)) {
      elementsContext = buildElementsContext({
        path,
        parentContext: this.elementsContext,
        elements: sliceElements,
      });
    }
    if (elementsContext) {
      this.elementsContextStack.push(elementsContext);
    }

    this.crawlElementsImpl(sliceElements, path);

    if (elementsContext) {
      this.elementsContextStack.pop();
    }

    if (this.visitor.onExitSlice) {
      this.visitor.onExitSlice(path, slice, slicing);
    }

    if (sliceSchema) {
      if (this.visitor.onExitSchema) {
        this.visitor.onExitSchema(sliceSchema);
      }
    }
  }
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
  elementEntries.sort((a, b) => a[0].localeCompare(b[0]));

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
