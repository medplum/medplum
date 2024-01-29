import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { BackboneElementContext, buildBackboneElementContext } from './BackboneElementInput.utils';

export interface BackboneElementInputProps {
  /** Type name the backbone element represents */
  readonly typeName: string;
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
        type={typeSchema.type}
        elements={typeSchema.elements}
        defaultValue={value}
        onChange={setValueWrapper}
        outcome={props.outcome}
      />
    </BackboneElementContext.Provider>
  );
}
