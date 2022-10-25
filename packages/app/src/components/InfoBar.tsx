import { createStyles, ScrollArea } from '@mantine/core';
import React from 'react';

const useStyles = createStyles((theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '8px 10px',
  },

  entry: {
    display: 'inline-block',
    margin: '5px 20px 5px 5px',
  },

  key: {
    color: theme.colors.gray[6],
    textTransform: 'uppercase',
    fontSize: theme.fontSizes.xs,
    whiteSpace: 'nowrap',
  },

  value: {
    fontSize: theme.fontSizes.md,
    fontWeight: 600,
    marginLeft: 0,
    whiteSpace: 'nowrap',
  },
}));

export interface InfoBarProps {
  children: React.ReactNode;
}

export function InfoBar(props: InfoBarProps): JSX.Element {
  const { classes } = useStyles();
  return (
    <ScrollArea>
      <div className={classes.root}>{props.children}</div>
    </ScrollArea>
  );
}

export interface InfoBarEntryProps {
  children: React.ReactNode;
}

InfoBar.Entry = function InfoBarEntry(props: InfoBarEntryProps): JSX.Element {
  const { classes } = useStyles();
  return <div className={classes.entry}>{props.children}</div>;
};

export interface InfoBarKeyProps {
  children: React.ReactNode;
}

InfoBar.Key = function InfoBarEntry(props: InfoBarKeyProps): JSX.Element {
  const { classes } = useStyles();
  return <div className={classes.key}>{props.children}</div>;
};

export interface InfoBarValueProps {
  children: React.ReactNode;
}

InfoBar.Value = function InfoBarEntry(props: InfoBarValueProps): JSX.Element {
  const { classes } = useStyles();
  return <div className={classes.value}>{props.children}</div>;
};
