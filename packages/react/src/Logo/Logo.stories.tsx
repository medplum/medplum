import { Meta } from '@storybook/react';
import { Logo } from './Logo';

export default {
  title: 'Medplum/Logo',
  component: Logo,
} as Meta;

export const Basic = (): JSX.Element => <Logo size={200} />;
