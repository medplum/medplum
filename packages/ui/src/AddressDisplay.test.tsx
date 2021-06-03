import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AddressDisplay } from './AddressDisplay';

test('AddressDisplay renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<AddressDisplay value={{ line: ['123 main st'], city: 'Happy' }} />, div);
});

test('AddressDisplay renders undefined value', () => {
  const div = document.createElement('div');
  ReactDOM.render(<AddressDisplay />, div);
});
