import React from 'react';
import styles from './CardContainer.module.css';

export interface CardContainerProps {
  children?: React.ReactNode;
}

export function CardContainer(props: CardContainerProps): JSX.Element {
  return <div className={styles.cardContainer}>{props.children}</div>;
}
