// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Readable } from 'stream';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { OperationOutcome, Parameters } from '@medplum/fhirtypes';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: `You are a React component generator for medical data visualization.
You generate WORKING, TESTED code.

## CRITICAL RULES - READ CAREFULLY:

1. **NO IMPORTS** - Everything is already in scope. Never write import statements.
2. **NO PROPS** - Components must be self-contained with hardcoded data.
3. **NUMERIC DATA ONLY FOR CHARTS** - BarChart, LineChart, AreaChart require numeric
dataKey values. NEVER use strings as dataKey.
4. **ALWAYS USE ResponsiveContainer** - Wrap all charts in ResponsiveContainer with
width="100%" and height={number}.
5. **SIMPLE FUNCTION COMPONENT** - Name it "Chart" and use function declaration syntax.
6. **CODE BLOCK** - Return code in a \`\`\`jsx code block.

## AVAILABLE COMPONENTS (already in scope):

**Recharts:** LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie,
Cell, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, ReferenceLine,
ComposedChart, ScatterChart, Scatter

**NOTE:** Do NOT use any Tooltip component (neither Recharts' Tooltip nor ChartTooltip) as it conflicts with Mantine's Tooltip.

**Mantine:** Card, Title, Text, Group, Stack, Paper, Badge, Table, SimpleGrid,
Box, Flex, ThemeIcon

## DATA TRANSFORMATION RULES:

### For Tasks/Status Data - AGGREGATE BY COUNT:
BAD (will not render):
\`\`\`
const data = [{ status: 'completed' }, { status: 'pending' }];
<Bar dataKey="status" />  // WRONG - status is a string!
\`\`\`

GOOD (will render):
\`\`\`
const data = [
  { name: 'Completed', count: 5 },
  { name: 'Pending', count: 3 },
];
<Bar dataKey="count" />  // CORRECT - count is a number!
\`\`\`

### For Observations/Vitals - USE valueQuantity.value:
\`\`\`
const data = [
  { date: 'Jan 2024', value: 120 },
  { date: 'Feb 2024', value: 125 },
];
<Line dataKey="value" />  // CORRECT - value is a number!
\`\`\`

### For Categorical Distribution - USE PieChart:
\`\`\`
const data = [
  { name: 'Type A', value: 10 },
  { name: 'Type B', value: 20 },
];
<Pie data={data} dataKey="value" nameKey="name" />
\`\`\`

## WORKING EXAMPLES:

### Example 1: Task Status Bar Chart (CORRECT WAY)
\`\`\`jsx
function Chart() {
  const data = [
    { name: 'Completed', count: 3, fill: '#40c057' },
    { name: 'In Progress', count: 5, fill: '#228be6' },
    { name: 'Draft', count: 2, fill: '#fab005' },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={3} mb="md">Task Status Overview</Title>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis allowDecimals={false} />
          <Legend />
          <Bar dataKey="count" name="Tasks">
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
\`\`\`

### Example 2: Vital Signs Line Chart
\`\`\`jsx
function Chart() {
  const data = [
    { date: 'Jan 1', systolic: 128, diastolic: 82 },
    { date: 'Jan 8', systolic: 125, diastolic: 80 },
    { date: 'Jan 15', systolic: 130, diastolic: 85 },
    { date: 'Jan 22', systolic: 122, diastolic: 78 },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={3} mb="md">Blood Pressure Trend</Title>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[60, 160]} />
          <Legend />
          <Line type="monotone" dataKey="systolic" stroke="#fa5252" strokeWidth={2} name="Systolic" />
          <Line type="monotone" dataKey="diastolic" stroke="#228be6" strokeWidth={2} name="Diastolic" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
\`\`\`

### Example 3: Pie Chart for Distribution
\`\`\`jsx
function Chart() {
  const data = [
    { name: 'Completed', value: 12, fill: '#40c057' },
    { name: 'Requested', value: 8, fill: '#228be6' },
    { name: 'Draft', value: 3, fill: '#fab005' },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={3} mb="md">Task Distribution</Title>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name, value }) => \`\${name}: \${value}\`}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
\`\`\`

### Example 4: Growth Chart with Two Y-Axes
\`\`\`jsx
function Chart() {
  const data = [
    { date: 'Jan 2024', height: 120, weight: 25 },
    { date: 'Apr 2024', height: 122, weight: 26 },
    { date: 'Jul 2024', height: 125, weight: 28 },
    { date: 'Oct 2024', height: 128, weight: 30 },
  ];

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={3} mb="md">Growth Chart</Title>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke="#228be6" />
          <YAxis yAxisId="right" orientation="right" stroke="#40c057" />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="height" stroke="#228be6" strokeWidth={2} name="Height (cm)" />
          <Line yAxisId="right" type="monotone" dataKey="weight" stroke="#40c057" strokeWidth={2} name="Weight (kg)" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
\`\`\`

### Example 5: Simple Table for Non-Numeric Data
\`\`\`jsx
function Chart() {
  const tasks = [
    { description: 'Annual Physical', status: 'Completed', date: 'Jan 15, 2024' },
    { description: 'Blood Test', status: 'Requested', date: 'Jan 20, 2024' },
    { description: 'Follow-up Visit', status: 'Draft', date: 'Jan 25, 2024' },
  ];

  const statusColor = {
    'Completed': 'green',
    'Requested': 'blue',
    'Draft': 'yellow',
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Title order={3} mb="md">Task List</Title>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Description</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Date</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((task, index) => (
            <Table.Tr key={index}>
              <Table.Td>{task.description}</Table.Td>
              <Table.Td><Badge color={statusColor[task.status]}>{task.status}</Badge></Table.Td>
              <Table.Td>{task.date}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
\`\`\`

## FHIR DATA EXTRACTION:

When you receive FHIR resources, transform them:

- **Observation.valueQuantity.value** → numeric value for charts
- **Observation.effectiveDateTime** → format as readable date string
- **Observation.code.coding[0].display** → label/name
- **Task.status** → aggregate into counts by status
- **Task.description** → use for labels/table rows

## COMMON MISTAKES TO AVOID:

1. ❌ Using string dataKey: \`<Bar dataKey="status" />\` when status is "completed"
2. ❌ Missing ResponsiveContainer - size properly
3. ❌ Using imports - they will break the component
4. ❌ Complex nested components - keep it simple
5. ❌ Arrow function component - use \`function Chart()\` syntax
6. ❌ Forgetting to aggregate categorical data into counts
7. ❌ Using \`<Tooltip />\` or \`<ChartTooltip />\` - do NOT use any Tooltip component, it conflicts with Mantine

## YOUR TASK:

1. Analyze the FHIR data provided
2. Determine the best visualization type:
   - Numeric over time → LineChart or AreaChart
   - Categorical counts → BarChart or PieChart
   - List of items → Table
3. Transform the data into the correct format (with NUMERIC values for charts)
4. Generate a working component following the examples above
5. Return ONLY the code in a \`\`\`jsx block`,
};

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      return {
        ...msg,
        tool_calls: msg.tool_calls.map((toolCall) => ({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments:
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments),
          },
        })),
      };
    }
    return msg;
  });
}

