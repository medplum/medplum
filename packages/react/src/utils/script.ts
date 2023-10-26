/**
 * Dynamically creates a script tag for the specified JavaScript file.
 * @param src - The JavaScript file URL.
 * @param onload - Optional callback for the onload event.
 */
export function createScriptTag(src: string, onload?: () => void): void {
  const head = document.getElementsByTagName('head')[0];
  const script = document.createElement('script');
  script.async = true;
  script.src = src;
  script.onload = onload ?? null;
  head.appendChild(script);
}
