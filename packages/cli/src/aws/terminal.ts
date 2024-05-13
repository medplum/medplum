import readline from 'node:readline';

let terminal: readline.Interface;

export function initTerminal(): void {
  terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
}

export function closeTerminal(): void {
  terminal.close();
}

/**
 * Prints to stdout.
 * @param text - The text to print.
 */
export function print(text: string): void {
  terminal.write(text + '\n');
}

/**
 * Prints a header with extra line spacing.
 * @param text - The text to print.
 */
export function header(text: string): void {
  print('\n' + text + '\n');
}

/**
 * Prints a question and waits for user input.
 * @param text - The question text to print.
 * @param defaultValue - Optional default value.
 * @returns The selected value, or default value on empty selection.
 */
export function ask(text: string, defaultValue: string | number = ''): Promise<string> {
  return new Promise((resolve) => {
    terminal.question(text + (defaultValue ? ' (' + defaultValue + ')' : '') + ' ', (answer: string) => {
      resolve(answer || defaultValue.toString());
    });
  });
}

/**
 * Prints a question and waits for user to choose one of the provided options.
 * @param text - The prompt text to print.
 * @param options - The list of options that the user can select.
 * @param defaultValue - Optional default value.
 * @returns The selected value, or default value on empty selection.
 */
export async function choose(text: string, options: (string | number)[], defaultValue = ''): Promise<string> {
  const str = text + ' [' + options.map((o) => (o === defaultValue ? '(' + o + ')' : o)).join('|') + ']';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const answer = (await ask(str)) || defaultValue;
    if (options.includes(answer)) {
      return answer;
    }
    print('Please choose one of the following options: ' + options.join(', '));
  }
}

/**
 * Prints a question and waits for the user to choose a valid integer option.
 * @param text - The prompt text to print.
 * @param options - The list of options that the user can select.
 * @param defaultValue - Default value.
 * @returns The selected value, or default value on empty selection.
 */
export async function chooseInt(text: string, options: number[], defaultValue: number): Promise<number> {
  return parseInt(
    await choose(
      text,
      options.map((o) => o.toString()),
      defaultValue.toString()
    ),
    10
  );
}

/**
 * Prints a question and waits for the user to choose yes or no.
 * @param text - The question to print.
 * @returns true on accept or false on reject.
 */
export async function yesOrNo(text: string): Promise<boolean> {
  return (await choose(text, ['y', 'n'])).toLowerCase() === 'y';
}

/**
 * Prints a question and waits for the user to confirm yes. Throws error on no, and exits the program.
 * @param text - The prompt text to print.
 */
export async function checkOk(text: string): Promise<void> {
  if (!(await yesOrNo(text))) {
    print('Exiting...');
    throw new Error('User cancelled');
  }
}
