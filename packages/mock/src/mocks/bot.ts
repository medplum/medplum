import { Bot } from '@medplum/fhirtypes';

export const ExampleBot: Bot = {
  resourceType: 'Bot',
  id: '123',
  name: 'Test Bot',
  code: 'console.log("hello world");',
};
