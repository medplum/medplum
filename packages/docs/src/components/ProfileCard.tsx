import GitHubSvg from './github.svg';
import LinkedInSvg from './linkedin.svg';
import LinkSvg from './link.svg';
import YouTubeSvg from './youtube.svg';
import styles from './ProfileCard.module.css';

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
          <a href={props.linkedInUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <LinkedInSvg />
            <div>LinkedIn</div>
          </a>
        )}
        {props.githubUrl && (
          <a href={props.githubUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <GitHubSvg />
            <div>GitHub</div>
          </a>
        )}
        {props.webUrl && (
          <a href={props.webUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <LinkSvg />
            <div>Web</div>
          </a>
        )}
        {props.youtubeUrl && (
          <a href={props.youtubeUrl} rel="noreferrer" target="_blank" className={styles.profileLink}>
            <YouTubeSvg />
            <div>YouTube</div>
          </a>
        )}
      </div>
    </div>
  );
}
