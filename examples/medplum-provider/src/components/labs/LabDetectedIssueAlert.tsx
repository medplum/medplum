// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core';
import { createReference } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { DetectedIssue } from '@medplum/fhirtypes';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

// Codes the Health Gorilla integration writes onto a DetectedIssue's `code.coding[0].code`
// when a DiagnosticReport can't be cleanly filed against a lab order. See
// medplum-ee packages/health-gorilla/src/common/error.ts (RewriteDiagnosticReportError subclasses).
const ISSUE_CODE_MESSAGES: Record<string, string> = {
  'unsolicited-diagnostic-report':
    'This result could not be matched to an order in this system. It was filed as an unsolicited report — verify the patient and order details.',
  'multiple-requisitions':
    'This result is associated with multiple lab requisitions. Verify it is linked to the correct order before acting on it.',
};

// A DetectedIssue with at least one mitigation entry has already been reviewed by staff.
// It's still shown (results should never just disappear), but as confirmed rather than outstanding.
function isMitigated(issue: DetectedIssue): boolean {
  return (issue.mitigation?.length ?? 0) > 0;
}

interface UseLabDetectedIssuesResult {
  issues: DetectedIssue[];
  acknowledgeIssue: (issue: DetectedIssue) => Promise<void>;
}

/**
 * Fetches any DetectedIssue resources that implicate the given DiagnosticReport ids, and
 * provides a way to acknowledge one so it's marked confirmed.
 * @param reportIds - The DiagnosticReport ids to check for detected issues.
 * @returns The detected issues, and a function to acknowledge one.
 */
export function useLabDetectedIssues(reportIds: (string | undefined)[]): UseLabDetectedIssuesResult {
  const medplum = useMedplum();
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const idsKey = reportIds.filter((id): id is string => !!id).join(',');

  useEffect(() => {
    let subscribed = true;
    if (idsKey) {
      medplum
        .searchResources('DetectedIssue', {
          implicated: idsKey
            .split(',')
            .map((id) => `DiagnosticReport/${id}`)
            .join(','),
        })
        .then((result) => {
          if (subscribed) {
            setIssues(result);
          }
        })
        .catch(showErrorNotification);
    }
    return () => {
      subscribed = false;
    };
  }, [medplum, idsKey]);

  const acknowledgeIssue = useCallback(
    async (issue: DetectedIssue): Promise<void> => {
      try {
        const profile = medplum.getProfile();
        const author = profile?.resourceType === 'Practitioner' ? createReference(profile) : undefined;
        const updated = await medplum.updateResource<DetectedIssue>({
          ...issue,
          mitigation: [
            ...(issue.mitigation ?? []),
            {
              action: { text: 'Reviewed by staff' },
              date: new Date().toISOString(),
              ...(author ? { author } : {}),
            },
          ],
        });
        setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [medplum]
  );

  return { issues, acknowledgeIssue };
}

interface LabDetectedIssueAlertProps {
  issues: DetectedIssue[];
  onAcknowledge: (issue: DetectedIssue) => Promise<void>;
}

/**
 * Renders a warning banner for each DetectedIssue implicating the current report(s), so staff
 * can see and act on results the Health Gorilla integration couldn't cleanly file against an
 * order. The banner stays visible after review — marked "Confirmed" — rather than disappearing,
 * so there's always a visible record that the result was flagged and handled.
 * @param props - The detected issues to render, and a callback to acknowledge one.
 * @returns The alert banners, or null if there are none.
 */
export function LabDetectedIssueAlert(props: LabDetectedIssueAlertProps): JSX.Element | null {
  const { issues, onAcknowledge } = props;

  if (issues.length === 0) {
    return null;
  }

  return (
    <Stack gap="xs">
      {issues.map((issue) => {
        const code = issue.code?.coding?.[0]?.code;
        const message = (code && ISSUE_CODE_MESSAGES[code]) ?? 'This result has a detected issue that may need review.';
        const mitigated = isMitigated(issue);
        return (
          <Alert
            key={issue.id}
            icon={<IconAlertTriangle size={16} />}
            color={mitigated ? 'gray' : 'yellow'}
            variant="light"
          >
            <Group justify="space-between" align="center" wrap="nowrap" gap="md">
              <Text size="sm">{message}</Text>
              {mitigated ? (
                <Badge size="sm" color="green" variant="light">
                  Confirmed
                </Badge>
              ) : (
                <Button size="xs" variant="light" color="yellow" onClick={() => onAcknowledge(issue)}>
                  Mark reviewed
                </Button>
              )}
            </Group>
          </Alert>
        );
      })}
    </Stack>
  );
}
