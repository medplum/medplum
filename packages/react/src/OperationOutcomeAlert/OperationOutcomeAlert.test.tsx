// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk } from '@medplum/core';
import type { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { render, screen } from '../test-utils/render';
import { OperationOutcomeAlert } from './OperationOutcomeAlert';

describe('OperationOutcomeAlert', () => {
  test('renders nothing when no issue or outcome is provided', () => {
    render(<OperationOutcomeAlert />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('renders nothing with an empty issues list', () => {
    render(<OperationOutcomeAlert issues={[]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('renders each issue present in an OperationOutcome', () => {
    const outcome = {
      resourceType: 'OperationOutcome',
      issue: [
        { severity: 'fatal', code: 'invalid', details: { text: 'Major issue detected' } },
        { severity: 'warning', code: 'invalid', details: { text: 'Minor issue detected' } },
      ],
    } satisfies OperationOutcome;
    render(<OperationOutcomeAlert outcome={outcome} />);
    expect(screen.queryByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Major issue detected')).toBeInTheDocument();
    expect(screen.getByText('Minor issue detected')).toBeInTheDocument();
  });

  test('renders each issue present in an `issues` list', () => {
    const issues = [
      { severity: 'fatal', code: 'invalid', details: { text: 'Major issue detected' } },
      { severity: 'warning', code: 'invalid', details: { text: 'Minor issue detected' } },
    ] satisfies OperationOutcomeIssue[];
    render(<OperationOutcomeAlert issues={issues} />);
    expect(screen.queryByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Major issue detected')).toBeInTheDocument();
    expect(screen.getByText('Minor issue detected')).toBeInTheDocument();
  });

  test('renders nothing for an "OK" outcome', () => {
    render(<OperationOutcomeAlert outcome={allOk} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('renders an "OK" outcome when `displayOkOutcomes` is set', () => {
    render(<OperationOutcomeAlert outcome={allOk} displayOkOutcomes />);
    expect(screen.queryByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('All OK')).toBeInTheDocument();
  });

  test('forwards additional props to the Alert component', () => {
    const outcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'fatal', code: 'invalid', details: { text: 'Major issue detected' } }],
    } satisfies OperationOutcome;

    render(<OperationOutcomeAlert outcome={outcome} title="Search Problem" />);
    expect(screen.queryByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Search Problem')).toBeInTheDocument();
    expect(screen.getByText('Major issue detected')).toBeInTheDocument();
  });
});
