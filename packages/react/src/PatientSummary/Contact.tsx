import { ActionIcon, Box, Collapse, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { ContactPoint, Patient, Resource } from '@medplum/fhirtypes';
import { IconChevronDown, IconChevronRight, IconSquares } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import styles from './PatientSummary.module.css';

interface ContactProps {
  readonly patient: Patient;
  readonly onClickResource?: (resource: Resource) => void;
}

export function Contact(props: ContactProps): JSX.Element {
  const { patient } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState<{ address: boolean; phone: number | null; email: number | null }>({
    address: false,
    phone: null,
    email: null,
  });

  const address = patient.address?.[0];
  const phones = patient.telecom?.filter((t): t is ContactPoint => t.system === 'phone' && !!t.value) || [];
  const emails = patient.telecom?.filter((t): t is ContactPoint => t.system === 'email' && !!t.value) || [];

  const patientId = patient.id;

  // Build address string for copy
  let addressString = '';
  if (address) {
    if (address.line?.[0]) {
      addressString += address.line[0];
    }
    if (address.line?.[1]) {
      addressString += (addressString ? '\n' : '') + address.line[1];
    }
    if (address.city || address.state || address.postalCode) {
      addressString += addressString ? '\n' : '';
      addressString += address.city || '';
      if (address.state) {
        addressString += (address.city ? ', ' : '') + address.state;
      }
      if (address.postalCode) {
        addressString += (address.city || address.state ? ' ' : '') + address.postalCode;
      }
    }
  }

  function handleCopy(e: React.MouseEvent, value: string): void {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  }

  function handleCopyWithFeedback(
    e: React.MouseEvent,
    value: string,
    type: 'address' | 'phone' | 'email',
    index?: number
  ): void {
    handleCopy(e, value);
    if (type === 'address') {
      setCopied((prev) => ({ ...prev, address: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, address: false })), 1200);
    } else if (type === 'phone' && typeof index === 'number') {
      setCopied((prev) => ({ ...prev, phone: index }));
      setTimeout(() => setCopied((prev) => ({ ...prev, phone: null })), 1200);
    } else if (type === 'email' && typeof index === 'number') {
      setCopied((prev) => ({ ...prev, email: index }));
      setTimeout(() => setCopied((prev) => ({ ...prev, email: null })), 1200);
    }
  }

  return (
    <Box style={{ position: 'relative' }}>
      <UnstyledButton
        style={{
          width: '100%',
          cursor: 'default',
          '& .mantine-ActionIcon-root, & .mantine-Text-root': {
            cursor: 'pointer',
            margin: '0',
          },
        }}
      >
        <Group justify="space-between">
          <Group gap={8}>
            <ActionIcon
              variant="subtle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Show contact' : 'Hide contact'}
              style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              size="md"
            >
              <IconChevronDown size={20} />
            </ActionIcon>
            <Text fz="md" fw={800} onClick={() => setCollapsed((c) => !c)} style={{ cursor: 'pointer' }}>
              Contact
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
      <Collapse in={!collapsed}>
        <Box ml="36" mt="8" mb="16">
          {address && (
            <Box mb="sm">
              <Text size="xs" fw={500} color="gray.6">
                Address
              </Text>
              {(address.line?.[0] || address.line?.[1] || address.city || address.state || address.postalCode) && (
                <MedplumLink
                  to={`/Patient/${patientId}/edit`}
                  style={{ textDecoration: 'none', color: 'black', display: 'block' }}
                >
                  <Group
                    align="flex-start"
                    gap={0}
                    className={styles.patientSummaryListItem}
                    style={{ position: 'relative', minWidth: 0 }}
                  >
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      {address.line?.[0] && (
                        <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                          {address.line[0]}
                        </Text>
                      )}
                      {address.line?.[1] && (
                        <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                          {address.line[1]}
                        </Text>
                      )}
                      {(address.city || address.state || address.postalCode) && (
                        <Text size="sm" fw={500} truncate style={{ minWidth: 0 }}>
                          {address.city}
                          {address.state ? `, ${address.state}` : ''}
                          {address.postalCode ? ` ${address.postalCode}` : ''}
                        </Text>
                      )}
                    </Box>
                    <div className={styles.patientSummaryGradient} />
                    <div
                      className={styles.patientSummaryChevronContainer}
                      style={{
                        alignItems: 'flex-start',
                        display: 'flex',
                        width: 28,
                        minWidth: 28,
                        maxWidth: 28,
                        justifyContent: 'flex-end',
                        gap: 2,
                      }}
                    >
                      <Tooltip label="Copied!" withArrow={false} opened={copied.address}>
                        <ActionIcon
                          className={styles.patientSummaryChevron}
                          size="md"
                          variant="transparent"
                          tabIndex={-1}
                          onClick={(e) => handleCopyWithFeedback(e, addressString, 'address')}
                          aria-label="Copy address"
                        >
                          <IconSquares size={16} stroke={2.25} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon
                        className={styles.patientSummaryChevron}
                        size="md"
                        variant="transparent"
                        tabIndex={-1}
                      >
                        <IconChevronRight size={16} stroke={2.25} />
                      </ActionIcon>
                    </div>
                  </Group>
                </MedplumLink>
              )}
            </Box>
          )}
          {phones.length > 0 &&
            phones.map((phone, index) => (
              <Box key={index} mb="sm">
                <Text size="xs" fw={500} color="gray.6">
                  {phone.use ? `${phone.use.charAt(0).toUpperCase()}${phone.use.slice(1)} Phone` : 'Phone'}
                </Text>
                <MedplumLink
                  to={`/Patient/${patientId}/edit`}
                  style={{ textDecoration: 'none', color: 'black', display: 'block' }}
                >
                  <Group
                    align="center"
                    gap={0}
                    className={styles.patientSummaryListItem}
                    style={{ position: 'relative', minWidth: 0 }}
                  >
                    <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                      {phone.value}
                    </Text>
                    <div className={styles.patientSummaryGradient} />
                    <div
                      className={styles.patientSummaryChevronContainer}
                      style={{
                        alignItems: 'flex-start',
                        display: 'flex',
                        width: 28,
                        minWidth: 28,
                        maxWidth: 28,
                        justifyContent: 'flex-end',
                        gap: 2,
                      }}
                    >
                      <Tooltip label="Copied!" withArrow={false} opened={copied.phone === index}>
                        <ActionIcon
                          className={styles.patientSummaryChevron}
                          size="md"
                          variant="transparent"
                          tabIndex={-1}
                          onClick={(e) => handleCopyWithFeedback(e, phone.value ?? '', 'phone', index)}
                          aria-label="Copy phone"
                        >
                          <IconSquares size={16} stroke={2.5} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon
                        className={styles.patientSummaryChevron}
                        size="md"
                        variant="transparent"
                        tabIndex={-1}
                      >
                        <IconChevronRight size={16} stroke={2.25} />
                      </ActionIcon>
                    </div>
                  </Group>
                </MedplumLink>
              </Box>
            ))}
          {emails.length > 0 &&
            emails.map((email, index) => (
              <Box key={index} mb="sm">
                <Text size="xs" fw={500} color="gray.6">
                  {email.use ? `${email.use.charAt(0).toUpperCase()}${email.use.slice(1)} Email` : 'Email'}
                </Text>
                <MedplumLink
                  to={`/Patient/${patientId}/edit`}
                  style={{ textDecoration: 'none', color: 'black', display: 'block' }}
                >
                  <Group
                    align="center"
                    gap={0}
                    className={styles.patientSummaryListItem}
                    style={{ position: 'relative', minWidth: 0 }}
                  >
                    <Text size="sm" fw={500} truncate style={{ flex: 1, minWidth: 0 }}>
                      {email.value}
                    </Text>
                    <div
                      className={styles.patientSummaryChevronContainer}
                      style={{
                        alignItems: 'flex-start',
                        display: 'flex',
                        width: 28,
                        minWidth: 28,
                        maxWidth: 28,
                        justifyContent: 'flex-end',
                        gap: 2,
                      }}
                    >
                      <Tooltip label="Copied!" withArrow={false} opened={copied.email === index}>
                        <ActionIcon
                          className={styles.patientSummaryChevron}
                          size="md"
                          variant="transparent"
                          tabIndex={-1}
                          onClick={(e) => handleCopyWithFeedback(e, email.value ?? '', 'email', index)}
                          aria-label="Copy email"
                        >
                          <IconSquares size={16} stroke={2.5} />
                        </ActionIcon>
                      </Tooltip>
                      <ActionIcon
                        className={styles.patientSummaryChevron}
                        size="md"
                        variant="transparent"
                        tabIndex={-1}
                      >
                        <IconChevronRight size={16} stroke={2.5} />
                      </ActionIcon>
                    </div>
                  </Group>
                </MedplumLink>
              </Box>
            ))}
          {!address && phones.length === 0 && emails.length === 0 && (
            <Text size="sm" c="dimmed">
              No contact information available
            </Text>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
