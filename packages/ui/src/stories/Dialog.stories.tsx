import { Meta } from '@storybook/react';
import React, { useState } from 'react';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { Document } from '../Document';

export default {
  title: 'Medplum/Dialog',
  component: Dialog,
} as Meta;

export const Basic = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  return (
    <Document>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>
      <Dialog
        title="Dialog Title"
        visible={open}
        onOk={() => {
          alert('OK');
          setOpen(false);
        }}
        onCancel={() => {
          alert('Cancel');
          setOpen(false);
        }}
      >
        <div style={{ padding: '20px 50px' }}>Hello world!</div>
      </Dialog>
    </Document>
  );
};
