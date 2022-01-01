import React, { useState } from 'react';
import { Button } from './Button';
import { killEvent } from './utils/dom';
import './Dialog.css';

export interface DialogProps {
  visible: boolean;
  children?: React.ReactNode;
  onOk: () => void;
  onCancel: () => void;
}

export function Dialog(props: DialogProps): JSX.Element | null {
  const [x, setX] = useState(100);
  const [y, setY] = useState(100);

  if (!props.visible) {
    return null;
  }

  function handleMouseDown(downEvent: React.MouseEvent): void {
    killEvent(downEvent);

    const dragX = downEvent.clientX - x;
    const dragY = downEvent.clientY - y;

    function handleMouseMove(moveEvent: MouseEvent): void {
      killEvent(moveEvent);
      setX(moveEvent.clientX - dragX);
      setY(moveEvent.clientY - dragY);
    }

    function handleMouseUp(upEvent: MouseEvent): void {
      killEvent(upEvent);
      document.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
    }

    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('mousemove', handleMouseMove, true);
  }

  return (
    <>
      <div className="modal-dialog-bg"></div>
      <div className="modal-dialog" data-testid="dialog" tabIndex={0} style={{ left: x + 'px', top: y + 'px' }}>
        <div className="modal-dialog-title" onMouseDown={(e) => handleMouseDown(e)}>
          <span className="modal-dialog-title-text">Dialog</span>
          <span className="modal-dialog-title-close" tabIndex={0} onClick={props.onCancel}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>
        <div className="modal-dialog-content">{props.children}</div>
        <div className="modal-dialog-buttons">
          <Button testid="dialog-ok" onClick={props.onOk}>
            OK
          </Button>
          <Button testid="dialog-cancel" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
