import { IndexedStructureDefinition, Patient, Questionnaire, stringify } from '@medplum/core';
import { ensureKeys, generateKey, parseForm, parseResourceForm } from './FormUtils';

const patientStructureDefinition: IndexedStructureDefinition = {
  types: {
    Patient: {
      display: 'Patient',
      properties: {
        name: {
          id: 'Patient.name',
          type: [{
            code: 'HumanName'
          }],
          max: '*'
        },
        birthDate: {
          id: 'Patient.birthDate',
          type: [{
            code: 'date'
          }]
        }
      }
    }
  }
};

const questionnaireStructureDefinition: IndexedStructureDefinition = {
  types: {
    Questionnaire: {
      display: 'Questionnaire',
      properties: {
        name: {
          id: 'Questionnaire.name',
          type: [{
            code: 'string'
          }]
        },
        item: {
          id: 'Questionnaire.item',
          type: [{
            code: 'BackboneElement'
          }],
          max: '*'
        }
      }
    },
    QuestionnaireItem: {
      display: 'Questionnaire Item',
      properties: {
        text: {
          id: 'Questionnaire.item.text',
          type: [{
            code: 'string'
          }]
        }
      }
    }
  }
};

describe('FormUtils', () => {

  test('Generate unique key', () => {
    const key1 = generateKey();
    expect(key1).not.toBeNull();
    expect(key1.length).toEqual(4);

    const key2 = generateKey();
    expect(key2).not.toBeNull();
    expect(key2.length).toEqual(4);
    expect(key2).not.toEqual(key1);
  });

  test('Ensure array elements have keys', () => {
    const myArray: any[] = [
      { id: '123' },
      { id: '456' },
    ];

    ensureKeys(myArray);
    expect((myArray[0].__key as string).length).toEqual(4);
    expect((myArray[1].__key as string).length).toEqual(4);
  });

  test('Ensure keys on null array', () => {
    expect(ensureKeys(undefined)).toEqual([]);
  });

  test('Key replacer removes __key', () => {
    expect(stringify({ __key: 'foo' })).toEqual('{}');
  });

  test('Parse form into key/value pairs', () => {
    const form = document.createElement('form')
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

  test('Parse form into Patient resource', () => {
    const form = document.createElement('form')
    form.innerHTML = `
      <input type="text" name="name.key0" value="{&quot;given&quot;:[&quot;Alice&quot;]}" />
      <input type="text" name="birthDate" value="1990-01-01" />
      <input type="text" name="gender" value="" />
      <input type="text" name="unrecognized" value="" />
      <input type="text" name="disabled" disabled />
      <input type="checkbox" name="checkbox" />
      <input type="radio" name="radio" />
    `;

    const resource = parseResourceForm(patientStructureDefinition, 'Patient', form) as Patient;
    expect(resource).not.toBeNull();
    expect(resource.name?.[0].given).toEqual(['Alice']);
    expect(resource.birthDate).toEqual('1990-01-01');
  });

  test('Parse form into Questionnaire resource', () => {
    const form = document.createElement('form')
    form.innerHTML = `
      <input type="text" name="name" value="ABC" />
      <input type="text" name="item.key1.text" value="XYZ" />
      <input type="text" name="unrecognized.key2.text" value="XYZ" />
    `;

    const resource = parseResourceForm(questionnaireStructureDefinition, 'Questionnaire', form) as Questionnaire;
    expect(resource).not.toBeNull();
    expect(resource.name).toEqual('ABC');
    expect(resource.item?.length).toEqual(1);
    expect(resource.item?.[0]?.text).toEqual('XYZ');
  });

  test('Ensure keys handles null', () => {
    expect(ensureKeys([null])).toMatchObject([null]);
  });
});
