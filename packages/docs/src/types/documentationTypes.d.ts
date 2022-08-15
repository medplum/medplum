import { ElementDefinition, SearchParameter } from '@medplum/fhirtypes';

type PropertyDocInfo = {
  name: string;
  depth: number;
  types: string[];
  referenceTypes?: string[];
  inherited: boolean;
  base?: string;
} & Required<Pick<ElementDefinition, 'path' | 'min' | 'max' | 'short' | 'definition' | 'comment'>>;

type SearchParamDocInfo = Required<Pick<SearchParameter, 'name' | 'type' | 'description' | 'expression'>>;

interface ResourceDocsProps {
  resourceName: string;
  description: string;
  properties: PropertyDocInfo[];
  searchParameters: SearchParamDocInfo[];
}
