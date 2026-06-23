import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import type { Props } from '@theme/NotFound/Content';
import { clsx } from 'clsx';
import { useEffect, type ReactNode } from 'react';

export default function NotFoundContent({ className }: Props): ReactNode {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();

        // Open the search modal (simulate click on the search button)
        const searchButton = document.querySelector('.DocSearch-Button') as HTMLElement;
        if (searchButton) {
          searchButton.click();

          // Wait for the input to appear, then set its value
          setTimeout(() => {
            const input = document.querySelector('.DocSearch-Input');
            if (input) {
              const path = window.location.pathname + window.location.search + window.location.hash;
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;
              nativeInputValueSetter?.call(input, path);
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 100); // Adjust delay as needed
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <main className={clsx('container margin-vert--xl', className)}>
      <div className="row">
        <div className="col col--6 col--offset-3">
          <Heading as="h1" className="hero__title">
            <Translate id="theme.NotFound.title" description="The title of the 404 page">
              Page Not Found
            </Translate>
          </Heading>
          <p>
            <Translate id="theme.NotFound.p1" description="The 2nd paragraph of the 404 page">
              Search related pages:
            </Translate>
            <span>
              {' '}
              <br></br>
              <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>
            </span>
          </p>
        </div>
      </div>
    </main>
  );
}
