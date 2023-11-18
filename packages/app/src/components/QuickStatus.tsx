import { createStyles, NativeSelect } from '@mantine/core';
import { Reference, ValueSet } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';

const useStyles = createStyles(() => ({
  container: {
    position: 'absolute',
    top: 65,
    right: 5,
    width: 200,
    height: 50,
    zIndex: 15,
  },
}));

export interface QuickStatusProps {
  valueSet: Reference<ValueSet> | ValueSet;
  defaultValue?: string;
  onChange: (newStatus: string) => void;
}

export function QuickStatus(props: QuickStatusProps): JSX.Element | null {
  const { classes } = useStyles();
  const valueSet = useResource(props.valueSet);
  if (!valueSet) {
    return null;
  }

  const options = [''];

  const valueSetCodes = valueSet.compose?.include?.[0]?.concept?.map((concept) => concept.code);
  if (valueSetCodes) {
    options.push(...(valueSetCodes as string[]));
  }

  if (props.defaultValue && !options.includes(props.defaultValue)) {
    options.push(props.defaultValue);
  }

  return (
    <div className={classes.container}>
      <NativeSelect
        defaultValue={props.defaultValue}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        data={options}
      />
    </div>
  );
}
