import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { Document } from './Document';
import { Tab } from './Tab';
import { TabList } from './TabList';
import { TabPanel } from './TabPanel';
import { TabSwitch } from './TabSwitch';

function TabTest() {
  const [value, setValue] = useState('first');
  return (
    <>
      <TabList value={value} onChange={setValue}>
        <Tab name="first" label="First" />
        <Tab name="second" label="Second" />
        <Tab name="third" label="Third" />
        <div>only render tabs</div>
      </TabList>
      <Document>
        <TabSwitch value={value}>
          <TabPanel name="first">First content</TabPanel>
          <TabPanel name="second">Second content</TabPanel>
          <TabPanel name="third">Third content</TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}

describe('Tab', () => {
  test('Renders', async () => {
    render(<TabTest />);

    expect(screen.getByText('First')).toBeDefined();
    expect(screen.getByText('First content')).toBeDefined();
    expect(screen.queryByText('Second content')).toBeNull();
    expect(screen.queryByText('only render tabs')).toBeNull();

    await act(async () => {
      await fireEvent.click(screen.getByText('Second'));
    });

    expect(screen.getByText('Second')).toBeDefined();
    expect(screen.getByText('Second content')).toBeDefined();
    expect(screen.queryByText('First content')).toBeNull();
  });
});
