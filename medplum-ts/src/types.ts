
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

export interface SearchFilterDefinition {
  key: string;
  op: string;
  value?: string;
}

export interface SearchDefinition {
  resourceType: string;
  id?: string;
  name?: string;
  fields?: string[];
  filters?: SearchFilterDefinition[];
  sort?: string;
  countField?: string;
  page?: number;
  pageSize?: number;
  folderType?: number;
  folderEntityId?: string;
  default?: boolean;
}
