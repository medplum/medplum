import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { HumanNameInput } from './HumanNameInput';

test('HumanNameInput renders', () => {
  render(
    <HumanNameInput name="test" value={{ given: ['Alice'], family: 'Smith' }} />
  );

  const given = screen.getByTestId('given') as HTMLInputElement;
  expect(given).not.toBeUndefined();
  expect(given.value).toEqual('Alice');

  const family = screen.getByTestId('family') as HTMLInputElement;
  expect(family).not.toBeUndefined();
  expect(family.value).toEqual('Smith');
});

test('HumanNameInput change events', async (done) => {
  render(
    <HumanNameInput name="test" value={{}} />
  );

  await act(async () => {
    fireEvent.change(screen.getByTestId('use'), { target: { value: 'official' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('prefix'), { target: { value: 'Mr' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('given'), { target: { value: 'Homer J' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('family'), { target: { value: 'Simpson' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('suffix'), { target: { value: 'Sr' } });
  });

  const hidden = screen.getByTestId('hidden') as HTMLInputElement;
  expect(hidden).not.toBeUndefined();
  expect(JSON.parse(hidden.value)).toMatchObject({
    use: 'official',
    prefix: ['Mr'],
    given: ['Homer', 'J'],
    family: 'Simpson',
    suffix: ['Sr']
  });
  done();
});

test('HumanNameInput set blanks', async (done) => {
  render(
    <HumanNameInput name="test" value={{
      use: 'official',
      prefix: ['Mr'],
      given: ['Homer', 'J'],
      family: 'Simpson',
      suffix: ['Sr']
    }} />
  );

  await act(async () => {
    fireEvent.change(screen.getByTestId('use'), { target: { value: '' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('prefix'), { target: { value: '' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('given'), { target: { value: '' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('family'), { target: { value: '' } });
  });

  await act(async () => {
    fireEvent.change(screen.getByTestId('suffix'), { target: { value: '' } });
  });

  const hidden = screen.getByTestId('hidden') as HTMLInputElement;
  expect(hidden).not.toBeUndefined();
  expect(hidden.value).toEqual('{}');
  done();
});
