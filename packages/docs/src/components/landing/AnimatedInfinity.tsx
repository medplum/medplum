import { useInView } from 'react-intersection-observer';
import './animations.css';

export function AnimatedInfinity(): JSX.Element {
  const { ref, inView } = useInView({ triggerOnce: true });
  return (
    <svg viewBox="0 0 200 150" className="heroImage" ref={ref}>
      <path
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fillOpacity="0"
        strokeMiterlimit="4"
        stroke="rgb(148,106,249)"
        strokeWidth="1"
        d="M114.8,92.4 C128.7,109.0 152.1,121.3 173.4,111.2 C189.2,103.7 198.9,85.3 196.2,68.0 C194.2,55.7 186.0,44.4 174.6,39.4 C144.6,26.4 123.6,44.8 100.0,72.2 C76.4,99.6 55.4,123.7 25.4,110.7 C14.0,105.7 5.8,94.3 3.8,82.0 C1.1,64.8 10.8,46.4 26.6,38.9 C47.9,28.7 71.3,41.1 85.2,57.7"
      />
      {inView && (
        <path
          className="infinity path"
          fillOpacity="0"
          stroke="rgba(148,106,249,0.5)"
          strokeLinecap="round"
          strokeLinejoin="miter"
          strokeMiterlimit="4"
          strokeWidth="8"
          d="M114.8,92.4 C128.7,109.0 152.1,121.3 173.4,111.2 C189.2,103.7 198.9,85.3 196.2,68.0 C194.2,55.7 186.0,44.4 174.6,39.4 C144.6,26.4 123.6,44.8 100.0,72.2 C76.4,99.6 55.4,123.7 25.4,110.7 C14.0,105.7 5.8,94.3 3.8,82.0 C1.1,64.8 10.8,46.4 26.6,38.9 C47.9,28.7 71.3,41.1 85.2,57.7"
        />
      )}
    </svg>
  );
}
