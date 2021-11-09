import { tokenizer } from './tokenize';

describe('Tokenizer', () => {
  test('Simple string matching', () => {
    const matches = tokenizer.tokenize('  (  + ) /   ( *  ');
    expect(matches).toMatchObject([
      { id: '(', value: '(' },
      { id: '+', value: '+' },
      { id: ')', value: ')' },
      { id: '/', value: '/' },
      { id: '(', value: '(' },
      { id: '*', value: '*' }
    ]);
  });

  test('Quantity matching', () => {
    expect(tokenizer.tokenize("1 'mg'")).toMatchObject([{ id: 'Quantity', value: "1 'mg'" }]);
  });

  test('Number matching', () => {
    expect(tokenizer.tokenize('1')).toMatchObject([{ id: 'Number', value: '1' }]);
    expect(tokenizer.tokenize('1.0')).toMatchObject([{ id: 'Number', value: '1.0' }]);
    expect(tokenizer.tokenize('-1')).toMatchObject([{ id: 'Number', value: '-1' }]);
    expect(tokenizer.tokenize('-1.0')).toMatchObject([{ id: 'Number', value: '-1.0' }]);
  });

  test('DateTime matching', () => {
    expect(tokenizer.tokenize('@2012-04-15T15:00:00+02:00')).toMatchObject([{ id: 'DateTime', value: '@2012-04-15T15:00:00+02:00' }]);
  });

  test.skip('Regular expression matching', () => {
    const matches = tokenizer.tokenize('bc + dsf -  // the comment + - dasdas');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'bc' },
      { id: '+', value: '+' },
      { id: 'Symbol', value: 'dsf' },
      { id: '-', value: '-' },
      { id: 'Comment', value: '// the comment + - dasdas' }
    ]);
  });

  test('Throws on empty string', () => {
    expect(() => tokenizer.tokenize('')).toThrowError('Could not tokenize');
  });

  test('FHIR Path', () => {
    const matches = tokenizer.tokenize('Patient.name.given');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' }
    ]);
  });

  test('FHIR Path union', () => {
    const matches = tokenizer.tokenize('Practitioner.name.given | Patient.name.given');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Practitioner' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' },
      { id: '|', value: '|' },
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' }
    ]);
  });

  test('FHIR Path function', () => {
    const matches = tokenizer.tokenize('Patient.telecom.where(system=\'email\')');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'telecom' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'where' },
      { id: '(', value: '(' },
      { id: 'Symbol', value: 'system' },
      { id: '=', value: '=' },
      { id: 'String', value: '\'email\'' },
      { id: ')', value: ')' }
    ]);
  });

});
