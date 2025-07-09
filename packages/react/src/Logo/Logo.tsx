import { JSX } from 'react';

export interface LogoProps {
  readonly size: number;
  readonly fill?: string;
}

export function Logo(props: LogoProps): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90" style={{ width: props.size, height: props.size }}>
      <title>Medplum Logo</title>
      <path
        d="M42.4 28.2c-1.6-7.7-7.8-12-12-14l2.4-5.4c4 1.4 7.3 4.3 10.3 7.3-.1-6 .5-8 2.3-10.5C50.4 0 51.8 1.4 66 1c-.1 3.7.5 8.9-1.6 12-3.5 4.7-7.9 3.7-20.6 4 4.2 5.7 3.6 7 4.7 10.5C64.5 16.8 85 24.2 85 48c0 22-20 41-40 41C24.9 89 5 67.9 5 48c0-22.3 18.6-32.4 37.4-19.8zm-1.9 21.3h-10c-.8 0-1.5.7-1.5 1.5v6c0 .9.7 1.5 1.5 1.5h10v10c0 .8.7 1.5 1.5 1.5h6c.8 0 1.5-.7 1.5-1.5v-10h10c.8 0 1.5-.6 1.5-1.4V51c0-.8-.7-1.5-1.5-1.5h-10v-10c0-.8-.7-1.5-1.5-1.5h-6c-.8 0-1.5.7-1.5 1.6z"
        fill={props.fill ?? '#82317f'}
        fill-rule="evenodd"
      />
    </svg>
  );
}
