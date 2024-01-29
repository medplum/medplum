import { ReactNode } from 'react';
import styles from './CardButton.module.css';

export interface CardButtonProps {
  readonly href: string;
  readonly alt: string;
  readonly target?: string;
  readonly children?: ReactNode;
}

export function CardButton(props: CardButtonProps): JSX.Element {
  return (
    <a href={props.href} target={props.target} className={styles.cardButton}>
      <div>{props.children}</div>
      <img src="/img/arrow-small-btn.svg" loading="lazy" alt="Go arrow" width="24" height="24" />
      <span className="screen-reader-text">{props.alt}</span>
    </a>
  );
}
