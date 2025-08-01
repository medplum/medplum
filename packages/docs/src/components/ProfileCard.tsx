import Link from '@docusaurus/Link';
import { JSX } from 'react';
import GitHubSvg from './github.svg';
import LinkSvg from './link.svg';
import LinkedInSvg from './linkedin.svg';
import styles from './ProfileCard.module.css';
import YouTubeSvg from './youtube.svg';

export interface ProfileCardProps {
  readonly name: string;
  readonly title: string;
  readonly imgUrl: string;
  readonly linkedInUrl?: string;
  readonly githubUrl?: string;
  readonly webUrl?: string;
  readonly youtubeUrl?: string;
}

export function ProfileCard(props: ProfileCardProps): JSX.Element {
  return (
    <div className={styles.profileCard}>
      <div className={styles.profileImage}>
        <img src={props.imgUrl} alt={props.name} />
      </div>
      <h3>{props.name}</h3>
      <p>{props.title}</p>
      <div className={styles.profileLinks}>
        {props.linkedInUrl && (
          <Link href={props.linkedInUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <LinkedInSvg />
            <div>LinkedIn</div>
          </Link>
        )}
        {props.githubUrl && (
          <Link href={props.githubUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <GitHubSvg />
            <div>GitHub</div>
          </Link>
        )}
        {props.webUrl && (
          <Link href={props.webUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <LinkSvg />
            <div>Web</div>
          </Link>
        )}
        {props.youtubeUrl && (
          <Link href={props.youtubeUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <YouTubeSvg />
            <div>YouTube</div>
          </Link>
        )}
      </div>
    </div>
  );
}
