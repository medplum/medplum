// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { copyElement, deleteElement, getElementKeys, isElementKey } from './element-keys';

describe('element-keys', () => {
  test('isElementKey', () => {
    expect(isElementKey('_birthDate', 'birthDate')).toBe(true);
    expect(isElementKey('birthDateTime', 'birthDate')).toBe(false);
    expect(isElementKey('valueString', 'value[x]')).toBe(true);
    expect(isElementKey('_valueDateTime', 'value[x]')).toBe(true);
    expect(isElementKey('valueQuantity', 'value[x]')).toBe(true);
    expect(isElementKey('valueSet', 'value[x]')).toBe(false);
    expect(isElementKey('value', 'value[x]')).toBe(false);
    expect(isElementKey('valueToString', 'value[x]')).toBe(false);
    expect(isElementKey('valueConstructor', 'value[x]')).toBe(false);
    expect(isElementKey('valuestring', 'value[x]')).toBe(false);
  });

  test('getElementKeys skips undefined values', () => {
    const obj = { valueString: 'a', _valueString: { id: '1' }, valueInteger: undefined, status: 'final' };
    expect(getElementKeys(obj, 'value[x]')).toStrictEqual(['valueString', '_valueString']);
    expect(getElementKeys(obj, 'status')).toStrictEqual(['status']);
  });

  test('deleteElement removes value and primitive extension, including undefined values', () => {
    const obj = { birthDate: '2000-01-01', _birthDate: { id: '1' }, gender: undefined, active: true };
    deleteElement(obj, 'birthDate');
    deleteElement(obj, 'gender');
    expect(obj).toStrictEqual({ active: true });
  });

  test('copyElement replaces element, including falsy values and choice types', () => {
    const target: Record<string, unknown> = { active: true, _active: { id: 't' }, multipleBirthBoolean: true };
    const source = { active: false, multipleBirthInteger: 0, _multipleBirthInteger: { id: 's' } };
    copyElement(target, source, 'active');
    copyElement(target, source, 'multipleBirth[x]');
    expect(target).toStrictEqual({ active: false, multipleBirthInteger: 0, _multipleBirthInteger: { id: 's' } });

    copyElement(target, undefined, 'active');
    expect(target).toStrictEqual({ multipleBirthInteger: 0, _multipleBirthInteger: { id: 's' } });
  });
});
