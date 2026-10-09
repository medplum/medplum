// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconReportMedical } from '@tabler/icons-react';
import type { CSSProperties, JSX } from 'react';
import classes from './VisitTypeIcon.module.css';

export interface VisitTypeIconProps {
  readonly color: string;
}

export function VisitTypeIcon(props: VisitTypeIconProps): JSX.Element {
  const style = {
    '--visit-type-bar': `var(--mantine-color-${props.color}-6)`,
  } as CSSProperties;
  return (
    <span className={classes.icon} style={style} aria-hidden="true">
      <IconReportMedical size={14} />
    </span>
  );
}
