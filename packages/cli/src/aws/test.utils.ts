import readline from 'node:readline';

export function mockReadline(...answers: string[]): readline.Interface {
  const result = { write: jest.fn(), question: jest.fn(), close: jest.fn() };
  const debug = false;
  for (const answer of answers) {
    result.question.mockImplementationOnce((q: string, cb: (answer: string) => void) => {
      if (debug) {
        console.log(q, answer);
      }
      cb(answer);
    });
  }
  return result as unknown as readline.Interface;
}
