import { tryGetDataType } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { useEffect, useMemo, useState } from 'react';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { BackboneElementContext, buildWalkedPathsAndSeenKeys } from './BackbonElementInput.utils';

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

  const typeSchema = useMemo(() => tryGetDataType(typeName), [typeName]);
  useEffect(() => {
    if (typeSchema) {
      console.debug(typeName, typeSchema.name, { typeSchema });
    }
  }, [typeSchema, typeName]);

  // TODO{mattlong} actually use walkedPaths to alter logic
  const [walkedPaths, seenKeys] = useMemo(() => {
    return buildWalkedPathsAndSeenKeys(typeSchema?.elements);
  }, [typeSchema?.elements]);

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
    <BackboneElementContext.Provider value={{ walkedPaths, seenKeys }}>
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
