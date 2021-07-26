import React from 'react';
import ReactDOM from 'react-dom';
import { Loading } from './Loading';

test('Loading renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<Loading />, div);
});