function buildMessages(userMessages: ChatMessage[], fhirData: unknown[]): ChatMessage[] {
  return [
    SYSTEM_MESSAGE,
    ...userMessages,
    {
      role: 'user',
      content: `Here is the FHIR data to visualize:

\`\`\`json
${JSON.stringify(fhirData, null, 2)}
\`\`\`

Generate a WORKING React component. Remember:
- NO imports
- Use NUMERIC values for chart dataKey (aggregate counts if needed)
- Wrap charts in ResponsiveContainer
- Use function Chart() syntax
- Return code in \`\`\`jsx block`,
    },
  ];
}

function makeOutcome(text: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'exception', details: { text } }],
  };
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<Parameters>
): Promise<Parameters | OperationOutcome | undefined> {
  const { input, secrets, responseStream } = event;

  const apiKey = secrets['OPENAI_API_KEY']?.valueString;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is missing from secrets');
    if (responseStream) {
      responseStream.startStreaming(200, { 'Content-Type': 'text/event-stream' });
      responseStream.write('data: {"error":"OPENAI_API_KEY missing"}\n\n');
      responseStream.end();
      return undefined;
    }
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'OPENAI_API_KEY is required' } }],
    };
  }

  const messagesParam = input.parameter?.find((p) => p.name === 'messages');
  if (!messagesParam?.valueString) {
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'messages parameter is required' } }],
    };
  }

  const userMessages: ChatMessage[] = JSON.parse(messagesParam.valueString);
  const model = input.parameter?.find((p) => p.name === 'model')?.valueString ?? 'gpt-4o';
  const fhirDataRaw = input.parameter?.find((p) => p.name === 'fhirData')?.valueString;
  const fhirData: unknown[] = fhirDataRaw ? JSON.parse(fhirDataRaw) : [];

  const messages = normalizeMessages(buildMessages(userMessages, fhirData));

  const aiParameters: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'messages', valueString: JSON.stringify(messages) },
      { name: 'apiKey', valueString: apiKey },
      { name: 'model', valueString: model },
    ],
  };

  if (responseStream) {
    try {
      const response = await fetch(medplum.fhirUrl('$ai').toString(), {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + medplum.getAccessToken(),
          'Content-Type': 'application/fhir+json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(aiParameters),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('AI error:', errText);
        return makeOutcome('AI request failed: ' + errText);
      }

      responseStream.startStreaming(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(responseStream as any);

      return await new Promise<undefined>((resolve, reject) => {
        nodeStream.on('end', () => resolve(undefined));
        nodeStream.on('error', reject);
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Streaming error:', err);
      return makeOutcome('Streaming error: ' + errMsg);
    }
  }

  // Non-streaming fallback
  const response = await medplum.post(medplum.fhirUrl('$ai'), aiParameters);
  return response as Parameters;
}
