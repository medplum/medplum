import styles from './TestimonialHeader.module.css';

export interface TestimonialHeaderProps {
  readonly imgSrc: string;
  readonly name: string;
  readonly title?: string;
  readonly twitter?: string;
}

export function TestimonialHeader(props: TestimonialHeaderProps): JSX.Element {
  return (
    <div className={styles.testimonialHeader}>
      <img src={props.imgSrc} loading="lazy" alt={props.name} />
      <div className={styles.testimonialInfo}>
        <div className={styles.testimonialName}>{props.name}</div>
        <div className={styles.testimonialTitle}>{props.title}</div>
      </div>
      {props.twitter && (
        <a href={props.twitter} className={styles.testimonialLink}>
          <img src="/img/icons/twitter-icon.svg" loading="lazy" alt="Twitter icon" className={styles.testimonialIcon} />
        </a>
      )}
    </div>
  );
}
