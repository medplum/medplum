import { Meta } from '@storybook/react';
import React, { useState } from 'react';
import { Document } from '../Document';
import { Tab } from '../Tab';
import { TabList } from '../TabList';
import { TabPanel } from '../TabPanel';
import { TabSwitch } from '../TabSwitch';

export default {
  title: 'Medplum/Tabs',
  component: Tab,
} as Meta;

export const Basic = (): JSX.Element => {
  const [value, setValue] = useState('item1');
  return (
    <>
      <TabList value={value} onChange={setValue}>
        <Tab name="item1" label="Item 1" />
        <Tab name="item2" label="Item 2" />
        <Tab name="item3" label="Item 3" />
      </TabList>
      <Document>
        <TabSwitch value={value}>
          <TabPanel name="item1">This is item #1!</TabPanel>
          <TabPanel name="item2">
            <strong>Panel number two</strong>
          </TabPanel>
          <TabPanel name="item3">Three</TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
};

export const LongStrings = (): JSX.Element => {
  const [value, setValue] = useState('item1');
  return (
    <>
      <TabList value={value} onChange={setValue}>
        <Tab name="item1" label="Timeline" />
        <Tab name="item2" label="Details" />
        <Tab name="item3" label="Edit" />
        <Tab name="item4" label="History" />
        <Tab name="item5" label="Blame" />
        <Tab name="item6" label="JSON" />
        <Tab name="item7" label="Apps" />
        <Tab name="item8" label="KitchenSink" />
      </TabList>
      <Document>
        <TabSwitch value={value}>
          <TabPanel name="item1">This is item #1!</TabPanel>
          <TabPanel name="item2">
            <strong>Panel number two</strong>
          </TabPanel>
          <TabPanel name="item3">Three</TabPanel>
          <TabPanel name="item4">item4</TabPanel>
          <TabPanel name="item5">item5</TabPanel>
          <TabPanel name="item6">item6</TabPanel>
          <TabPanel name="item7">item7</TabPanel>
          <TabPanel name="item8">item8</TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
};
