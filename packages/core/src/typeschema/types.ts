import {
  Bundle,
  Coding,
  ElementDefinition,
  ElementDefinitionBinding,
  Resource,
  ResourceType,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { inflateBaseSchema } from '../base-schema';
import baseSchema from '../base-schema.json';
import { getTypedPropertyValue } from '../fhirpath/utils';
import { OperationOutcomeError, serverError } from '../outcomes';
import { getElementDefinitionTypeName, isResourceTypeSchema, TypedValue } from '../types';
import { capitalize, isEmpty } from '../utils';

/**
 * Internal representation of a non-primitive FHIR type, suitable for use in resource validation
 */
export interface InternalTypeSchema {
  name: string;
  url?: string;
  kind?: string;
  description?: string;
  elements: Record<string, InternalSchemaElement>;
  constraints?: Constraint[];
  parentType?: InternalTypeSchema;
  innerTypes: InternalTypeSchema[];
  summaryProperties?: Set<string>;
  mandatoryProperties?: Set<string>;
}

export interface InternalSchemaElement {
  description: string;
  path: string;
  min: number;
  max: number;
  isArray?: boolean;
  constraints?: Constraint[];
  type: ElementType[];
  slicing?: SlicingRules;
  fixed?: TypedValue;
  pattern?: TypedValue;
  binding?: ElementDefinitionBinding;
}

export interface ElementType {
  code: string;
  targetProfile?: string[];
}

export interface Constraint {
  key: string;
  severity: 'error' | 'warning';
  expression: string;
  description: string;
}

export interface SlicingRules {
  discriminator: SliceDiscriminator[];
  ordered: boolean;
  rule?: 'open' | 'closed' | 'openAtEnd';
  slices: SliceDefinition[];
}

export interface SliceDefinition {
  name: string;
  type?: ElementType[];
  elements: Record<string, InternalSchemaElement>;
  min: number;
  max: number;
}

export interface SliceDiscriminator {
  path: string;
  type: string;
}

/**
 * Parses a StructureDefinition resource into an internal schema better suited for
 * programmatic validation and usage in internal systems
 * @param sd - The StructureDefinition resource to parse
 * @returns The parsed schema for the given resource type
 * @experimental
 */
export function parseStructureDefinition(sd: StructureDefinition): InternalTypeSchema {
  return new StructureDefinitionParser(sd).parse();
}

const DATA_TYPES: Record<string, InternalTypeSchema> = inflateBaseSchema(baseSchema);

export function indexStructureDefinitionBundle(bundle: StructureDefinition[] | Bundle): void {
  const sds = Array.isArray(bundle) ? bundle : bundle.entry?.map((e) => e.resource as StructureDefinition) ?? [];
  for (const sd of sds) {
    loadDataType(sd);
  }
}

export function loadDataType(sd: StructureDefinition): void {
  if (!sd?.name) {
    throw new Error(`Failed loading StructureDefinition from bundle`);
  }
  if (sd.resourceType !== 'StructureDefinition') {
    return;
  }
  const schema = parseStructureDefinition(sd);
  DATA_TYPES[sd.name] = schema;
  for (const inner of schema.innerTypes) {
    inner.parentType = schema;
    DATA_TYPES[inner.name] = inner;
  }
}

export function getAllDataTypes(): Record<string, InternalTypeSchema> {
  return DATA_TYPES;
}

export function isDataTypeLoaded(type: string): boolean {
  return !!DATA_TYPES[type];
}

export function tryGetDataType(type: string): InternalTypeSchema | undefined {
  return DATA_TYPES[type];
}

export function getDataType(type: string): InternalTypeSchema {
  const schema = DATA_TYPES[type];
  if (!schema) {
    throw new OperationOutcomeError(serverError(Error('Unknown data type: ' + type)));
  }
  return schema;
}

/**
 * Returns true if the given string is a valid FHIR resource type.
 *
 * ```ts
 * isResourceType('Patient'); // true
 * isResourceType('XYZ'); // false
 * ```
 *
 * @param resourceType - The candidate resource type string.
 * @returns True if the resource type is a valid FHIR resource type.
 */
export function isResourceType(resourceType: string): boolean {
  const typeSchema = DATA_TYPES[resourceType];
  return typeSchema && isResourceTypeSchema(typeSchema);
}

interface BackboneContext {
  type: InternalTypeSchema;
  path: string;
  parent?: BackboneContext;
}

/**
 * @experimental
 */
class StructureDefinitionParser {
  private readonly root: ElementDefinition;
  private readonly elements: ElementDefinition[];
  private readonly elementIndex: Record<string, ElementDefinition>;
  private index: number;
  private readonly resourceSchema: InternalTypeSchema;
  private slicingContext: { field: SlicingRules; current?: SliceDefinition; path: string } | undefined;
  private innerTypes: InternalTypeSchema[];
  private backboneContext: BackboneContext | undefined;

  /**
   * @param sd - The StructureDefinition to parse
   * @throws Throws when the StructureDefinition does not have a populated `snapshot` field
   */
  constructor(sd: StructureDefinition) {
    if (!sd.snapshot?.element || sd.snapshot.element.length === 0) {
      throw new Error(`No snapshot defined for StructureDefinition '${sd.name}'`);
    }

    this.root = sd.snapshot.element[0];
    this.elements = sd.snapshot.element.slice(1);
    this.elementIndex = Object.create(null);
    this.index = 0;
    this.resourceSchema = {
      name: sd.name as ResourceType,
      url: sd.url as string,
      kind: sd.kind,
      description: sd.description,
      elements: {},
      constraints: this.parseElementDefinition(this.root).constraints,
      innerTypes: [],
      summaryProperties: new Set(),
      mandatoryProperties: new Set(),
    };
    this.innerTypes = [];
  }

  parse(): InternalTypeSchema {
    let element = this.next();
    while (element) {
      if (element.sliceName) {
        // Start of slice: this ElementDefinition defines the top-level element of a slice value
        this.parseSliceStart(element);
      } else if (element.id?.includes(':')) {
        // Slice element, part of some slice definition
        if (this.slicingContext?.current) {
          const path = elementPath(element, this.slicingContext.path);
          this.slicingContext.current.elements[path] = this.parseElementDefinition(element);
        }
      } else {
        // Normal field definition
        const field = this.parseElementDefinition(element);
        this.checkFieldEnter(element, field);

        // Record field in schema
        let parentContext: BackboneContext | undefined = this.backboneContext;
        while (parentContext) {
          if (element.path?.startsWith(parentContext.path + '.')) {
            parentContext.type.elements[elementPath(element, parentContext.path)] = field;
            break;
          }
          parentContext = parentContext.parent;
        }

        if (!parentContext) {
          // Within R4 StructureDefinitions, there are 2 cases where StructureDefinition.name !== ElementDefinition.path.
          // For SimpleQuantity and MoneyQuantity, the names are the names, but the root ElementDefinition.path is Quantity.
          // We need to use StructureDefinition.name for the type name, and ElementDefinition.path for the path.
          const path = elementPath(element, this.root.path);
          if (element.isSummary) {
            this.resourceSchema.summaryProperties?.add(path.replace('[x]', ''));
          }
          if (field.min > 0) {
            this.resourceSchema.mandatoryProperties?.add(path.replace('[x]', ''));
          }
          this.resourceSchema.elements[path] = field;
        }

        // Clean up contextual book-keeping
        this.checkFieldExit(element);
      }

      element = this.next();
    }

    // Wrap up if the StructureDefinition ends on a slice or backbone element
    this.checkFieldExit();
    if (this.innerTypes.length > 0) {
      this.resourceSchema.innerTypes = this.innerTypes;
    }

    return this.resourceSchema;
  }

  private checkFieldEnter(element: ElementDefinition, field: InternalSchemaElement): void {
    if (this.isInnerType(element)) {
      this.enterInnerType(element);
    }
    if (element.slicing && !this.slicingContext) {
      this.enterSlice(element, field);
    }
  }

  private enterInnerType(element: ElementDefinition): void {
    while (this.backboneContext && !pathsCompatible(this.backboneContext?.path, element.path)) {
      // Starting new inner type, unwind type stack to this property's parent
      this.innerTypes.push(this.backboneContext.type);
      this.backboneContext = this.backboneContext.parent;
    }
    this.backboneContext = {
      type: {
        name: getElementDefinitionTypeName(element),
        description: element.definition,
        elements: {},
        constraints: this.parseElementDefinition(element).constraints,
        innerTypes: [],
      },
      path: element.path ?? '',
      parent: pathsCompatible(this.backboneContext?.path, element.path)
        ? this.backboneContext
        : this.backboneContext?.parent,
    };
  }

  private enterSlice(element: ElementDefinition, field: InternalSchemaElement): void {
    if (hasDefaultExtensionSlice(element) && !this.peek()?.sliceName) {
      // Extensions are always sliced by URL; don't start slicing context if no slices follow
      return;
    }
    field.slicing = {
      discriminator: (element.slicing?.discriminator ?? []).map((d) => {
        if (d.type !== 'value' && d.type !== 'pattern' && d.type !== 'type') {
          throw new Error(`Unsupported slicing discriminator type: ${d.type}`);
        }
        return {
          path: d.path as string,
          type: d.type as string,
        };
      }),
      slices: [],
      ordered: element.slicing?.ordered ?? false,
      rule: element.slicing?.rules,
    };
    this.slicingContext = { field: field.slicing, path: element.path ?? '' };
  }

  private checkFieldExit(element: ElementDefinition | undefined = undefined): void {
    if (this.backboneContext && !pathsCompatible(this.backboneContext.path, element?.path)) {
      // Leaving BackboneElement child fields
      if (this.backboneContext.parent) {
        do {
          this.innerTypes.push(this.backboneContext.type);
          this.backboneContext = this.backboneContext.parent;
        } while (this.backboneContext && !pathsCompatible(this.backboneContext.path, element?.path));
      } else {
        this.innerTypes.push(this.backboneContext.type);
        delete this.backboneContext;
      }
    }
    if (this.slicingContext && !pathsCompatible(this.slicingContext.path, element?.path as string)) {
      // Path must be compatible with the sliced field path (i.e. have it as a prefix) to be a part of the
      // same slice group; otherwise, that group is finished and this is the start of a new field
      if (this.slicingContext?.current) {
        this.slicingContext.field.slices.push(this.slicingContext.current);
      }
      delete this.slicingContext;
    }
  }

  private next(): ElementDefinition | undefined {
    const element = this.peek();
    if (element) {
      this.index++;
      return element;
    }
    return undefined;
  }

  private peek(): ElementDefinition | undefined {
    const element = this.elements[this.index];
    if (element) {
      this.elementIndex[element.path ?? ''] = element;
      if (element.contentReference) {
        const ref = this.elementIndex[element.contentReference.slice(element.contentReference.indexOf('#') + 1)];
        if (!ref) {
          return undefined;
        }
        return {
          ...ref,
          id: element.id,
          path: element.path,
          min: element.min ?? ref.min,
          max: element.max ?? ref.max,
          contentReference: element.contentReference,
          definition: element.definition,
        };
      }
      return element;
    }
    return undefined;
  }

  private isInnerType(current: ElementDefinition): boolean {
    const next = this.peek();
    return !!(
      pathsCompatible(current?.path, next?.path) &&
      current.type?.some((t) => ['BackboneElement', 'Element'].includes(t.code as string))
    );
  }

  private parseSliceStart(element: ElementDefinition): void {
    if (!this.slicingContext) {
      throw new Error('Invalid slice start before discriminator: ' + element.sliceName);
    }
    if (this.slicingContext.current) {
      this.slicingContext.field.slices.push(this.slicingContext.current);
    }
    this.slicingContext.current = {
      name: element.sliceName ?? '',
      type: element.type?.map((t) => ({ code: t.code ?? '', targetProfile: t.targetProfile })),
      elements: {},
      min: element.min ?? 0,
      max: element.max === '*' ? Number.POSITIVE_INFINITY : Number.parseInt(element.max as string, 10),
    };
  }

  private parseElementDefinition(ed: ElementDefinition): InternalSchemaElement {
    const max = parseCardinality(ed.max as string);
    const baseMax = ed.base?.max ? parseCardinality(ed.base.max) : max;
    const typedElementDef = { type: 'ElementDefinition', value: ed };
    return {
      description: ed.definition || '',
      path: ed.path || ed.base?.path || '',
      min: ed.min ?? 0,
      max: max,
      isArray: baseMax > 1,
      constraints: (ed.constraint ?? []).map((c) => ({
        key: c.key ?? '',
        severity: c.severity ?? 'error',
        expression: c.expression ?? '',
        description: c.human ?? '',
      })),
      type: (ed.type ?? []).map((t) => ({
        code: ['BackboneElement', 'Element'].includes(t.code as string)
          ? getElementDefinitionTypeName(ed)
          : t.code ?? '',
        targetProfile: t.targetProfile,
      })),
      fixed: firstValue(getTypedPropertyValue(typedElementDef, 'fixed')),
      pattern: firstValue(getTypedPropertyValue(typedElementDef, 'pattern')),
      binding: ed.binding,
    };
  }
}

/**
 * Construct the subset of a resource containing a minimum set of fields.  The returned resource is not guaranteed
 * to contain only the provided properties, and may contain others (e.g. `resourceType` and `id`)
 *
 * @param resource - The resource to subset
 * @param properties - The minimum properties to include in the subset
 * @returns The modified resource, containing the listed properties and possibly other mandatory ones
 */
export function subsetResource<T extends Resource>(resource: T | undefined, properties: string[]): T | undefined {
  if (!resource) {
    return undefined;
  }
  const extraProperties = [];
  for (const property of properties) {
    extraProperties.push('_' + property);
    const choiceTypeField = DATA_TYPES[resource.resourceType].elements[property + '[x]'];
    if (choiceTypeField) {
      extraProperties.push(...choiceTypeField.type.map((t) => property + capitalize(t.code)));
    }
  }
  for (const property of Object.getOwnPropertyNames(resource)) {
    if (
      !properties.includes(property) &&
      !extraProperties.includes(property) &&
      !mandatorySubsetProperties.includes(property)
    ) {
      Object.defineProperty(resource, property, {
        enumerable: false,
        writable: false,
        value: undefined,
      });
    }
  }
  resource.meta = { ...resource.meta, tag: resource.meta?.tag ? resource.meta.tag.concat(subsetTag) : [subsetTag] };
  return resource;
}
const subsetTag: Coding = {
  system: 'http://hl7.org/fhir/v3/ObservationValue',
  code: 'SUBSETTED',
};
const mandatorySubsetProperties = ['resourceType', 'id', 'meta'];

function parseCardinality(c: string): number {
  return c === '*' ? Number.POSITIVE_INFINITY : Number.parseInt(c, 10);
}

function elementPath(element: ElementDefinition, prefix = ''): string {
  return trimPrefix(element.path, prefix);
}

function trimPrefix(str: string | undefined, prefix: string): string {
  if (!str) {
    return '';
  }
  if (prefix && str.startsWith(prefix)) {
    return str.substring(prefix.length + 1);
  }
  return str;
}

/**
 * Tests whether two element paths are compatible, i.e. whether the child path is nested under the parent.
 * @param parent - The expected parent path, which should be a prefix of the child path.
 * @param child - The child path to test for compatibility with the parent path.
 * @returns True if the given path is a child of the parent.
 */
function pathsCompatible(parent: string | undefined, child: string | undefined): boolean {
  if (!parent || !child) {
    return false;
  }
  return child.startsWith(parent + '.') || child === parent;
}

function firstValue(obj: TypedValue | TypedValue[] | undefined): TypedValue | undefined {
  if (Array.isArray(obj) && obj.length > 0) {
    return obj[0];
  } else if (!isEmpty(obj)) {
    return obj as TypedValue;
  } else {
    return undefined;
  }
}

function hasDefaultExtensionSlice(element: ElementDefinition): boolean {
  const discriminators = element.slicing?.discriminator;
  return Boolean(
    element.type?.some((t) => t.code === 'Extension') &&
      discriminators?.length === 1 &&
      discriminators[0].type === 'value' &&
      discriminators[0].path === 'url'
  );
}
