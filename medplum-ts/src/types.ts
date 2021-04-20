
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

export interface ResourceMeta {
  versionId: string;
  lastUpdated: string;
}

export interface Resource {
  resourceType: string;
  id: string;
  meta: ResourceMeta;
  name?: any;
}

export interface BundleEntry {
  fullUrl: string;
  resource: Resource;
}

export interface Bundle extends Resource {
  entry: BundleEntry[];
}

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
  filters: SearchFilterDefinition[];
  sort?: string;
  countField?: string;
  page?: number;
  pageSize?: number;
  folderType?: number;
  folderEntityId?: string;
  default?: boolean;
}

export interface SearchResponseMeta {
  startIndex: number;
  endIndex: number;
  count: number;
}

export interface SearchResponseEntry {
  fullUrl: string;
  resource: Resource;
}

export interface SearchResponse {
  entry: any[];
}

export interface HumanName {
  given?: string[];
  family?: string;
}
