import { createScriptTag } from './script';

describe('Script Utils', () => {
  beforeEach(() => {
    // Reset the DOM
    document.getElementsByTagName('html')[0].innerHTML = '';
  });

  test('createScriptTag', () => {
    expect(document.getElementsByTagName('script').length).toBe(0);
    createScriptTag('test.js');
    expect(document.getElementsByTagName('script').length).toBe(1);
  });
});
