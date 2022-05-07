import { getReferenceString } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MenuItem } from './MenuItem';
import { MenuSeparator } from './MenuSeparator';
import { Popup } from './Popup';

export interface TimelinePopupMenuProps {
  resource?: Resource;
  x: number;
  y: number;
  onPin?: () => void;
  onClose: () => void;
}

export function TimelinePopupMenu(props: TimelinePopupMenuProps): JSX.Element | null {
  const navigate = useNavigate();

  if (!props.resource) {
    return null;
  }

  const refStr = getReferenceString(props.resource);
  return (
    <Popup
      visible={true}
      anchor={{ left: props.x, right: props.x, top: props.y, bottom: props.y } as DOMRectReadOnly}
      autoClose={true}
      onClose={props.onClose}
    >
      {props.onPin && (
        <>
          <MenuItem onClick={props.onPin}>Pin</MenuItem>
          <MenuSeparator />
        </>
      )}
      <MenuItem onClick={() => navigate(`/${refStr}`)}>Details</MenuItem>
      <MenuItem onClick={() => navigate(`/${refStr}/edit`)}>Edit</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => navigate(`/${refStr}/edit`)}>Delete</MenuItem>
    </Popup>
  );
}
