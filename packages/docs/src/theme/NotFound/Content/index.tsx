import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import type { Props } from '@theme/NotFound/Content';
import { type ReactNode } from 'react';
import { AlgoliaSearch } from '../../SearchPage/AlgoliaSearch';

export default function NotFoundContent({ className }: Props): ReactNode {
  return (
    <main className={`container margin-vert--xl ${className}`}>
      <div className="row">
        <div className="col col--8 col--offset-2">
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
          <AlgoliaSearch />
        </div>
      </div>
    </main>
  );
}
