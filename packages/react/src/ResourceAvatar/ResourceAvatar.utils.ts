export function getInitials(input: string): string {
  const words = input.split(' ').filter(Boolean);
  if (words.length > 1) {
    return words[0][0] + words[words.length - 1][0];
  }
  if (words.length === 1) {
    return words[0][0];
  }
  return '';
}
