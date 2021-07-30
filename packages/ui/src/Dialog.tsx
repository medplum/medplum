import React, { useRef, useState } from 'react';
import { Button } from './Button';
import './Dialog.css';

export const DialogEventType = {
  SELECT: 'select'
};

export const DialogButtonKeys = {
  OK: 'ok'
};

export class DialogEvent extends Event {
  key: string;
  caption: string;

  constructor(key: string, caption: string) {
    super(key);
    this.key = key;
    this.caption = caption;
  }
}

export interface DialogProps {
  visible: boolean;
  children?: React.ReactNode;
  onOk: () => void;
  onCancel: () => void;
}

interface DialogState {
  x: number;
  y: number;
  dragging: boolean;
  dragX: number;
  dragY: number;
}

export function Dialog(props: DialogProps) {
  const [state, setState] = useState<DialogState>({
    x: 100,
    y: 100,
    dragging: false,
    dragX: 0,
    dragY: 0
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  if (!props.visible) {
    return null;
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('mousemove', handleMouseMove as any, true);
    setState({
      ...stateRef.current,
      dragging: true,
      dragX: e.clientX - state.x,
      dragY: e.clientY - state.y
    });
  }

  function handleMouseUp(e: MouseEvent) {
    if (!state.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('mouseup', handleMouseUp as any, true);
    document.removeEventListener('mousemove', handleMouseMove as any, true);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!state.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setState({
      ...stateRef.current,
      x: e.clientX - state.dragX,
      y: e.clientY - state.dragY
    });
  }

  return (
    <>
      <div className="modal-dialog-bg"></div>
      <div className="modal-dialog" tabIndex={0} style={{ left: state.x + 'px', top: state.y + 'px' }}>
        <div className="modal-dialog-title" onMouseDown={e => handleMouseDown(e)}>
          <span className="modal-dialog-title-text">Dialog</span>
          <span className="modal-dialog-title-close" tabIndex={0} onClick={props.onCancel}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        </div>
        <div className="modal-dialog-content">
          {props.children}
        </div>
        <div className="modal-dialog-buttons">
          <Button testid="dialog-ok" onClick={props.onOk}>OK</Button>
          <Button testid="dialog-cancel" onClick={props.onCancel}>Cancel</Button>
        </div>
      </div>
    </>
  );
}
