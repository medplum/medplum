import { ElementsContextType, buildElementsContext, tryGetDataType } from '@medplum/core';
import { useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';
import { maybeWrapWithContext } from '../utils/maybeWrapWithContext';
import { BaseInputProps } from '../ResourcePropertyInput/ResourcePropertyInput.utils';
import { AccessPolicyResource } from '@medplum/fhirtypes';

export interface BackboneElementInputProps extends BaseInputProps {
  /** Type name the backbone element represents */
  readonly typeName: string;
  /** (optional) The contents of the resource represented by the backbone element */
  readonly defaultValue?: any;
  /** (optional) callback function that is called when the value of the backbone element changes */
  readonly onChange?: (value: any) => void;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  readonly profileUrl?: string;
  /**
   * (optional) If provided, inputs specified in `accessPolicyResource.readonlyFields` are not editable
   * and inputs specified in `accessPolicyResource.hiddenFields` are not shown.
   */
  readonly accessPolicyResource?: AccessPolicyResource;
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
      accessPolicyResource: props.accessPolicyResource,
    });
  }, [typeSchema, parentElementsContext, props.path, props.accessPolicyResource]);

  if (!typeSchema) {
    return <div>{type}&nbsp;not implemented</div>;
  }

  return maybeWrapWithContext(
    ElementsContext.Provider,
    contextValue,
    <ElementsInput
      path={props.path}
      valuePath={props.valuePath}
      type={type}
      defaultValue={defaultValue}
      onChange={props.onChange}
      outcome={props.outcome}
    />
  );
}
