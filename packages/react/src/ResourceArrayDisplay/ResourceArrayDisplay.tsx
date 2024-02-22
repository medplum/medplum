import { InternalSchemaElement, isEmpty } from '@medplum/core';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface ResourceArrayDisplayProps {
  readonly property: InternalSchemaElement;
  readonly propertyType: string;
  readonly values: any[];
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element | null {
  const { property, propertyType, values } = props;

  if (isEmpty(props.values)) {
    return null;
  }

  return (
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
  );
}
