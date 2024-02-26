import { InternalSchemaElement, InternalTypeSchema } from './typeschema/types';

export type BaseSchema = Record<string, { elements: Record<string, Partial<InternalSchemaElement>> }>;

const normalizedTypes: Record<string, string> = {
  'http://hl7.org/fhirpath/System.String': 'string',
};

export function compressElement(element: InternalSchemaElement): Partial<InternalSchemaElement> {
  // For each property, only keep "min", "max", and "type"
  // Only keep "min" if not 0
  // Only keep "max" if not 1
  const outputPropertySchema: Partial<InternalSchemaElement> = {};
  if (element.min !== 0) {
    outputPropertySchema.min = element.min;
  }

  if (element.max !== 1 && Number.isFinite(element.max)) {
    outputPropertySchema.max = element.max;
  } else if (element.max === Number.POSITIVE_INFINITY) {
    outputPropertySchema.max = Number.MAX_SAFE_INTEGER;
  }

  outputPropertySchema.type = element.type?.map((t) => ({
    ...t,
    extension: undefined,
    code: normalizedTypes[t.code] ?? t.code,
  }));
  return outputPropertySchema;
}

export function inflateElement(path: string, partial: Partial<InternalSchemaElement>): InternalSchemaElement {
  const max = partial.max && partial.max === Number.MAX_SAFE_INTEGER ? Number.POSITIVE_INFINITY : partial.max;
  return {
    path,
    description: '',
    type: partial.type ?? [],
    min: partial.min ?? 0,
    max: max ?? 1,
    isArray: !!max && max > 1,
    constraints: [],
  };
}

export type DataTypesMap = { [type: string]: InternalTypeSchema };

export function inflateBaseSchema(base: BaseSchema): DataTypesMap {
  const output: DataTypesMap = Object.create(null);
  for (const [key, schema] of Object.entries(base)) {
    output[key] = {
      name: key,
      elements: Object.fromEntries(
        Object.entries(schema.elements).map(([property, partial]) => [property, inflateElement(property, partial)])
      ),
      constraints: [],
      innerTypes: [],
    };
  }
  return output;
}
