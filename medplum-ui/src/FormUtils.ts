
/**
 * Parses an HTML form and returns the result as a JavaScript object.
 * @param form The HTML form element.
 */
 export function parseForm(form: HTMLFormElement): Record<string, string> {
     if (!form || !form.elements) {
         throw new Error('Invalid form');
     }

    const result: Record<string, string> = {};

    for (let i = 0; i < form.elements.length; i++) {
      const element = form.elements[i] as HTMLElement;

      if (element instanceof HTMLInputElement) {
        if (element.disabled) {
          // Ignore disabled elements
          continue;
        }

        if ((element.type === 'checkbox' || element.type === 'radio') && !element.checked) {
          // Ignore unchecked radio or checkbox elements
          continue;
        }

        result[element.name] = element.value;

        // setValue(typeDef, result, element.name, element.value);

      } else if (element instanceof HTMLSelectElement) {
        if (element.selectedOptions.length === 0) {
          // Ignore select elements with no value
          continue;
        }
        // setValue(typeDef, result, element.name, element.value);
        result[element.name] = element.value;
      }
    }

    return result;
  }