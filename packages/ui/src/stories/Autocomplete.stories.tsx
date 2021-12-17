import { Meta } from '@storybook/react';
import React from 'react';
import { Autocomplete } from '../Autocomplete';
import { Document } from '../Document';

const presidents = [
  'George Washington',
  'John Adams',
  'Thomas Jefferson',
  'James Madison',
  'James Monroe',
  'John Quincy Adams',
  'Andrew Jackson',
  'Martin Van Buren',
  'William Henry Harrison',
  'John Tyler',
  'James K. Polk',
  'Zachary Taylor',
  'Millard Fillmore',
  'Franklin Pierce',
  'James Buchanan',
  'Abraham Lincoln',
  'Andrew Johnson',
  'Ulysses S. Grant',
  'Rutherford B. Hayes',
  'James A. Garfield',
  'Chester A. Arthur',
  'Grover Cleveland',
  'Benjamin Harrison',
  'William McKinley',
  'Theodore Roosevelt',
  'William Howard Taft',
  'Woodrow Wilson',
  'Warren G. Harding',
  'Calvin Coolidge',
  'Herbert Hoover',
  'Franklin D. Roosevelt',
  'Harry S. Truman',
  'Dwight D. Eisenhower',
  'John F. Kennedy',
  'Lyndon B. Johnson',
  'Richard Nixon',
  'Gerald Ford',
  'Jimmy Carter',
  'Ronald Reagan',
  'George H. W. Bush',
  'Bill Clinton',
  'George W. Bush',
  'Barack Obama',
];

export default {
  title: 'Medplum/Autocomplete',
  component: Autocomplete,
} as Meta;

async function search(input: string): Promise<string[]> {
  return presidents.filter((s) => s.toLowerCase().includes(input.toLowerCase())).slice(0, 10);
}

export const Single = () => (
  <Document>
    <Autocomplete
      name="foo"
      loadOptions={search}
      getId={(option: string) => option}
      getDisplay={(option: string) => <div>{option}</div>}
    />
  </Document>
);

export const Multiple = () => (
  <Document>
    <Autocomplete
      name="foo"
      multiple={true}
      loadOptions={search}
      getId={(option: string) => option}
      getDisplay={(option: string) => <div>{option}</div>}
    />
  </Document>
);

export const Prefilled = () => (
  <Document>
    <Autocomplete
      name="foo"
      defaultValue={['Barack Obama']}
      loadOptions={search}
      getId={(option: string) => option}
      getDisplay={(option: string) => <div>{option}</div>}
    />
  </Document>
);

export const HelpText = () => (
  <Document>
    <Autocomplete
      name="foo"
      loadOptions={search}
      getId={(option: string) => option}
      getDisplay={(option: string) => <div>{option}</div>}
      getHelpText={(option: string) => option.length + ' chars'}
    />
  </Document>
);
