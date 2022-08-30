import { ElementDefinition, SearchParameter } from '@medplum/fhirtypes';

type DocumentationLocation = 'resource' | 'datatype' | 'medplum';

type PropertyTypeDocInfo = {
  datatype: string;
  documentLocation: DocumentationLocation | undefined;
};

type PropertyDocInfo = {
  name: string;
  depth: number;
  types: PropertyTypeDocInfo[];
  referenceTypes?: PropertyTypeDocInfo[];
  inherited: boolean;
  base?: string;
} & Required<Pick<ElementDefinition, 'path' | 'min' | 'max' | 'short' | 'definition' | 'comment'>>;

type SearchParamDocInfo = Required<Pick<SearchParameter, 'name' | 'type' | 'description' | 'expression'>>;

interface ResourceDocsProps {
  name: string;
  location: DocumentationLocation;
  description: string;
  properties: PropertyDocInfo[];
  searchParameters: SearchParamDocInfo[];
}
