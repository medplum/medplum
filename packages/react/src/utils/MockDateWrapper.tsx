import mockdate from 'mockdate';
import { ReactNode, useEffect } from 'react';

export function MockDateWrapper({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    mockdate.set('2023-05-05T00:00:00.000Z');
    return () => {
      mockdate.reset();
    };
  }, []);

  return <>{children}</>;
}
