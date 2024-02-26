import { ScrollArea } from '@mantine/core';
import { ReactNode } from 'react';
import classes from './InfoBar.module.css';

export interface InfoBarProps {
  readonly children: ReactNode;
}

export function InfoBar(props: InfoBarProps): JSX.Element {
  return (
    <ScrollArea>
      <div className={classes.root}>{props.children}</div>
    </ScrollArea>
  );
}

export interface InfoBarEntryProps {
  readonly children: ReactNode;
}

InfoBar.Entry = function InfoBarEntry(props: InfoBarEntryProps): JSX.Element {
  return <div className={classes.entry}>{props.children}</div>;
};

export interface InfoBarKeyProps {
  readonly children: ReactNode;
}

InfoBar.Key = function InfoBarEntry(props: InfoBarKeyProps): JSX.Element {
  return <div className={classes.key}>{props.children}</div>;
};

export interface InfoBarValueProps {
  readonly children: ReactNode;
}

InfoBar.Value = function InfoBarEntry(props: InfoBarValueProps): JSX.Element {
  return <div className={classes.value}>{props.children}</div>;
};
