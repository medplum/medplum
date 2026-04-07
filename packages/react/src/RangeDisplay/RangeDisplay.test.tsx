// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, screen } from '../test-utils/render';
import { RangeDisplay } from './RangeDisplay';

describe('RangeDisplay', () => {
  test('Renders', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } }} />);
    expect(screen.getByText('5 - 10 mg')).toBeInTheDocument();
  });

  test('Renders low only', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' } }} />);
    expect(screen.getByText('>= 5 mg')).toBeInTheDocument();
  });

  test('Renders high only', () => {
    render(<RangeDisplay value={{ high: { value: 10, unit: 'mg' } }} />);
    expect(screen.getByText('<= 10 mg')).toBeInTheDocument();
  });

  test('Renders undefined value', () => {
    render(<RangeDisplay />);
  });

  test('Renders empty range', () => {
    render(<RangeDisplay value={{}} />);
  });

  test('Renders with precision', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' }, high: { value: 10, unit: 'mg' } }} precision={1} />);
    expect(screen.getByText('5.0 - 10.0 mg')).toBeInTheDocument();
  });

  test('Renders exclusive low-only range', () => {
    render(<RangeDisplay value={{ low: { value: 5, unit: 'mg' } }} precision={0} exclusive />);
    expect(screen.getByText('> 4 mg')).toBeInTheDocument();
  });
});
