import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useCallback, useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { ElementsContext, buildElementsContext } from '../ElementsInput/ElementsInput.utils';

export interface BackboneElementInputProps {
  /** Type name the backbone element represents */
  typeName: string;
  /** FHIR path of the backbone element in the resource being shown*/
  path: string;
  /** (optional) The contents of the resource represented by the backbone element */
  defaultValue?: any;
  /** (optional) OperationOutcome from the last attempted system action*/
  outcome?: OperationOutcome;
  /** (optional) callback function that is called when the value of the backbone element changes */
  onChange?: (value: any) => void;
  /** (optional) Profile URL of the structure definition represented by the backbone element */
  profileUrl?: string;
}

export function BackboneElementInput(props: BackboneElementInputProps): JSX.Element {
  const { onChange } = props;
  const [value, setValue] = useState<any>(() => props.defaultValue ?? {});
  const parentElementsContext = useContext(ElementsContext);
  const profileUrl = props.profileUrl ?? parentElementsContext.profileUrl;
  const typeSchema = useMemo(() => tryGetDataType(props.typeName, profileUrl), [props.typeName, profileUrl]);
  const type = typeSchema?.type ?? props.typeName;

  const elementsContext = useMemo(() => {
    return buildElementsContext({
      parentContext: parentElementsContext,
      elements: typeSchema?.elements,
      parentPath: props.path,
      parentType: type,
      profileUrl,
    });
  }, [parentElementsContext, typeSchema?.elements, props.path, type, profileUrl]);

  const setValueWrapper = useCallback(
    (newValue: any): void => {
      setValue(newValue);
      if (onChange) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  if (!typeSchema) {
    return <div>{type}&nbsp;not implemented</div>;
  }

  return (
    <ElementsContext.Provider value={elementsContext}>
      <ElementsInput
        path={props.path}
        type={type}
        defaultValue={value}
        onChange={setValueWrapper}
        outcome={props.outcome}
        typeSchema={typeSchema}
      />
    </ElementsContext.Provider>
  );
}
