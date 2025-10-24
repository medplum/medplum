// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// CLI color highlighting
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';

export const color = {
  red: (text: string) => `${RED}${text}${RESET}`,
  green: (text: string) => `${GREEN}${text}${RESET}`,
  yellow: (text: string) => `${YELLOW}${text}${RESET}`,
  blue: (text: string) => `${BLUE}${text}${RESET}`,
  bold: (text: string) => `${BOLD}${text}${RESET}`,
};

// Bold text wrapped in ** **
export const processDescription = (desc: string): string => {
  return desc.replace(/\*\*(.*?)\*\*/g, (_, text) => color.bold(text));
};
