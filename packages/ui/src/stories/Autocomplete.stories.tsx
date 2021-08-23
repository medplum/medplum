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
  'Barack Obama'
];

export default {
  title: 'Medplum/Autocomplete',
  component: Autocomplete,
} as Meta;

export const Single = () => (
  <Document>
    <Autocomplete
      name="foo"
      loadOptions={async (input: string) => presidents.filter(s => s.toLowerCase().includes(input.toLowerCase()))}
      getId={(option: string) => option}
      getDisplay={(option: string) => (
        <div>{option}</div>
      )}
    />
  </Document>
);

export const Multiple = () => (
  <Document>
    <Autocomplete
      name="foo"
      multiple={true}
      loadOptions={async (input: string) => presidents.filter(s => s.toLowerCase().includes(input.toLowerCase()))}
      getId={(option: string) => option}
      getDisplay={(option: string) => (
        <div>{option}</div>
      )}
    />
  </Document>
);

export const Prefilled = () => (
  <Document>
    <Autocomplete
      name="foo"
      defaultValue={['Barack Obama']}
      loadOptions={async (input: string) => presidents.filter(s => s.toLowerCase().includes(input.toLowerCase()))}
      getId={(option: string) => option}
      getDisplay={(option: string) => (
        <div>{option}</div>
      )}
    />
  </Document>
);
