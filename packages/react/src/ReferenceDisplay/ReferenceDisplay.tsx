import { stringify } from '@medplum/core';
import { Reference } from '@medplum/fhirtypes';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { IconExternalLink } from '@tabler/icons-react';
import { Anchor, Group } from '@mantine/core';

export interface ReferenceDisplayProps {
  readonly value?: Reference;
  readonly link?: boolean | 'external';
}

export function ReferenceDisplay(props: ReferenceDisplayProps): JSX.Element | null {
  if (!props.value) {
    return null;
  }

  const displayString = props.value.display || props.value.reference || stringify(props.value);

  // The "link" prop defaults to "true"; undefined is treated as "true"
  // To disable the link, it must be explicitly "false"
  if (props.link !== false && props.value.reference) {
    return <MedplumLink to={props.value}>{displayString}</MedplumLink>;
  } else {
    return (
      <Group gap={0}>
        <span>{displayString}&nbsp;</span>
        <Anchor size="sm" style={{ display: 'inline-block' }} href={'/' + props.value.reference} target="_blank">
          <IconExternalLink size={16} style={{ verticalAlign: 'text-bottom' }} />
        </Anchor>
      </Group>
    );
  }
}
