import { Paper, PaperProps } from '@mantine/core';
import cx from 'clsx';
import classes from './Panel.module.css';

export interface PanelStylesParams {
  width?: number;
  fill?: boolean;
}

export interface PanelProps extends PaperProps {
  width?: number;
  fill?: boolean;
  children?: React.ReactNode;
}

export function Panel(props: PanelProps): JSX.Element {
  const { width, fill, className, children, ...rest } = props;
  const style = width ? { width } : undefined;
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
