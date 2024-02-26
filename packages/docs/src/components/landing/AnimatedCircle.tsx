import { useCallback, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import './animations.css';

export interface AnimatedCircleProps {
  readonly value: number;
  readonly suffix?: string;
}

export function AnimatedCircle(props: AnimatedCircleProps): JSX.Element {
  const [value, setValue] = useState(0);

  const handleVisibilityChange = useCallback(
    (inView: boolean) => {
      if (inView) {
        const startTime = Date.now();
        const timer = window.setInterval(() => {
          setValue(() => {
            // Interpolate from 0 to props.value over 5 seconds
            const elapsedTime = Date.now() - startTime;
            let percentComplete = elapsedTime / (0.8 * 5000);
            if (percentComplete > 1) {
              percentComplete = 1;
              window.clearInterval(timer);
            }
            return Math.floor(percentComplete * props.value);
          });
        }, 100);
      }
    },
    [props.value]
  );

  const { ref, inView } = useInView({ triggerOnce: true, onChange: handleVisibilityChange });

  return (
    <svg viewBox="0 0 200 150" className="heroImage" ref={ref}>
      <circle cx="100" cy="75" r="64" fill="none" stroke="rgb(148,106,249)" strokeWidth="1" />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        fontSize="32"
        fontWeight="bold"
        fill="rgb(148,106,249)"
        stroke="none"
        dy="0.4em"
      >
        {value.toLocaleString() + (props.suffix ?? '')}
      </text>
      {inView && (
        <circle
          className="circle path"
          cx="100"
          cy="75"
          r="64"
          fill="none"
          stroke="rgba(148,106,249,0.5)"
          strokeLinecap="round"
          strokeWidth="8"
          transform="rotate(-90 100 75)"
        />
      )}
    </svg>
  );
}
