import styles from './HomepageCallout.module.css';

type HomepageCalloutProps = {
  readonly title: string;
  readonly body: string;
  readonly linkText: string;
  readonly linkRef: string;
};
export default function HomepageCallout(props: HomepageCalloutProps): JSX.Element {
  return (
    <div className={`${styles.container}`}>
      <div className={styles.content}>
        <h2 className={styles.title}>{props.title}</h2>
        <p className={styles.cardBody}>{props.body}</p>
        <div className={styles['link-container']}>
          <a href={props.linkRef}>{props.linkText}</a>
          <a href={props.linkRef} style={{ maxHeight: '26px' }}>
            <img className={styles['icon']} src="img/small_arrow.svg" alt="Arrow icon" />
          </a>
        </div>
      </div>
    </div>
  );
}
