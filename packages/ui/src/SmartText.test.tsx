import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { SmartText } from './SmartText';

test('SmartText renders', () => {
  const div = document.createElement('div');
  ReactDOM.render(<SmartText />, div);
});
