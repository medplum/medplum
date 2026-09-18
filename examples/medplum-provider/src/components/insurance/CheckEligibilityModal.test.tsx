// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Notifications, notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { Coverage, Organization, PractitionerRole } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient, TestOrganization } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderResult } from '../../test-utils/render';
import { render, screen, userEvent, waitFor } from '../../test-utils/render';
import { BILLING_ORGANIZATION_IDENTIFIER_VALUE, MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM } from '../../utils/billing';
import type { CheckEligibilityModalProps } from './CheckEligibilityModal';
import { CheckEligibilityModal } from './CheckEligibilityModal';

function mockSubmit(medplum: MockClient, result: () => Promise<unknown>): ReturnType<typeof vi.spyOn> {
  const original = medplum.post.bind(medplum);
  return vi.spyOn(medplum, 'post').mockImplementation((url, ...rest) => {
    if (url.toString().endsWith('$submit')) {
      return result();
    }
    return original(url, ...rest);
  });
}

describe('CheckEligibilityModal', () => {
  let medplum: MockClient;
  let uhc: WithId<Coverage>;
  let bcbs: WithId<Coverage>;

  beforeEach(async () => {
    vi.clearAllMocks();
    notifications.clean();
    notifications.cleanQueue();
    medplum = new MockClient();
    uhc = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(HomerSimpson),
      payor: [{ ...createReference(TestOrganization), display: 'United Healthcare' }],
      subscriberId: 'UHC-SUB-001',
    });
    bcbs = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(HomerSimpson),
      payor: [{ display: 'Blue Cross Blue Shield' }],
    });
  });

  async function createPractitionerRole(): Promise<WithId<PractitionerRole>> {
    return medplum.createResource<PractitionerRole>({
      resourceType: 'PractitionerRole',
      practitioner: createReference(DrAliceSmith),
      organization: createReference(TestOrganization),
    });
  }

  function setup(
    props: Partial<CheckEligibilityModalProps> = {}
  ): RenderResult & { props: CheckEligibilityModalProps } {
    const allProps: CheckEligibilityModalProps = {
      opened: true,
      onClose: vi.fn(),
      patient: createReference(HomerSimpson),
      onCreated: vi.fn(),
      ...props,
    };
    const result = render(
      <MedplumProvider medplum={medplum}>
        <Notifications />
        <CheckEligibilityModal {...allProps} />
      </MedplumProvider>
    );
    return { ...result, props: allProps };
  }

  test('Preselects the default coverage', async () => {
    setup({ defaultCoverageId: uhc.id });

    expect(await screen.findByDisplayValue('United Healthcare · UHC-SUB-001')).toBeInTheDocument();
  });

  test('Falls back to the first active coverage without a default', async () => {
    setup();

    const input = await screen.findByPlaceholderText('Select coverage');
    await waitFor(() => expect(input).not.toHaveValue(''));
    expect(['United Healthcare · UHC-SUB-001', 'Blue Cross Blue Shield']).toContain((input as HTMLInputElement).value);
  });

  test('Offers the patient active coverages but not self-pay', async () => {
    const user = userEvent.setup();
    await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: createReference(HomerSimpson),
      payor: [createReference(HomerSimpson)],
      type: { coding: [{ code: 'SELFPAY', display: 'Self Pay' }], text: 'Self Pay' },
    });
    await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'cancelled',
      beneficiary: createReference(HomerSimpson),
      payor: [{ display: 'Old Payer' }],
    });
    setup({ defaultCoverageId: uhc.id });

    await user.click(await screen.findByDisplayValue('United Healthcare · UHC-SUB-001'));

    expect(await screen.findByRole('option', { name: 'Blue Cross Blue Shield', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'United Healthcare · UHC-SUB-001', hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Self Pay', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Old Payer', hidden: true })).not.toBeInTheDocument();
  });

  test('Includes an inactive default coverage so it can still be checked', async () => {
    const cancelled = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'cancelled',
      beneficiary: createReference(HomerSimpson),
      payor: [{ display: 'Old Payer' }],
    });
    setup({ defaultCoverageId: cancelled.id });

    expect(await screen.findByDisplayValue('Old Payer')).toBeInTheDocument();
  });

  test('Disables the submit button when the patient has no coverages', async () => {
    const other = await medplum.createResource({ resourceType: 'Patient', name: [{ family: 'Other' }] });
    setup({ patient: createReference(other) });

    expect(await screen.findByRole('button', { name: 'Check Eligibility' })).toBeDisabled();
  });

  test('Creates, submits, reports and closes on success', async () => {
    const user = userEvent.setup();
    await createPractitionerRole();
    const postSpy = mockSubmit(medplum, () => Promise.resolve({}));
    const { props } = setup({ defaultCoverageId: uhc.id });

    expect(await screen.findByText(TestOrganization.name as string)).toBeInTheDocument();
    await user.click(await screen.findByDisplayValue('United Healthcare · UHC-SUB-001'));
    await user.click(await screen.findByRole('option', { name: 'Blue Cross Blue Shield', hidden: true }));
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    const saved = vi.mocked(props.onCreated).mock.calls[0][0];
    expect(saved).toMatchObject({
      resourceType: 'CoverageEligibilityRequest',
      purpose: ['benefits'],
      patient: createReference(HomerSimpson),
      provider: createReference(TestOrganization),
      insurance: [{ focal: true, coverage: createReference(bcbs) }],
    });
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('CoverageEligibilityRequest', saved.id, '$submit'));
    expect(props.onClose).toHaveBeenCalled();
  });

  test('Reports the request even when $submit fails', async () => {
    const user = userEvent.setup();
    await createPractitionerRole();
    mockSubmit(medplum, () => Promise.reject(new Error('Payer unavailable')));
    const { props } = setup({ defaultCoverageId: uhc.id });

    await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    expect(await screen.findByText('Payer unavailable')).toBeInTheDocument();
    expect(props.onCreated).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  test('Shows the bot errorMessage when $submit returns a runtime error payload', async () => {
    const user = userEvent.setup();
    await createPractitionerRole();
    const payload = {
      errorType: 'Error',
      errorMessage: 'coverageEligibilityRequest.provider required',
      trace: ['Error: coverageEligibilityRequest.provider required'],
    };
    mockSubmit(medplum, () => Promise.reject(new OperationOutcomeError(badRequest(JSON.stringify(payload)))));
    const { props } = setup({ defaultCoverageId: uhc.id });

    await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    expect(await screen.findByText('coverageEligibilityRequest.provider required')).toBeInTheDocument();
    expect(screen.queryByText(/errorType/)).not.toBeInTheDocument();
    expect(props.onCreated).toHaveBeenCalled();
  });

  test('Uses the practitioner as provider without a PractitionerRole', async () => {
    const user = userEvent.setup();
    mockSubmit(medplum, () => Promise.resolve({}));
    const { props } = setup({ defaultCoverageId: uhc.id });

    await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
    await screen.findByRole('searchbox');
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(vi.mocked(props.onCreated).mock.calls[0][0]).toMatchObject({ provider: createReference(DrAliceSmith) });
  });

  test('Uses the practitioner as provider when the PractitionerRole has no organization', async () => {
    const user = userEvent.setup();
    await medplum.createResource<PractitionerRole>({
      resourceType: 'PractitionerRole',
      practitioner: createReference(DrAliceSmith),
    });
    mockSubmit(medplum, () => Promise.resolve({}));
    const { props } = setup({ defaultCoverageId: uhc.id });

    await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
    await screen.findByRole('searchbox');
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(vi.mocked(props.onCreated).mock.calls[0][0]).toMatchObject({ provider: createReference(DrAliceSmith) });
  });

  test('Uses the picked billing organization as provider', async () => {
    const user = userEvent.setup();
    const billingOrg = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Springfield Billing Group',
      identifier: [{ system: MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM, value: BILLING_ORGANIZATION_IDENTIFIER_VALUE }],
    });
    mockSubmit(medplum, () => Promise.resolve({}));
    const { props } = setup({ defaultCoverageId: uhc.id });

    await screen.findByDisplayValue('United Healthcare · UHC-SUB-001');
    await user.type(await screen.findByRole('searchbox'), 'Springfield');
    await user.click(await screen.findByText('Springfield Billing Group'));
    await user.click(screen.getByRole('button', { name: 'Check Eligibility' }));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalled());
    expect(vi.mocked(props.onCreated).mock.calls[0][0]).toMatchObject({ provider: createReference(billingOrg) });
  });
});
