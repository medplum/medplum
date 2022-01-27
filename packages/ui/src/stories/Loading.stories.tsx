import { Meta } from '@storybook/react';
import React from 'react';
import { Loading } from '../Loading';

export default {
  title: 'Medplum/Loading',
  component: Loading,
} as Meta;

export const Example = (): JSX.Element => <Loading />;
