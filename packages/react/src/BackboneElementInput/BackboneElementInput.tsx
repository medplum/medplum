import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { BackboneElementContext, buildBackboneElementContext } from './BackbonElementInput.utils';

export interface BackboneElementInputProps {
  /** Type name the backbone element represents */
  typeName: string;
  /** The data type of the backbone element */
  type: string | undefined;
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
  const backboneContext = useContext(BackboneElementContext);
  const profileUrl = props.profileUrl ?? backboneContext.profileUrl;
  const typeSchema = useMemo(() => tryGetDataType(typeName, profileUrl), [typeName, profileUrl]);

  const context = useMemo(() => {
    return buildBackboneElementContext(typeSchema, profileUrl);
  }, [typeSchema, profileUrl]);

  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  function setValueWrapper(newValue: any): void {
    setValue(newValue);
    if (props.onChange) {
      props.onChange(newValue);
    }
  }

  return (
    <BackboneElementContext.Provider value={context}>
      <ElementsInput
        type={props.type}
        elements={typeSchema.elements}
        defaultValue={value}
        onChange={setValueWrapper}
        outcome={props.outcome}
      />
    </BackboneElementContext.Provider>
  );
}
