
export interface PropertyDefinition {
  key: string;
  display: string;
  type: string;
  description?: string;
  array?: boolean;
  enumValues?: string[];
  targetProfile?: string[];
}

export interface TypeDefinition {
  display: string;
  properties: { [name: string]: PropertyDefinition };
  description?: string;
  backboneElement?: boolean;
}

export type Schema = { [name: string]: TypeDefinition };
