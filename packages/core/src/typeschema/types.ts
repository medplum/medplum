import { Bundle, ElementDefinition, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { getTypedPropertyValue } from '../fhirpath';
import { OperationOutcomeError, serverError } from '../outcomes';
import { TypedValue } from '../types';
import { capitalize, isEmpty } from '../utils';

/**
 * Internal representation of a non-primitive FHIR type, suitable for use in resource validation
 */
export interface InternalTypeSchema {
  name: string;
  fields: Record<string, ElementValidator>;
  constraints: Constraint[];
  innerTypes: InternalTypeSchema[];
}

export interface ElementValidator {
  min: number;
  max: number;
  isArray: boolean;
  constraints: Constraint[];
  type: ElementType[];
  slicing?: SlicingRules;
  fixed?: TypedValue;
  pattern?: TypedValue;
  binding?: string;
}

export interface ElementType {
  code: string;
  targetProfile: string[];
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
  fields: Record<string, ElementValidator>;
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
 * @param sd The StructureDefinition resource to parse
 * @returns The parsed schema for the given resource type
 * @experimental
 */
export function parseStructureDefinition(sd: StructureDefinition): InternalTypeSchema {
  return new StructureDefinitionParser(sd).parse();
}

const DATA_TYPES: Record<string, InternalTypeSchema> = Object.create(null);

export function loadDataTypes(bundle: Bundle<StructureDefinition>): void {
  for (const { resource: sd } of bundle.entry ?? []) {
    if (!sd?.name) {
      throw new Error(`Failed loading StructureDefinition from bundle`);
    }
    if (sd.resourceType !== 'StructureDefinition') {
      continue;
    }
    const schema = parseStructureDefinition(sd);
    DATA_TYPES[sd.name] = schema;
    for (const inner of schema.innerTypes) {
      DATA_TYPES[inner.name] = inner;
    }
  }
}

export function getDataType(type: string): InternalTypeSchema {
  const schema = DATA_TYPES[type];
  if (!schema) {
    throw new OperationOutcomeError(serverError(Error('Unknown data type: ' + type)));
  }
  return schema;
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
  private readonly elements: ElementDefinition[];
  private readonly elementIndex: Record<string, ElementDefinition>;
  private index: number;
  private readonly resourceSchema: InternalTypeSchema;
  private slicingContext: { field: SlicingRules; current?: SliceDefinition; path: string } | undefined;
  private innerTypes: InternalTypeSchema[];
  private backboneContext: BackboneContext | undefined;

  /**
   * @param sd The StructureDefinition to parse
   * @throws Throws when the StructureDefinition does not have a populated `snapshot` field
   */
  constructor(sd: StructureDefinition) {
    if (!sd.snapshot?.element || sd.snapshot.element.length === 0) {
      throw new Error(`No snapshot defined for StructureDefinition '${sd.name}'`);
    }
    const root = sd.snapshot.element[0];

    this.elements = sd.snapshot.element.slice(1);
    this.elementIndex = Object.create(null);
    this.index = 0;
    this.resourceSchema = {
      name: sd.type as ResourceType,
      fields: {},
      constraints: this.parseFieldDefinition(root).constraints,
      innerTypes: [],
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
          this.slicingContext.current.fields[path] = this.parseFieldDefinition(element);
        }
      } else {
        // Normal field definition
        const field = this.parseFieldDefinition(element);
        this.checkFieldEnter(element, field);

        // Record field in schema
        if (this.backboneContext && element.path?.startsWith(this.backboneContext.path + '.')) {
          this.backboneContext.type.fields[elementPath(element, this.backboneContext.path)] = field;
        } else if (this.backboneContext?.parent && element.path?.startsWith(this.backboneContext.parent.path + '.')) {
          this.backboneContext.parent.type.fields[elementPath(element, this.backboneContext.parent.path)] = field;
        } else {
          this.resourceSchema.fields[elementPath(element, this.resourceSchema.name)] = field;
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

  private checkFieldEnter(element: ElementDefinition, field: ElementValidator): void {
    if (this.isInnerType(element)) {
      while (this.backboneContext && !pathsCompatible(this.backboneContext?.path, element.path)) {
        // Starting new inner type, unwind type stack to this property's parent
        this.innerTypes.push(this.backboneContext.type);
        this.backboneContext = this.backboneContext.parent;
      }
      this.backboneContext = {
        type: {
          name: buildTypeName(element.path?.split('.') ?? []) as ResourceType,
          fields: {},
          constraints: this.parseFieldDefinition(element).constraints,
          innerTypes: [],
        },
        path: element.path ?? '',
        parent: pathsCompatible(this.backboneContext?.path, element.path)
          ? this.backboneContext
          : this.backboneContext?.parent,
      };
    }
    if (element.slicing && !this.slicingContext) {
      field.slicing = {
        discriminator: (element.slicing?.discriminator ?? []).map((d) => {
          if (d.type !== 'value' && d.type !== 'pattern') {
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
      throw new Error('Invalid slice start before discriminator');
    }
    if (this.slicingContext.current) {
      this.slicingContext.field.slices.push(this.slicingContext.current);
    }
    this.slicingContext.current = {
      name: element.sliceName ?? '',
      fields: {},
      min: element.min ?? 0,
      max: element.max === '*' ? Number.POSITIVE_INFINITY : Number.parseInt(element.max as string, 10),
    };
  }

  private parseFieldDefinition(ed: ElementDefinition): ElementValidator {
    const max = parseCardinality(ed.max as string);
    const baseMax = ed.base?.max ? parseCardinality(ed.base.max) : max;
    const typedElementDef = { type: 'ElementDefinition', value: ed };
    return {
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
          ? buildTypeName(ed.base?.path?.split('.') ?? [])
          : t.code ?? '',
        targetProfile: t.targetProfile ?? [],
      })),
      fixed: firstValue(getTypedPropertyValue(typedElementDef, 'fixed')),
      pattern: firstValue(getTypedPropertyValue(typedElementDef, 'pattern')),
      binding: ed.binding?.strength === 'required' ? ed.binding.valueSet : undefined,
    };
  }
}

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
 * @param parent The expected parent path, which should be a prefix of the child path.
 * @param child The child path to test for compatibility with the parent path.
 * @returns True if the given path is a child of the parent.
 */
function pathsCompatible(parent: string | undefined, child: string | undefined): boolean {
  if (!parent || !child) {
    return false;
  }
  return child.startsWith(parent + '.') || child === parent;
}

function buildTypeName(components: string[]): string {
  if (components.length === 1) {
    return components[0];
  }
  return components.map(capitalize).join('');
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
