import { Paper, PaperProps } from '@mantine/core';
import cx from 'clsx';
import { ReactNode } from 'react';
import classes from './Panel.module.css';

export interface PanelProps extends PaperProps {
  readonly width?: number;
  readonly fill?: boolean;
  readonly children?: ReactNode;
}

export function Panel(props: PanelProps): JSX.Element {
  const { width, fill, className, children, ...rest } = props;
  const style = width ? { maxWidth: width } : undefined;
  return (
    <Paper
      className={cx(classes.paper, fill && classes.fill, className)}
      style={style}
      shadow="sm"
      radius="sm"
      withBorder
      {...rest}
    >
      {children}
    </Paper>
  );
}
