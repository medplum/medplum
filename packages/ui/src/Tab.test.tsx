import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { Document, Tab, TabBar, TabPanel, TabSwitch } from '.';

function TabTest() {
  const [value, setValue] = useState('first');
  return (
    <>
      <TabBar value={value} onChange={setValue}>
        <Tab name="first" label="First" />
        <Tab name="second" label="Second" />
        <Tab name="third" label="Third" />
        <div>only render tabs</div>
      </TabBar>
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
    render(
      <TabTest />
    );

    expect(screen.getByText('First')).not.toBeUndefined();
    expect(screen.getByText('First content')).not.toBeUndefined();
    expect(screen.queryByText('Second content')).toBeNull();
    expect(screen.queryByText('only render tabs')).toBeNull();

    await act(async () => {
      await fireEvent.click(screen.getByText('Second'));
    });

    expect(screen.getByText('Second')).not.toBeUndefined();
    expect(screen.getByText('Second content')).not.toBeUndefined();
    expect(screen.queryByText('First content')).toBeNull();
  });

});
