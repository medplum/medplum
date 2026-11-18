// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { render } from '../../test-utils/render';
import { FaxSelectEmpty } from './FaxSelectEmpty';

describe('FaxSelectEmpty', () => {
  test('Prompts the user to pick a fax', () => {
    render(<FaxSelectEmpty />);

    expect(screen.getByText('No fax selected')).toBeInTheDocument();
    expect(screen.getByText('Select a fax from the list to view its contents and details')).toBeInTheDocument();
  });
});
