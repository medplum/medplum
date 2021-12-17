import { ClientStorage, MemoryStorage } from './storage';

describe('Storage', () => {
  test('Using localStorage', () => {
    const storage = new ClientStorage();

    storage.clear();
    expect(storage.getString('foo')).toBeUndefined();
    expect(storage.getObject('baz')).toBeUndefined();

    storage.setString('foo', 'bar');
    expect(storage.getString('foo')).toEqual('bar');

    storage.setObject('baz', { name: 'Homer' });
    expect(storage.getObject('baz')).toMatchObject({ name: 'Homer' });

    storage.setString('foo', '');
    expect(storage.getString('foo')).toBeUndefined();

    storage.setObject('baz', null);
    expect(storage.getObject('baz')).toBeUndefined();
  });

  test('Using MemoryStorage', () => {
    const localStorage = global.localStorage;
    Object.defineProperty(window, 'localStorage', { value: undefined });

    const storage = new ClientStorage();

    storage.clear();
    expect(storage.getString('foo')).toBeUndefined();
    expect(storage.getObject('baz')).toBeUndefined();

    storage.setString('foo', 'bar');
    expect(storage.getString('foo')).toEqual('bar');

    storage.setObject('baz', { name: 'Homer' });
    expect(storage.getObject('baz')).toMatchObject({ name: 'Homer' });

    storage.setString('foo', '');
    expect(storage.getString('foo')).toBeUndefined();

    storage.setObject('baz', null);
    expect(storage.getObject('baz')).toBeUndefined();

    Object.defineProperty(window, 'localStorage', { value: localStorage });
  });
});

describe('MemoryStorage', () => {
  test('Get string', () => {
    const storage = new MemoryStorage();
    expect(storage.length).toEqual(0);

    storage.setItem('foo', 'bar');
    expect(storage.getItem('foo')).toEqual('bar');
    expect(storage.length).toEqual(1);
    expect(storage.key(0)).toEqual('foo');

    storage.setItem('foo', '');
    expect(storage.getItem('foo')).toBeNull();
    expect(storage.length).toEqual(0);
  });
});
