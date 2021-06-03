import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Button } from './Button';

test('Button renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<Button>test</Button>, div);
});
