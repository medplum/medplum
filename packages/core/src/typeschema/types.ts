import { Bundle, ElementDefinition, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { TypedValue, buildTypeName } from '../types';
import { getTypedPropertyValue } from '../fhirpath';

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
 *
 * @param sd The StructureDefinition resource to parse
 * @returns The parsed schema for the given resource type
 * @experimental
 */
export function parseStructureDefinition(sd: StructureDefinition): InternalTypeSchema {
  return new StructureDefinitionParser(sd).parse();
}

const DATA_TYPES: Record<string, InternalTypeSchema> = Object.create(null);
// const RESOURCE_TYPES: Record<string, InternalTypeSchema> = Object.create(null);

export function loadDataTypes(bundle: Bundle<StructureDefinition>): void {
  if (Object.keys(DATA_TYPES).length > 0) {
    return;
  }
  for (const { resource: sd } of bundle.entry || []) {
    if (!sd || !sd.name) {
      throw new Error(`Failed loading StructureDefinition from bundle`);
    }
    DATA_TYPES[sd.name] = parseStructureDefinition(sd);
  }
}

export function getDataType(type: string): InternalTypeSchema {
  const schema = DATA_TYPES[type];
  if (!schema) {
    throw new Error('Unknown data type: ' + type);
  }
  return schema;
}

/**
 * @experimental
 */
class StructureDefinitionParser {
  private readonly elements: ElementDefinition[];
  private index: number;
  private readonly resourceSchema: InternalTypeSchema;
  private slicingContext: { field: SlicingRules; current?: SliceDefinition; path: string } | undefined;
  private innerTypes: InternalTypeSchema[];
  private backboneContext: { type: InternalTypeSchema; path: string } | undefined;

  /**
   * @param sd The StructureDefinition to parse
   * @throws Throws when the StructureDefinition does not have a populated `snapshot` field
   */
  constructor(sd: StructureDefinition) {
    if (!sd.snapshot?.element || sd.snapshot.element.length === 0) {
      throw new Error('No snapshot defined for StructureDefinition');
    }
    const root = sd.snapshot.element[0];

    this.elements = sd.snapshot.element.slice(1);
    this.index = 0;
    this.resourceSchema = {
      name: sd.type as ResourceType,
      fields: {},
      constraints: parseFieldDefinition(root).constraints,
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
          const path = fieldPath(element, this.slicingContext.path);
          this.slicingContext.current.fields[path] = parseFieldDefinition(element);
        }
      } else {
        // Normal field definition
        const field = parseFieldDefinition(element);
        this.checkFieldEnter(element, field);
        if (this.backboneContext && element.path?.startsWith(this.backboneContext.path + '.')) {
          this.backboneContext.type.fields[fieldPath(element, this.backboneContext.path)] =
            parseFieldDefinition(element);
        }
        this.resourceSchema.fields[fieldPath(element, this.resourceSchema.name)] = field;

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
    if (element.type?.some((t) => ['BackboneElement', 'Element'].includes(t.code as string))) {
      this.backboneContext = {
        type: {
          name: buildTypeName(element.path?.split('.') || []) as ResourceType,
          fields: {},
          constraints: parseFieldDefinition(element).constraints,
          innerTypes: [],
        },
        path: element.path || '',
      };
    }
    if (element.slicing && !this.slicingContext) {
      field.slicing = {
        discriminator: (element.slicing?.discriminator || []).map((d) => ({
          path: d.path as string,
          type: d.type as string,
        })),
        slices: [],
        ordered: element.slicing?.ordered || false,
        rule: element.slicing?.rules,
      };
      this.slicingContext = { field: field.slicing, path: element.path || '' };
    }
  }

  private checkFieldExit(element: ElementDefinition | undefined = undefined): void {
    if (this.backboneContext && !pathsCompatible(this.backboneContext.path, element?.path as string)) {
      // Leaving BackboneElement child fields
      this.innerTypes.push(this.backboneContext.type);
      delete this.backboneContext;
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
    const element = this.elements[this.index];
    if (element) {
      this.index++;
      return element;
    }
    return undefined;
  }

  private parseSlicedField(element: ElementDefinition): void {
    const field = parseFieldDefinition(element);
    field.slicing = {
      discriminator: (element.slicing?.discriminator || []).map((d) => ({
        path: d.path as string,
        type: d.type as string,
      })),
      slices: [],
      ordered: element.slicing?.ordered || false,
      rule: element.slicing?.rules,
    };
    this.resourceSchema.fields[fieldPath(element, this.resourceSchema.name)] = field;
    this.slicingContext = { field: field.slicing, path: element.path || '' };
  }

  private parseSliceStart(element: ElementDefinition): void {
    if (!this.slicingContext) {
      throw new Error('Invalid slice start before discriminator');
    }
    if (this.slicingContext.current) {
      this.slicingContext.field.slices.push(this.slicingContext.current);
    }
    this.slicingContext.current = {
      name: element.sliceName || '',
      fields: {},
      min: element.min || 0,
      max: element.max === '*' ? Number.POSITIVE_INFINITY : Number.parseInt(element.max as string),
    };
  }
}

function parseCardinality(c: string): number {
  return c === '*' ? Number.POSITIVE_INFINITY : Number.parseInt(c);
}

function fieldPath(element: ElementDefinition, prefix = ''): string {
  return trimPrefix(element.path || '', prefix);
}

function parseFieldDefinition(ed: ElementDefinition): ElementValidator {
  const max = parseCardinality(ed.max as string);
  const baseMax = ed.base && ed.base.max ? parseCardinality(ed.base.max) : max;
  const typedElementDef = { type: 'ElementDefinition', value: ed };

  return {
    min: ed.min || 0,
    max: max,
    isArray: baseMax > 1,
    constraints: (ed.constraint || []).map((c) => ({
      key: c.key || '',
      severity: c.severity || 'error',
      expression: c.expression || '',
      description: c.human || '',
    })),
    type: (ed.type || []).map((t) => ({
      code: t.code || '',
      targetProfile: t.targetProfile || [],
    })),
    fixed: [getTypedPropertyValue(typedElementDef, 'fixed')].flat()[0],
    pattern: [getTypedPropertyValue(typedElementDef, 'pattern')].flat()[0],
    binding: ed.binding?.strength === 'required' ? ed.binding.valueSet : undefined,
  };
}

export function isComplexDataType(type: string): boolean {
  if (!type) {
    return false;
  }
  const firstChar = type.charAt(0);
  return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase() && type !== 'BackboneElement';
}

function trimPrefix(str: string, prefix: string): string {
  if (prefix && str.indexOf(prefix) === 0) {
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
function pathsCompatible(parent: string, child: string): boolean {
  if (!parent || !child) {
    return false;
  }
  return child.startsWith(parent + '.') || child === parent;
}
