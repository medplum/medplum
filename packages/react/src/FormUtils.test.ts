import { parseForm } from './FormUtils';

describe('FormUtils', () => {
  test('Parse form into key/value pairs', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" name="a" value="b" />
      <input type="text" name="a-disabled" value="b" disabled />
      <input type="checkbox" name="c" value="d" />
      <input type="checkbox" name="e" value="f" checked />
      <input type="radio" name="g" value="h" />
      <input type="radio" name="i" value="j" checked />
      <textarea name="k">l</textarea>
      <select name="m">
        <option value="n">n</option>
        <option value="o" selected>o</option>
      </select>
    `;

    const result = parseForm(form);
    expect(result).not.toBeNull();
    expect(result['a']).toEqual('b');
    expect(result['a-disabled']).toBeUndefined();
    expect(result['c']).toBeUndefined();
    expect(result['e']).toEqual('f');
    expect(result['g']).toBeUndefined();
    expect(result['i']).toEqual('j');
    expect(result['k']).toEqual('l');
    expect(result['m']).toEqual('o');
  });
});
