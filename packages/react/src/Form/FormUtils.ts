/**
 * Parses an HTML form and returns the result as a JavaScript object.
 * @param form - The HTML form element.
 * @returns Form values in key value pairs.
 */
export function parseForm(form: HTMLFormElement): Record<string, string> {
  const result: Record<string, string> = {};

  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement) {
      parseInputElement(result, element);
    } else if (element instanceof HTMLTextAreaElement) {
      result[element.name] = element.value;
    } else if (element instanceof HTMLSelectElement) {
      parseSelectElement(result, element);
    }
  }

  return result;
}

/**
 * Parses an HTML input element.
 * Sets the name/value pair in the result,
 * but only if the element is enabled and checked.
 * @param result - The result builder.
 * @param el - The input element.
 */
function parseInputElement(result: Record<string, string>, el: HTMLInputElement): void {
  if (el.disabled) {
    // Ignore disabled elements
    return;
  }

  if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) {
    // Ignore unchecked radio or checkbox elements
    return;
  }

  result[el.name] = el.value;
}

/**
 * Parses an HTML select element.
 * Sets the name/value pair if one is selected.
 * @param result - The result builder.
 * @param el - The select element.
 */
function parseSelectElement(result: Record<string, string>, el: HTMLSelectElement): void {
  result[el.name] = el.value;
}
