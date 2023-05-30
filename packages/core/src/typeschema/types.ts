import { Bundle, ElementDefinition, ResourceType, StructureDefinition } from '@medplum/fhirtypes';
import { TypedValue } from '../types';
import { getTypedPropertyValue } from '../fhirpath';

/**
 * Internal representation of a non-primitive FHIR type, suitable for use in resource validation
 */
export interface InternalTypeSchema {
  name: ResourceType;
  fields: Record<string, ElementValidator>;
  constraints: Constraint[];
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
  Object.freeze(DATA_TYPES);
}

/**
 * @experimental
 */
class StructureDefinitionParser {
  readonly elements: ElementDefinition[];
  private index: number;
  readonly total: number;
  readonly resourceSchema: InternalTypeSchema;
  private slicingContext: { field: SlicingRules; current?: SliceDefinition; path: string } | undefined;

  /**
   * @param sd The StructureDefinition to parse
   * @throws Throws when the StructureDefinition does not have a populated `snapshot` field
   */
  constructor(sd: StructureDefinition) {
    if (!sd.snapshot?.element || sd.snapshot.element.length === 0) {
      throw new Error('No snapshot defined for StructureDefinition');
    }

    const root = sd.snapshot.element[0];
    const resourceSchema: InternalTypeSchema = {
      name: sd.type as ResourceType,
      fields: {},
      constraints: parseFieldDefinition(root).constraints,
    };

    this.elements = sd.snapshot.element.slice(1);
    this.index = 0;
    this.total = sd.snapshot.element.length;
    this.resourceSchema = resourceSchema;
  }

  parse(): InternalTypeSchema {
    let element = this.next();
    while (element) {
      if (element.slicing && !this.slicingContext) {
        // Start of sliced field: this ElementDefinition is the field itself, slice definitions follow
        this.parseSlicedField(element);
      } else if (element.sliceName) {
        // Start of slice: this ElementDefinition defines the top-level element of a slice value
        this.parseSliceStart(element);
      } else if (element.id?.includes(':')) {
        // Slice element, part of some slice definition
        if (this.slicingContext?.current) {
          let path = fieldPath(element);
          path = path.substring(path.indexOf('.') + 1); // Remove sliced field path prefix, so path refers to sub-field
          this.slicingContext.current.fields[path] = parseFieldDefinition(element);
        }
      } else {
        // Normal field definition
        if (this.slicingContext?.current) {
          this.slicingContext.field.slices.push(this.slicingContext.current);
        }
        this.resourceSchema.fields[fieldPath(element)] = parseFieldDefinition(element);
        if (this.slicingContext && !element.path?.startsWith(this.slicingContext.path + '.')) {
          // Path must be compatible with the sliced field path (i.e. have it as a prefix) to be a part of the
          // same slice group; otherwise, that group is finished and this is the start of a new field
          delete this.slicingContext;
        }
      }

      element = this.next();
    }

    // Wrap up if the StructureDefinition ends on a slice element
    if (this.slicingContext?.current) {
      this.slicingContext.field.slices.push(this.slicingContext.current);
    }

    return this.resourceSchema;
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
    this.resourceSchema.fields[fieldPath(element)] = field;
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

function fieldPath(element: ElementDefinition): string {
  const path = element.path as string;
  return path.substring(path.indexOf('.') + 1);
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
