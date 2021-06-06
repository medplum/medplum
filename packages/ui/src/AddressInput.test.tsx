import React from 'react';
import ReactDOM from 'react-dom';
import { AddressInput } from './AddressInput';

test('AddressInput renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<AddressInput name="a" value={{ line: ['123 main st'], city: 'Happy' }} />, div);
});

test('AddressInput renders undefined value', () => {
  const div = document.createElement('div');
  ReactDOM.render(<AddressInput name="a" />, div);
});
