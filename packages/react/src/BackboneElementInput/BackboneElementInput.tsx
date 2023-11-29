import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { BackboneElementContext, buildBackboneElementContext } from './BackbonElementInput.utils';

export interface BackboneElementInputProps {
  typeName: string;
  type: string | undefined;
  defaultValue?: any;
  outcome?: OperationOutcome;
  onChange?: (value: any) => void;
}

export function BackboneElementInput(props: BackboneElementInputProps): JSX.Element {
  const { typeName } = props;
  const [value, setValue] = useState<any>(props.defaultValue ?? {});
  const { walkedPathsFlat } = useContext(BackboneElementContext);
  const typeSchema = useMemo(() => tryGetDataType(typeName), [typeName]);
  useEffect(() => {
    if (typeSchema) {
      console.debug(typeName, typeSchema.name, { typeSchema });
    }
  }, [typeSchema, typeName]);

  const context = useMemo(() => {
    return buildBackboneElementContext(typeSchema, [walkedPathsFlat], false);
  }, [typeSchema, walkedPathsFlat]);

  if (!typeSchema) {
    return <div>{typeName}&nbsp;not implemented</div>;
  }

  function setValueWrapper(newValue: any): void {
    console.log('BackboneElement', JSON.stringify(newValue));
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
