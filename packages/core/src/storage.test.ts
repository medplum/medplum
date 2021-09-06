import { MemoryStorage } from './storage';

describe('MemoryStorage', () => {

  test('Get string', () => {
    const storage = new MemoryStorage();
    storage.setString('foo', 'bar');
    expect(storage.getString('foo')).toEqual('bar');
  });

  test('Get object', () => {
    const obj = {
      key: 'value'
    };

    const storage = new MemoryStorage();
    storage.setObject('foo', obj);
    expect(storage.getObject('foo')).toMatchObject(obj);
  });

});