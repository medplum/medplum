import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { ElementsContext } from '../ElementsInput/ElementsInput.utils';

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
  const { typeName } = props;
  const [value, setValue] = useState<any>(props.defaultValue ?? {});
  const elementsContext = useContext(ElementsContext);
  const profileUrl = props.profileUrl ?? elementsContext.profileUrl;
  const typeSchema = useMemo(() => tryGetDataType(typeName, profileUrl), [typeName, profileUrl]);
  const type = typeSchema?.type ?? typeName ?? '';

  if (!typeSchema) {
    return <div>{type}&nbsp;not implemented</div>;
  }

  function setValueWrapper(newValue: any): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <ElementsInput
      path={props.path}
      type={type}
      elements={typeSchema.elements}
      defaultValue={value}
      onChange={setValueWrapper}
      outcome={props.outcome}
      typeSchema={typeSchema}
    />
  );
}
