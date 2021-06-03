import { ensureKeys, generateKey } from "./FormUtils";

test('Generate unique key', () => {
  const key1 = generateKey();
  expect(key1).not.toBeNull();
  expect(key1.length).toEqual(6);

  const key2 = generateKey();
  expect(key2).not.toBeNull();
  expect(key2.length).toEqual(6);
  expect(key2).not.toEqual(key1);
});

test('Ensure array elements have keys', () => {
  const myArray: any[] = [
    { id: '123' },
    { id: '456' },
  ];

  ensureKeys(myArray);
  expect((myArray[0].__key as string).length).toEqual(6);
  expect((myArray[1].__key as string).length).toEqual(6);
});
