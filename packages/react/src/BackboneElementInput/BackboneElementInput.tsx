import { ElementsContextType, buildElementsContext, tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';

export interface BackboneElementInputProps {
  /** Type name the backbone element represents */
  readonly typeName: string;
  /** The path identifies the element and is expressed as a "."-separated list of ancestor elements, beginning with the name of the resource or extension. */
  readonly path: string;
  /** (optional) The contents of the resource represented by the backbone element */
  readonly defaultValue?: any;
  /** (optional) OperationOutcome from the last attempted system action*/
  readonly outcome?: OperationOutcome;
  /** (optional) callback function that is called when the value of the backbone element changes */
  readonly onChange?: (value: any) => void;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  readonly profileUrl?: string;
}

export function BackboneElementInput(props: BackboneElementInputProps): JSX.Element {
  const [defaultValue] = useState(() => props.defaultValue ?? {});
  const parentElementsContext = useContext(ElementsContext);
  const profileUrl = props.profileUrl ?? parentElementsContext?.profileUrl;
  const typeSchema = useMemo(() => tryGetDataType(props.typeName, profileUrl), [props.typeName, profileUrl]);
  const type = typeSchema?.type ?? props.typeName;

  const contextValue: ElementsContextType | undefined = useMemo(() => {
    if (!typeSchema) {
      return undefined;
    }
    return buildElementsContext({
      parentContext: parentElementsContext,
      elements: typeSchema.elements,
      path: props.path,
      profileUrl: typeSchema.url,
    });
  }, [typeSchema, props.path, parentElementsContext]);

  if (!typeSchema) {
    return <div>{type}&nbsp;not implemented</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    contextValue,
    <ElementsInput
      path={props.path}
      type={type}
      defaultValue={defaultValue}
      onChange={props.onChange}
      outcome={props.outcome}
    />
  );
}
