import { formatDateTime } from './format';

test('formatDateTime', () => {
  jest.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('foo');

  expect(formatDateTime(undefined)).toEqual('');
  expect(formatDateTime(new Date('2020-01-01T12:00:00Z'))).toEqual('foo');
  expect(formatDateTime('2020-01-01T12:00:00Z')).toEqual('foo');
});
