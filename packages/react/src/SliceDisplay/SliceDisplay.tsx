import {
  SliceDefinitionWithTypes,
  InternalSchemaElement,
  ElementsContextType,
  buildElementsContext,
  isPopulated,
} from '@medplum/core';
import { useContext, useMemo } from 'react';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export interface SliceDisplayProps {
  readonly path: string;
  readonly slice: SliceDefinitionWithTypes;
  readonly property: InternalSchemaElement;
  readonly value: any[];
  readonly ignoreMissingValues?: boolean;
  readonly link?: boolean;
}

export function SliceDisplay(props: SliceDisplayProps): JSX.Element {
  const { slice, property } = props;

  const sliceElements = slice.typeSchema?.elements ?? slice.elements;

  const parentContext = useContext(ElementsContext);

  const contextValue: ElementsContextType | undefined = useMemo(() => {
    if (isPopulated(sliceElements)) {
      return buildElementsContext({
        parentContext: parentContext,
        elements: sliceElements,
        path: props.path,
        profileUrl: slice.typeSchema?.url,
      });
    }
    return undefined;
  }, [parentContext, props.path, slice.typeSchema?.url, sliceElements]);

  return maybeWrapWithContext(
    ElementsContext.Provider,
    contextValue,
    <>
      {props.value.map((value, valueIndex) => {
        return (
          <div key={`${valueIndex}-${props.value.length}`}>
            <ResourcePropertyDisplay
              property={property}
              path={props.path}
              arrayElement={true}
              elementDefinitionType={slice.type[0]}
              propertyType={slice.type[0].code}
              value={value}
              ignoreMissingValues={props.ignoreMissingValues}
              link={props.link}
            />
          </div>
        );
      })}
    </>
  );
}
