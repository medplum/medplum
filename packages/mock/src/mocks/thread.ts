import { createReference } from '@medplum/core';
import { Communication } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';
import { HomerSimpson } from './simpsons';

export const ExampleThreadHeader = {
  id: 'message-header-123',
  resourceType: 'Communication',
  topic: { text: 'Example Thread' },
  sender: createReference(DrAliceSmith),
  recipient: [createReference(DrAliceSmith), createReference(HomerSimpson)],
  sent: '2024-03-27T06:31:35Z',
  status: 'in-progress',
} satisfies Communication;

export const ExampleThreadMessages: Communication[] = [
  {
    id: 'message-1',
    resourceType: 'Communication',
    sender: createReference(DrAliceSmith),
    recipient: [createReference(HomerSimpson)],
    status: 'completed',
    payload: [{ contentString: 'Hi, Homer. Can you come in to discuss treatment for your radiation poisoning?' }],
    sent: '2024-03-27T06:31:35Z',
    received: '2024-03-27T06:31:39Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
  {
    id: 'message-2',
    resourceType: 'Communication',
    sender: createReference(HomerSimpson),
    recipient: [createReference(DrAliceSmith)],
    status: 'completed',
    payload: [{ contentString: 'Aww, not again... Doh!' }],
    sent: '2024-03-27T06:32:35Z',
    received: '2024-03-27T06:32:39Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
  {
    id: 'message-3',
    resourceType: 'Communication',
    sender: createReference(DrAliceSmith),
    recipient: [createReference(HomerSimpson)],
    status: 'completed',
    payload: [{ contentString: "Homer, I haven't received your labs yet. Did you go for your lab work?" }],
    sent: '2024-03-27T06:35:35Z',
    received: '2024-03-27T06:36:35Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
  {
    id: 'message-4',
    resourceType: 'Communication',
    sender: createReference(HomerSimpson),
    recipient: [createReference(DrAliceSmith)],
    status: 'completed',
    payload: [{ contentString: 'Of course I did! Must be in the mail' }],
    sent: '2024-03-27T06:36:39Z',
    received: '2024-03-27T06:37:39Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
  {
    id: 'message-5',
    resourceType: 'Communication',
    sender: createReference(DrAliceSmith),
    recipient: [createReference(HomerSimpson)],
    status: 'completed',
    payload: [{ contentString: 'Homer, this is for your own wellbeing. You need to take this seriously.' }],
    sent: '2024-03-27T06:37:39Z',
    received: '2024-03-27T06:38:39Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
  {
    id: 'message-6',
    resourceType: 'Communication',
    sender: createReference(HomerSimpson),
    recipient: [createReference(DrAliceSmith)],
    status: 'in-progress',
    payload: [{ contentString: "Well I stopped eating donuts didn't I? Sometimes..." }],
    sent: '2024-03-27T06:38:42Z',
    partOf: [createReference(ExampleThreadHeader)],
  },
];
