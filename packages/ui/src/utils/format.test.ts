import { formatDateTime } from './format';

describe('Format utils', () => {

  test('formatDateTime', () => {
    jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('foo');

    expect(formatDateTime(undefined)).toEqual('');
    expect(formatDateTime('')).toEqual('');
    expect(formatDateTime('2020-01-01T12:00:00Z')).toEqual('foo');
  });

});
