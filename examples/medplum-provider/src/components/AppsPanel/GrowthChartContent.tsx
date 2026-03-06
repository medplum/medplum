// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Box, Button, Center, Paper, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';

function getPatientIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(/^\/Patient\/([^/]+)/);
  return match?.[1];
}

export function GrowthChartContent(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const patientId = getPatientIdFromPathname(location.pathname);

  if (!patientId) {
    return (
      <Center style={{ flex: 1 }}>
        <Stack align="center" gap="md" mx="xl">
          <Text size="sm" fw={500} ta="center">
            Open a patient profile page to view their growth chart
          </Text>
          <Button
            variant="light"
            size="sm"
            onClick={() => navigate('/Patient?_count=20&_fields=name,email,gender&_sort=-_lastUpdated')}
          >
            View All Patients
          </Button>
        </Stack>
      </Center>
    );
  }

  const data = [
    { age: 0, height: 50 },
    { age: 6, height: 66 },
    { age: 12, height: 75 },
    { age: 18, height: 82 },
    { age: 24, height: 87 },
    { age: 36, height: 96 },
    { age: 48, height: 103 },
    { age: 60, height: 110 },
  ];

  const width = 320;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const minH = Math.min(...data.map((d) => d.height));
  const maxH = Math.max(...data.map((d) => d.height));
  const minA = Math.min(...data.map((d) => d.age));
  const maxA = Math.max(...data.map((d) => d.age));

  const scaleX = (v: number): number => padding.left + (chartW * (v - minA)) / (maxA - minA || 1);
  const scaleY = (v: number): number => padding.top + chartH - (chartH * (v - minH)) / (maxH - minH || 1);
  const points = data.map((d) => `${scaleX(d.age)},${scaleY(d.height)}`).join(' ');

  return (
    <Box style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Text size="sm" c="dimmed" mb="xs">
        Sample growth chart (height vs age)
      </Text>
      <Paper withBorder p="md">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: 320 }}>
          {/* Y axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartH}
            stroke="var(--mantine-color-gray-4)"
            strokeWidth="1"
          />
          {/* X axis */}
          <line
            x1={padding.left}
            y1={padding.top + chartH}
            x2={padding.left + chartW}
            y2={padding.top + chartH}
            stroke="var(--mantine-color-gray-4)"
            strokeWidth="1"
          />
          {/* Data line */}
          <polyline
            points={points}
            fill="none"
            stroke="var(--mantine-color-blue-6)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Data points */}
          {data.map((d, i) => (
            <circle key={i} cx={scaleX(d.age)} cy={scaleY(d.height)} r="4" fill="var(--mantine-color-blue-6)" />
          ))}
        </svg>
      </Paper>
      <Text size="xs" c="dimmed" mt="xs">
        Age (months) vs height (cm) — demo data
      </Text>
    </Box>
  );
}
