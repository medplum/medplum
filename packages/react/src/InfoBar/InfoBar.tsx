// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ScrollArea, Skeleton } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
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

export interface InfoBarSkeletonProps {
  readonly withAvatar?: boolean;
  readonly entries?: number;
}

const SKELETON_VALUE_WIDTHS = [120, 90, 50, 60, 40, 110, 220, 90];

/**
 * Loading placeholder that mirrors the InfoBar layout: an optional avatar followed by
 * key/value entries of varying width.
 * @param props - The skeleton props.
 * @returns The InfoBarSkeleton React node.
 */
export function InfoBarSkeleton(props: InfoBarSkeletonProps): JSX.Element {
  const entries = props.entries ?? 6;
  return (
    <ScrollArea>
      <div data-testid="info-bar-skeleton" className={classes.root}>
        {props.withAvatar && <Skeleton circle height={56} mr={8} style={{ flexShrink: 0 }} />}
        {Array.from({ length: entries }, (_, index) => (
          <InfoBar.Entry key={index}>
            <Skeleton height={10} width={SKELETON_VALUE_WIDTHS[index % SKELETON_VALUE_WIDTHS.length] * 0.6} mb={8} />
            <Skeleton height={16} width={SKELETON_VALUE_WIDTHS[index % SKELETON_VALUE_WIDTHS.length]} />
          </InfoBar.Entry>
        ))}
      </div>
    </ScrollArea>
  );
}
