import {
  Bundle,
  Coding,
  ElementDefinition,
  ElementDefinitionBinding,
  Resource,
  ResourceType,
  StructureDefinition,
} from '@medplum/fhirtypes';
import { DataTypesMap, inflateBaseSchema } from '../base-schema';
import baseSchema from '../base-schema.json';
import { getTypedPropertyValue } from '../fhirpath/utils';
import { OperationOutcomeError, badRequest } from '../outcomes';
import { TypedValue, getElementDefinitionTypeName, isResourceTypeSchema } from '../types';
import { capitalize, getExtension, isEmpty } from '../utils';

/**
 * Internal representation of a non-primitive FHIR type, suitable for use in resource validation
 */
export interface InternalTypeSchema {
  name: string;
  title?: string;
  url?: string;
  kind?: string;
  type?: string;
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
  profile?: string[];
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

export interface SliceDefinition extends Omit<InternalSchemaElement, 'slicing'> {
  name: string;
  definition?: string;
  elements: Record<string, InternalSchemaElement>;
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

const DATA_TYPES: DataTypesMap = inflateBaseSchema(baseSchema);

// profiles are referenced by URL instead of name
const PROFILE_SCHEMAS_BY_URL: { [profileUrl: string]: InternalTypeSchema } = Object.create(null);

// Since profiles alter the schemas of their elements, a mapping of type names to schemas
// is maintained per profile URL
const PROFILE_DATA_TYPES: { [profileUrl: string]: DataTypesMap } = Object.create(null);

function getDataTypesMap(profileUrl?: string): DataTypesMap {
  let dataTypes: DataTypesMap;

  if (profileUrl) {
    dataTypes = PROFILE_DATA_TYPES[profileUrl];
    if (!dataTypes) {
      dataTypes = PROFILE_DATA_TYPES[profileUrl] = Object.create(null);
    }
  } else {
    dataTypes = DATA_TYPES;
  }

  return dataTypes;
}

/**
 * Parses and indexes structure definitions
 * @param bundle - Bundle or array of structure definitions to be parsed and indexed
 * @param profileUrl - (optional) URL of the profile the SDs are related to
 */
export function indexStructureDefinitionBundle(
  bundle: StructureDefinition[] | Bundle,
  profileUrl?: string | undefined
): void {
  const sds = Array.isArray(bundle) ? bundle : (bundle.entry?.map((e) => e.resource as StructureDefinition) ?? []);
  for (const sd of sds) {
    loadDataType(sd, profileUrl);
  }
}

export function loadDataType(sd: StructureDefinition, profileUrl?: string | undefined): void {
  if (!sd?.name) {
    throw new Error(`Failed loading StructureDefinition from bundle`);
  }
  if (sd.resourceType !== 'StructureDefinition') {
    return;
  }
  const schema = parseStructureDefinition(sd);

  const dataTypes = getDataTypesMap(profileUrl);

  dataTypes[sd.name] = schema;

  if (profileUrl && sd.url === profileUrl) {
    PROFILE_SCHEMAS_BY_URL[profileUrl] = schema;
  }

  for (const inner of schema.innerTypes) {
    inner.parentType = schema;
    dataTypes[inner.name] = inner;
  }
}

export function getAllDataTypes(): DataTypesMap {
  return DATA_TYPES;
}

export function isDataTypeLoaded(type: string): boolean {
  return !!DATA_TYPES[type];
}

export function tryGetDataType(type: string, profileUrl?: string): InternalTypeSchema | undefined {
  let result: InternalTypeSchema | undefined = getDataTypesMap(profileUrl)[type];
  if (!result && profileUrl) {
    // Fallback to base schema if no result found in profileUrl namespace
    result = getDataTypesMap()[type];
  }
  return result;
}

export function getDataType(type: string, profileUrl?: string): InternalTypeSchema {
  const schema = tryGetDataType(type, profileUrl);
  if (!schema) {
    throw new OperationOutcomeError(badRequest('Unknown data type: ' + type));
  }
  return schema;
}

/**
 * Returns true if the given string is a valid FHIR resource type.
 *
 * @example
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

export function isProfileLoaded(profileUrl: string): boolean {
  return !!PROFILE_SCHEMAS_BY_URL[profileUrl];
}

export function tryGetProfile(profileUrl: string): InternalTypeSchema | undefined {
  return PROFILE_SCHEMAS_BY_URL[profileUrl];
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
      title: sd.title,
      type: sd.type,
      url: sd.url as string,
      kind: sd.kind,
      description: getDescription(sd),
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
        title: element.label,
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
        this.backboneContext = undefined;
      }
    }
    if (this.slicingContext && !pathsCompatible(this.slicingContext.path, element?.path as string)) {
      // Path must be compatible with the sliced field path (i.e. have it as a prefix) to be a part of the
      // same slice group; otherwise, that group is finished and this is the start of a new field
      if (this.slicingContext?.current) {
        this.slicingContext.field.slices.push(this.slicingContext.current);
      }
      this.slicingContext = undefined;
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
        const contentRefPath = element.contentReference.slice(element.contentReference.indexOf('#') + 1);
        const ref = this.elementIndex[contentRefPath];
        if (!ref) {
          return undefined;
        }
        return {
          ...ref,
          id: element.id,
          path: element.path,
          min: element.min ?? ref.min,
          max: element.max ?? ref.max,
          base: {
            path: ref.base?.path ?? contentRefPath,
            min: element.base?.min ?? ref.base?.min ?? (ref.min as number),
            max: element.base?.max ?? ref.base?.max ?? (ref.max as string),
          },
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
      throw new Error(`Invalid slice start before discriminator: ${element.sliceName} (${element.id})`);
    }
    if (this.slicingContext.current) {
      this.slicingContext.field.slices.push(this.slicingContext.current);
    }

    this.slicingContext.current = {
      ...this.parseElementDefinition(element),
      name: element.sliceName ?? '',
      definition: element.definition,
      elements: {},
    };
  }

  private parseElementDefinitionType(ed: ElementDefinition): ElementType[] {
    return (ed.type ?? []).map((type) => {
      let code: string | undefined;

      if (type.code === 'BackboneElement' || type.code === 'Element') {
        code = getElementDefinitionTypeName(ed);
      }

      if (!code) {
        // This is a low-level extension that we optimize handling for
        code = getExtension(type, 'http://hl7.org/fhir/StructureDefinition/structuredefinition-fhir-type')?.valueUrl;
      }

      if (!code) {
        code = type.code ?? '';
      }

      return {
        code,
        targetProfile: type.targetProfile,
        profile: type.profile,
      };
    });
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
      type: this.parseElementDefinitionType(ed),
      fixed: firstValue(getTypedPropertyValue(typedElementDef, 'fixed[x]')),
      pattern: firstValue(getTypedPropertyValue(typedElementDef, 'pattern[x]')),
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

function getDescription(sd: StructureDefinition): string | undefined {
  let result = sd.description;

  // Many description strings start with an unwanted prefix "Base StructureDefinition for X Type: "
  // For example:
  // Base StructureDefinition for Age Type: A duration of time during which an organism (or a process) has existed.
  // If the description starts with the name of the resource type, remove it.
  if (result?.startsWith(`Base StructureDefinition for ${sd.name} Type: `)) {
    result = result.substring(`Base StructureDefinition for ${sd.name} Type: `.length);
  }

  return result;
}
