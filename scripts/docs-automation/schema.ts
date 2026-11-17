export interface Evidence {
  path: string;
  line: number;
  reason: string;
}

export interface Classification {
  outcome: 'no-docs' | 'already-covered' | 'update-docs' | 'needs-human';
  rationale: string;
  userImpact: string;
  evidence: Evidence[];
  changes: { path: string; action: 'update' | 'create'; purpose: string }[];
  questions: string[];
}

export interface Draft {
  edits: { path: string; content: string }[];
  notes: string;
  questions: string[];
}

export interface Verification {
  verdict: 'ready' | 'needs-human';
  findings: string[];
  evidence: Evidence[];
  examples: 'none' | 'existing-tested-source' | 'requires-execution';
  availability: string;
}

type Schema = {
  type: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
};
const string: Schema = { type: 'string', minLength: 1, maxLength: 6000 };
const list = (items: Schema, maxItems = 40): Schema => ({ type: 'array', items, maxItems });
const object = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const evidence = object({ path: string, line: { type: 'integer', minimum: 1 }, reason: string });
export const schemas = {
  classify: object({
    outcome: { type: 'string', enum: ['no-docs', 'already-covered', 'update-docs', 'needs-human'] },
    rationale: string,
    userImpact: string,
    evidence: list(evidence),
    changes: list(object({ path: string, action: { type: 'string', enum: ['update', 'create'] }, purpose: string }), 6),
    questions: list(string),
  }),
  draft: object({
    edits: list(object({ path: string, content: { type: 'string', minLength: 1, maxLength: 160000 } }), 6),
    notes: string,
    questions: list(string),
  }),
  verify: object({
    verdict: { type: 'string', enum: ['ready', 'needs-human'] },
    findings: list(string),
    evidence: list(evidence),
    examples: { type: 'string', enum: ['none', 'existing-tested-source', 'requires-execution'] },
    availability: string,
  }),
};

// Validate again outside the model. Missing, extra, or malformed fields fail the run.
export function validateSchema(value: unknown, schema: Schema, path = 'result'): void {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`);
    const data = value as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      if (!schema.properties?.[key]) throw new Error(`${path}: unexpected field ${key}`);
    }
    for (const key of schema.required ?? []) validateSchema(data[key], schema.properties![key], `${path}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? Infinity))
      throw new Error(`${path}: invalid array`);
    value.forEach((item, index) => validateSchema(item, schema.items!, `${path}[${index}]`));
  } else if (schema.type === 'string') {
    if (
      typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity)
    ) {
      throw new Error(`${path}: invalid string`);
    }
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: invalid choice`);
  } else if (!Number.isInteger(value) || (value as number) < (schema.minimum ?? 0)) {
    throw new Error(`${path}: invalid integer`);
  }
}
