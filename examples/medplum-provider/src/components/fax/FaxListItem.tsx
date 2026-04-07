// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Stack, Text } from '@mantine/core';
import { formatDate, getDisplayString } from '@medplum/core';
import type { Communication, Organization } from '@medplum/fhirtypes';
import { MedplumLink, useResource } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import { formatFaxNumber } from './fax.utils';
import classes from './FaxListItem.module.css';

export type FaxTab = 'inbox' | 'sent';

interface FaxListItemProps {
  fax: Communication;
  selectedFax: Communication | undefined;
  activeTab: FaxTab;
  getFaxUri: (fax: Communication) => string;
  hideDivider?: boolean;
}

function getRecipientDisplay(fax: Communication, recipient: Organization | undefined): string {
  if (!fax.recipient?.[0]) {
    return 'Unknown recipient';
  }
  const ref = fax.recipient[0];
  if (recipient?.resourceType === 'Organization' && recipient.name === 'Fax Recipient') {
    const faxNumber = recipient.contact?.[0]?.telecom?.find((t) => t.system === 'fax')?.value;
    return faxNumber ? formatFaxNumber(faxNumber) : (ref.display ?? 'Unknown recipient');
  }
  const display = ref.display ?? 'Unknown recipient';
  return display && /^\d[\d\s\-+()]*$/.test(display.replace(/\s/g, '')) ? formatFaxNumber(display) : display;
}

export function FaxListItem({ fax, selectedFax, activeTab, getFaxUri, hideDivider }: FaxListItemProps): JSX.Element {
  const isSelected = selectedFax?.id === fax.id;
  const patient = useResource(fax.subject);
  const recipient = useResource(activeTab === 'sent' ? fax.recipient?.[0] : undefined);
  const faxUrl = getFaxUri(fax);

  const firstLine =
    activeTab === 'sent' ? getRecipientDisplay(fax, recipient as Organization | undefined) : getSenderOrRecipient(fax);

  const subjectLine = fax.topic?.text ?? '(No Subject)';
  const datePatientParts = [fax.sent ? formatDate(fax.sent) : null, patient ? getDisplayString(patient) : null].filter(
    Boolean
  );
  const datePatientLine = datePatientParts.length > 0 ? datePatientParts.join(' · ') : null;

  return (
    <div className={cx(classes.itemWrapper, { [classes.hideDivider]: hideDivider })}>
      <MedplumLink to={faxUrl} underline="never">
        <Group
          align="center"
          wrap="nowrap"
          className={cx(classes.contentContainer, {
            [classes.selected]: isSelected,
          })}
        >
          <Stack gap={0} flex={1}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Text fw={700} className={classes.title} flex={1}>
                {firstLine}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {subjectLine}
            </Text>
            {datePatientLine && (
              <Text size="sm" c="dimmed">
                {datePatientLine}
              </Text>
            )}
          </Stack>
        </Group>
      </MedplumLink>
    </div>
  );
}

function getSenderOrRecipient(fax: Communication): string {
  const originatingFaxNumber = fax.extension?.find(
    (ext) => ext.url === 'https://efax.com/originating-fax-number'
  )?.valueString;

  if (fax.sender?.display) {
    return fax.sender.display;
  }
  if (originatingFaxNumber) {
    return formatFaxNumber(originatingFaxNumber);
  }
  return 'Unknown Sender';
}
