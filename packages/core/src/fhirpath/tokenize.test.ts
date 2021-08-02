import { tokenizer } from './tokenize';

test('Tokenizer can tokenize with simple string matching', () => {
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

test('Tokenizer can tokenize with regular expression matching', () => {
  const matches = tokenizer.tokenize('bc + dsf -  // the comment + - dasdas');
  expect(matches).toMatchObject([
    { id: 'Symbol', value: 'bc' },
    { id: '+', value: '+' },
    { id: 'Symbol', value: 'dsf' },
    { id: '-', value: '-' },
    { id: 'Comment', value: '// the comment + - dasdas' }
  ]);
});

test('Tokenize throws on empty string', () => {
  expect(() => tokenizer.tokenize('')).toThrowError('Could not tokenize');
});

test('Tokenizer can tokenize FHIR Path', () => {
  const matches = tokenizer.tokenize('Patient.name.given');
  expect(matches).toMatchObject([
    { id: 'Symbol', value: 'Patient' },
    { id: '.', value: '.' },
    { id: 'Symbol', value: 'name' },
    { id: '.', value: '.' },
    { id: 'Symbol', value: 'given' }
  ]);
});

test('Tokenizer can tokenize FHIR Path union', () => {
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

test('Tokenizer can tokenize FHIR Path function', () => {
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
    { id: 'StringLiteral', value: '\'email\'' },
    { id: ')', value: ')' }
  ]);
});
