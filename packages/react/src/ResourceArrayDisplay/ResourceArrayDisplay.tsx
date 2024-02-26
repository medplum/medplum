import { InternalSchemaElement, SliceDefinitionWithTypes } from '@medplum/core';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { useState, useContext, useEffect } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { prepareSlices, assignValuesIntoSlices } from '../ResourceArrayInput/ResourceArrayInput.utils';
import { useMedplum } from '@medplum/react-hooks';
import { SliceDisplay } from '../SliceDisplay/SliceDisplay';
import { Stack } from '@mantine/core';

export interface ResourceArrayDisplayProps {
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path?: string;
  readonly property: InternalSchemaElement;
  readonly propertyType: string;
  readonly values: any[];
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
}

export function ResourceArrayDisplay(props: ResourceArrayDisplayProps): JSX.Element | null {
  const { property, propertyType } = props;
  const [values] = useState<any[]>(() => (Array.isArray(props.values) ? props.values : []));
  const medplum = useMedplum();
  const [loading, setLoading] = useState(true);
  const [slices, setSlices] = useState<SliceDefinitionWithTypes[]>([]);
  const [slicedValues, setSlicedValues] = useState<any[][]>(() => [values]);
  const ctx = useContext(ElementsContext);

  useEffect(() => {
    prepareSlices({
      medplum,
      property,
    })
      .then((slices) => {
        setSlices(slices);
        const slicedValues = assignValuesIntoSlices(values, slices, property.slicing, ctx.profileUrl);
        setSlicedValues(slicedValues);
        setLoading(false);
      })
      .catch((reason) => {
        console.error(reason);
        setLoading(false);
      });
  }, [medplum, property, ctx.profileUrl, setSlicedValues, values]);

  if (loading) {
    return <div>Loading...</div>;
  }

  const nonSliceIndex = slices.length;
  const nonSliceValues = slicedValues[nonSliceIndex];
  const showNonSliceValues = property.type[0]?.code !== 'Extension';

  return (
    <Stack gap="sm">
      {slices.map((slice, sliceIndex) => {
        if (!props.path) {
          throw Error(`Displaying a resource property with slices of type ${props.propertyType} requires path`);
        }
        return (
          <SliceDisplay
            path={props.path}
            slice={slice}
            key={slice.name}
            property={property}
            value={slicedValues[sliceIndex]}
            ignoreMissingValues={props.ignoreMissingValues}
            link={props.link}
          />
        );
      })}

      {showNonSliceValues &&
        nonSliceValues.map((value, valueIndex) => (
          <div key={`${valueIndex}-${nonSliceValues.length}`}>
            <ResourcePropertyDisplay
              path={props.path}
              arrayElement={true}
              property={property}
              propertyType={propertyType}
              value={value}
              ignoreMissingValues={props.ignoreMissingValues}
              link={props.link}
            />
          </div>
        ))}
    </Stack>
  );
}
