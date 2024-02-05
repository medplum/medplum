export interface LogoProps {
  readonly size: number;
  readonly fill?: string;
}

export function Logo(props: LogoProps): JSX.Element {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 491 491" style={{ width: props.size, height: props.size }}>
      <title>Medplum Logo</title>
      <path fill={props.fill ?? '#ad7136'} d="M282 67c6-16 16-29 29-40L289 0c-22 17-37 41-43 68l17 23 19-24z" />
      <path
        fill={props.fill ?? '#946af9'}
        d="M311 63c-17 0-33 4-48 11-16-7-32-11-49-11-87 0-158 96-158 214s71 214 158 214c17 0 33-4 49-11 15 7 31 11 48 11 87 0 158-96 158-214S398 63 311 63z"
      />
      <path
        fill={props.fill ?? '#7857c5'}
        d="M231 489l-17 2c-87 0-158-96-158-214S127 63 214 63l17 1c-39 12-70 102-70 213s31 201 70 212z"
      />
      <path
        fill={props.fill ?? '#40bc26'}
        d="M207 220a176 176 0 01-177 43A176 176 0 01251 43l1 5c17 59 2 125-45 172z"
      />
      <path fill={props.fill ?? '#33961e'} d="M252 48A421 421 0 0057 270l-27-7A176 176 0 01251 43l1 5z" />
    </svg>
  );
}
