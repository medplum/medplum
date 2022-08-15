import { ElementDefinition, SearchParameter } from '@medplum/fhirtypes';
export type PropertyDocInfo = { name: string; depth: number; type: string } & Required<
  Pick<ElementDefinition, 'path' | 'min' | 'max' | 'short' | 'definition' | 'comment'>
>;

export type SearchParamDocInfo = Required<Pick<SearchParameter, 'name' | 'type' | 'description' | 'expression'>>;

export type ResourceDocsProps = {
  resourceName: string;
  description: string;
  properties: PropertyDocInfo[];
  searchParameters: SearchParamDocInfo[];
};
