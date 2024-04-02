import { Bundle } from '@medplum/fhirtypes';

export const noMessagesInLast30Minutes: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:f16a7ef1-b961-4bef-a0d7-590c6c3484be',
      resource: {
        resourceType: 'Patient',
        name: [
          {
            family: 'Smith',
            given: ['John'],
          },
        ],
      },
      request: { method: 'POST', url: 'Patient' },
    },
    {
      fullUrl: 'urn:uuid:4d894a2e-4384-4c65-aacd-9141683df873',
      resource: {
        resourceType: 'Communication',
        sent: new Date().toISOString(),
        status: 'in-progress',
      },
      request: { method: 'POST', url: 'Communication' },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'completed',
        sent: new Date().toISOString(),
        partOf: [
          {
            reference: 'urn:uuid:4d894a2e-4384-4c65-aacd-9141683df873',
          },
        ],
        sender: {
          reference: 'urn:uuid:f16a7ef1-b961-4bef-a0d7-590c6c3484be',
        },
      },
      request: { method: 'POST', url: 'Communication' },
    },
  ],
};

const now = new Date();
const earlier = new Date(now.getTime() - 15 * 60 * 1000);

export const messagesNotSentByPatients: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:5c87a855-0cd3-409d-9a19-9886dcc9e7e9',
      resource: {
        resourceType: 'Practitioner',
        name: [
          {
            family: 'Smith',
            given: ['John'],
          },
        ],
      },
      request: { method: 'POST', url: 'Practitioner' },
    },
    {
      fullUrl: 'urn:uuid:0c5ced9f-83a6-4812-ae9b-99cc2824bccf',
      resource: {
        resourceType: 'Communication',
        sent: earlier.toISOString(),
        status: 'in-progress',
      },
      request: { method: 'POST', url: 'Communication' },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'completed',
        sent: earlier.toISOString(),
        partOf: [
          {
            reference: 'urn:uuid:0c5ced9f-83a6-4812-ae9b-99cc2824bccf',
          },
        ],
        sender: {
          reference: 'urn:uuid:5c87a855-0cd3-409d-9a19-9886dcc9e7e9',
        },
      },
    },
  ],
};

export const assignToQueueBatch: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        subject: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
          display: 'Mr. Lucien408 Bosco882 PharmD',
        },
        topic: {
          coding: [
            {
              code: 'Lab test results',
              display: 'Lab test results',
            },
          ],
        },
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      fullUrl: 'urn:uuid:f9e25a08-9db5-11ee-8c90-0242ac120002',
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        topic: {
          coding: [
            {
              code: 'Schedule a Physical',
              display: 'Schedule a Physical',
            },
          ],
        },
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do you have the results of my lab tests yet?',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:26:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Can I schedule a physical for December 23rd?',
          },
        ],
        topic: {
          text: 'Schedule a Physical',
        },
        partOf: [
          {
            reference: 'urn:uuid:f9e25a08-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:01:15.175Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
  ],
};

export const assignToPractitionerBatch: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        subject: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
          display: 'Mr. Lucien408 Bosco882 PharmD',
        },
        topic: {
          coding: [
            {
              code: 'Lab test results',
              display: 'Lab test results',
            },
          ],
        },
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do you have the results of my lab tests yet?',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:26:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do you have the test id number?',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Practitioner/b95651dc-448b-42c3-b427-f26d082a574d',
        },
        sent: '2023-12-18T14:28:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Yes, it is 12345',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:46:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
  ],
};

export const threadsWithTasks: Bundle = {
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      fullUrl: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        subject: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
          display: 'Mr. Lucien408 Bosco882 PharmD',
        },
        topic: {
          coding: [
            {
              code: 'Lab test results',
              display: 'Lab test results',
            },
          ],
        },
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do you have the results of my lab tests yet?',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:26:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do you have the test id number?',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Practitioner/b95651dc-448b-42c3-b427-f26d082a574d',
        },
        sent: '2023-12-18T14:28:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Yes, it is 12345',
          },
        ],
        topic: {
          text: 'December 15th lab tests.',
        },
        partOf: [
          {
            reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:46:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      fullUrl: 'urn:uuid:b66f5c38-62dd-45de-9244-496c2e8fc9fe',
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        subject: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
          display: 'Mr. Lucien408 Bosco882 PharmD',
        },
        topic: {
          coding: [
            {
              code: 'Physical appointment',
              display: 'Physical appointment',
            },
          ],
        },
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'Do I have a physical scheduled for this week?',
          },
        ],
        topic: {
          text: 'Physical appointment',
        },
        partOf: [
          {
            reference: 'urn:uuid:b66f5c38-62dd-45de-9244-496c2e8fc9fe',
          },
        ],
        sender: {
          reference: 'Patient/8f0d3209-0ee0-487f-b186-4328a949190f',
        },
        sent: '2023-12-18T14:26:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Communication',
        status: 'in-progress',
        payload: [
          {
            contentString: 'No you do not!',
          },
        ],
        topic: {
          text: 'Physical appointment',
        },
        partOf: [
          {
            reference: 'urn:uuid:b66f5c38-62dd-45de-9244-496c2e8fc9fe',
          },
        ],
        sender: {
          reference: 'Practitioner/b95651dc-448b-42c3-b427-f26d082a574d',
        },
        sent: '2023-12-18T14:28:06.531Z',
      },
      request: {
        method: 'POST',
        url: 'Communication',
      },
    },
    {
      resource: {
        resourceType: 'Task',
        status: 'in-progress',
        intent: 'order',
        focus: {
          reference: 'urn:uuid:d9d3cba2-9db5-11ee-8c90-0242ac120002',
        },
        code: {
          text: 'Respond to Message',
        },
      },
      request: {
        method: 'POST',
        url: 'Task',
      },
    },
  ],
};
