import { Anchor } from '@mantine/core';
import { HomerSimpson } from '@medplum/mock';
import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { ResourceAvatar } from './ResourceAvatar';

export default {
  title: 'Medplum/ResourceAvatar',
  component: ResourceAvatar,
} as Meta;

export const Image = (): JSX.Element => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <ResourceAvatar alt="George Washington" src="./avatars/1.jpg" radius="xl" />
      <ResourceAvatar alt="Mona Lisa" src="./avatars/2.jpg" />
      <ResourceAvatar alt="Elmo" src="./avatars/3.jpg" />
    </div>
  </Document>
);

export const Letter = (): JSX.Element => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <ResourceAvatar alt="George Wasington" />
      <ResourceAvatar alt="Mona Lisa" color="blue" />
      <ResourceAvatar alt="Elmo" color="violet" />
    </div>
  </Document>
);

export const Sizes = (): JSX.Element => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <ResourceAvatar alt="Mona Lisa" src="/avatars/2.jpg" size="sm" />
      <ResourceAvatar alt="Mona Lisa" src="/avatars/2.jpg" />
      <ResourceAvatar alt="Mona Lisa" src="/avatars/2.jpg" size="lg" />
    </div>
  </Document>
);

export const LetterSizes = (): JSX.Element => (
  <Document>
    <div style={{ display: 'flex', width: 168, justifyContent: 'space-between' }}>
      <ResourceAvatar alt="George Wasington" size="sm" />
      <ResourceAvatar alt="George Wasington" color="blue" />
      <ResourceAvatar alt="George Wasington" color="violet" size="lg" />
    </div>
  </Document>
);

export const Resource = (): JSX.Element => (
  <Document>
    <ResourceAvatar value={HomerSimpson} />
  </Document>
);

export const WithText = (): JSX.Element => (
  <Document>
    <Anchor href="#">
      <div style={{ display: 'flex', width: 180, justifyContent: 'space-between' }}>
        <ResourceAvatar alt="George Washington" src="/avatars/1.jpg" />
        George Washington
      </div>
    </Anchor>
    <hr />
    <Anchor href="#">
      <div style={{ display: 'flex', width: 180, justifyContent: 'space-between' }}>
        <ResourceAvatar alt="George Washington" src="/avatars/1.jpg" />
        George Washington
        <br />
        View profile
      </div>
    </Anchor>
  </Document>
);
