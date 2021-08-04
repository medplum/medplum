import React from 'react';
import ReactDOM from 'react-dom';
import { Logo } from './Logo';

test('Logo renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<Logo size={100} />, div);
});
