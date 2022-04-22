import React from 'react';
import styles from './HomepageCallout.module.css';

type HomepageCalloutProps = {
  title: string;
  body: string;
  linkText: string;
  linkRef: string;
};
export default function HomepageCallout(props: HomepageCalloutProps): JSX.Element {
  return (
    <div className={`${styles.container} shadow--md`}>
      <div className={styles.content}>
        <h3>{props.title}</h3>
        <p>{props.body}</p>
        <div className={styles['link-container']}>
          <a href={props.linkRef}>{props.linkText}</a>
        </div>
      </div>
    </div>
  );
}
