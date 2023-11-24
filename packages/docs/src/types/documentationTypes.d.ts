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

interface ResourceIntroduction {
  scopeAndUsage?: string;
  boundariesAndRelationships?: string;
  backgroundAndContext?: string;
  referencedBy?: string[];
}

interface ResourceDocsProps {
  name: string;
  location: DocumentationLocation;
  description: string;
  introduction?: ResourceIntroduction;
  properties: PropertyDocInfo[];
  searchParameters: SearchParamDocInfo[];
}
