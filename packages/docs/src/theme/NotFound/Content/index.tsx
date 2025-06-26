import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import type { Props } from '@theme/NotFound/Content';
import clsx from 'clsx';
import { useEffect, type ReactNode } from 'react';

export default function NotFoundContent({ className }: Props): ReactNode {
  // Compute the search URL based on the current path
  const getSearchUrl = (): string => {
    if (typeof window === 'undefined') {
      return '';
    }
    const path = window.location.pathname + window.location.search + window.location.hash;
    return `https://www.medplum.com/search?q=${encodeURIComponent(path)}`;
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // ctrlKey for Windows/Linux, metaKey for Mac
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchUrl = getSearchUrl();
        if (searchUrl) {
          window.location.assign(searchUrl);
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
            <Translate id="theme.NotFound.p1" description="The first paragraph of the 404 page">
              We could not find what you were looking for.
            </Translate>
          </p>
          <p>
            <Translate id="theme.NotFound.p2" description="The 2nd paragraph of the 404 page">
              Try searching for related pages:
            </Translate>
            {(() => {
              if (typeof window === 'undefined') {
                return null;
              }
              const searchUrl = getSearchUrl();
              return (
                <div style={{ marginTop: '1em' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginTop: '0.5em' }}>
                    <input
                      type="text"
                      value={searchUrl}
                      readOnly
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.95em' }}
                      aria-label="Medplum search URL"
                    />
                    <a href={searchUrl} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: 'nowrap' }}>
                      Open
                    </a>
                  </div>
                  <div style={{ fontSize: '0.95em', marginTop: '0.5em' }}>
                    Hit <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>F</kbd> to find related pages.
                  </div>
                </div>
              );
            })()}
          </p>
        </div>
      </div>
    </main>
  );
}
