import { Avatar, AvatarProps } from '@mantine/core';
import { getDisplayString, getImageSrc } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import { useCachedBinaryUrl, useResource } from '@medplum/react-hooks';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { getInitials } from './ResourceAvatar.utils';

export interface ResourceAvatarProps extends AvatarProps {
  readonly value?: Reference | Resource;
  readonly link?: boolean;
}

export function ResourceAvatar(props: ResourceAvatarProps): JSX.Element {
  const resource = useResource(props.value);
  const text = resource ? getDisplayString(resource) : (props.alt ?? '');
  const initials = getInitials(text);
  const uncachedImageUrl = (resource && getImageSrc(resource)) ?? props.src;
  const imageUrl = useCachedBinaryUrl(uncachedImageUrl ?? undefined);
  const radius = props.radius ?? 'xl';

  const avatarProps = { ...props, value: undefined, link: undefined };

  if (props.link) {
    return (
      <MedplumLink to={resource}>
        <Avatar src={imageUrl} alt={text} radius={radius} {...avatarProps}>
          {initials}
        </Avatar>
      </MedplumLink>
    );
  }

  return (
    <Avatar src={imageUrl} alt={text} radius={radius} {...avatarProps}>
      {initials}
    </Avatar>
  );
}
