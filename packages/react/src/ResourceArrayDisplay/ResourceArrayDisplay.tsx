import { InternalSchemaElement } from '@medplum/core';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface ResourceArrayDisplayProps {
  readonly property: InternalSchemaElement;
  readonly values: any[];
  readonly arrayElement?: boolean;
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element {
  const { property, values } = props;
  const propertyType = property.type[0].code;
  return props.values ? (
    <>
      {values.map((v: any, index: number) => (
        <div key={`${index}-${values.length}`}>
          <ResourcePropertyDisplay
            arrayElement={true}
            property={property}
            propertyType={propertyType}
            value={v}
            ignoreMissingValues={props.ignoreMissingValues}
            link={props.link}
          />
        </div>
      ))}
    </>
  ) : (
    <></>
  );
}
