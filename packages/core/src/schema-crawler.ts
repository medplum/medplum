import {
  InternalSchemaElement,
  InternalTypeSchema,
  SliceDefinition,
  SlicingRules,
  tryGetProfile,
} from './typeschema/types';
import { isPopulated } from './utils';

function isSupportedSliceDefinition(slice: SliceDefinition): slice is SupportedSliceDefinition {
  return slice.type !== undefined && slice.type.length > 0;
}

type SupportedSliceDefinition = SliceDefinition & {
  type: NonNullable<SliceDefinition['type']>;
  typeSchema?: InternalTypeSchema;
};

export type VisitorSliceDefinition = SupportedSliceDefinition;
export type VisitorSlicingRules = Omit<SlicingRules, 'slices'> & {
  slices: VisitorSliceDefinition[];
  // slices: SupportedSliceDefinition[];
};

export interface SchemaVisitor {
  onEnterResource?: (schema: InternalTypeSchema) => void;
  onExitResource?: () => void;

  // visitElement: (path: string, element: InternalSchemaElement) => void;
  onEnterElement?: (path: string, element: InternalSchemaElement) => void;
  onExitElement?: () => void;

  onEnterSlicing?: (path: string, slicing: VisitorSlicingRules) => void;
  onExitSlicing?: () => void;

  onEnterSlice?: (path: string, slice: VisitorSliceDefinition) => void;
  onExitSlice?: () => void;
}

export class SchemaCrawler {
  private readonly rootSchema: InternalTypeSchema;
  private readonly visitor: SchemaVisitor;
  private readonly rootPath: string;

  private schema: InternalTypeSchema;
  private debugMode: boolean = false;
  private sliceAllowList: SliceDefinition[] | undefined;

  constructor(schema: InternalTypeSchema, visitor: SchemaVisitor) {
    this.rootSchema = schema;
    this.schema = schema;
    this.visitor = visitor;
    this.rootPath = schema.type as string;
  }

  private debug(...data: any[]): void {
    if (this.debugMode) {
      console.debug(`[${this.schema.name}]`, ...data);
    }
  }

  crawlElement(element: InternalSchemaElement, key: string): void {
    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.crawlElementImpl(element, this.rootPath + '.' + key);

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  crawlSlice(element: InternalSchemaElement, key: string, slice: SliceDefinition): void {
    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.sliceAllowList = [slice];
    this.crawlElementImpl(element, this.rootPath + '.' + key);
    this.sliceAllowList = undefined;

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  crawlSchema(debug?: boolean): void {
    this.debugMode = Boolean(debug);

    if (this.visitor.onEnterResource) {
      this.visitor.onEnterResource(this.rootSchema);
    }

    this.crawlElementsImpl(this.rootSchema.elements, this.rootPath);

    if (this.visitor.onExitResource) {
      this.visitor.onExitResource();
    }
  }

  private crawlElementsImpl(elements: InternalTypeSchema['elements'], path: string): void {
    for (const [key, element] of Object.entries(elements)) {
      const elementPath = path + '.' + key;
      this.crawlElementImpl(element, elementPath);
    }
  }

  private crawlElementImpl(element: InternalSchemaElement, path: string): void {
    // TODO - is a schema ever going to be found here?
    const profileUrl = element.type.find((t) => isPopulated(t.profile))?.profile?.[0];
    const profile = isPopulated(profileUrl) ? tryGetProfile(profileUrl) : undefined;
    if (profile) {
      this.schema = profile;
    }

    if (this.visitor.onEnterElement) {
      this.visitor.onEnterElement(path, element);
    }

    // this.visitor.visitElement(path, element);

    if (isPopulated(element?.slicing?.slices)) {
      this.crawlSlicingImpl(element.slicing, path);
    }

    if (this.visitor.onExitElement) {
      this.visitor.onExitElement();
    }
  }

  private crawlSlicingImpl(slicing: SlicingRules, path: string): void {
    const slices = slicing.slices;
    // if (this.sliceAllowList) {
    // slices = slices.filter((s) => this.sliceAllowList?.includes(s));
    // }
    const supportedSlices: SupportedSliceDefinition[] = [];
    for (const slice of slices) {
      if (isSupportedSliceDefinition(slice)) {
        const profileUrl = slice.type?.find((t) => isPopulated(t.profile))?.profile?.[0];
        if (isPopulated(profileUrl)) {
          const schema = isPopulated(profileUrl) ? tryGetProfile(profileUrl) : undefined;
          if (profileUrl && !schema) {
            this.debug('SLICE PROFILE SCHEMA NOT FOUND', profileUrl);
          }
          slice.typeSchema = schema;
        }
        supportedSlices.push(slice);
      }
    }

    // TODO - should also crawl unsupported slices for completeness

    const visitorSlicing = slicing as VisitorSlicingRules;
    visitorSlicing.slices = supportedSlices;

    if (this.visitor.onEnterSlicing) {
      this.visitor.onEnterSlicing(path, visitorSlicing);
    }

    for (const slice of visitorSlicing.slices) {
      if (this.sliceAllowList !== undefined) {
        if (this.sliceAllowList.includes(slice)) {
          this.crawlSliceImpl(slice, path);
        }
      } else {
        this.crawlSliceImpl(slice, path);
      }
    }

    if (this.visitor.onExitSlicing) {
      this.visitor.onExitSlicing();
    }
  }

  private crawlSliceImpl(slice: VisitorSliceDefinition, path: string): void {
    if (this.visitor.onEnterSlice) {
      this.visitor.onEnterSlice(path, slice);
    }

    const schema = slice.typeSchema;

    if (schema) {
      this.schema = schema;
      this.crawlElementsImpl(schema.elements, path);
    } else {
      this.crawlElementsImpl(slice.elements, path);
    }

    if (this.visitor.onExitSlice) {
      this.visitor.onExitSlice();
    }
  }
}
