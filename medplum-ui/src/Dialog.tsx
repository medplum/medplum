import React from 'react';
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

interface DialogProps {
  visible: boolean;
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

export class Dialog extends React.Component<DialogProps, DialogState> {
  mouseUpHandler: (this: Document, ev: React.MouseEvent) => any;
  mouseMoveHandler: (this: Document, ev: React.MouseEvent) => any;

  constructor(props: DialogProps) {
    super(props);

    this.state = {
      x: 100,
      y: 100,
      dragging: false,
      dragX: 0,
      dragY: 0
    };

    this.mouseUpHandler = this.handleMouseUp.bind(this);
    this.mouseMoveHandler = this.handleMouseMove.bind(this);
  }

  render() {
    if (!this.props.visible) {
      return null;
    }
    return (
      <>
        <div className="modal-dialog-bg"></div>
        <div className="modal-dialog" tabIndex={0} style={{ left: this.state.x + 'px', top: this.state.y + 'px' }}>
          <div className="modal-dialog-title" onMouseDown={e => this.handleMouseDown(e)}>
            <span className="modal-dialog-title-text">Dialog</span>
            <span className="modal-dialog-title-close" tabIndex={0} onClick={this.props.onCancel}></span>
          </div>
          <div className="modal-dialog-content">
            {this.props.children}
          </div>
          <div className="modal-dialog-buttons">
            <button onClick={this.props.onOk}>OK</button>
            <button onClick={this.props.onCancel}>Cancel</button>
          </div>
        </div>
      </>
    );
  }

  handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mouseup', this.mouseUpHandler as any, true);
    document.addEventListener('mousemove', this.mouseMoveHandler as any, true);
    this.setState({
      dragging: true,
      dragX: e.clientX - this.state.x,
      dragY: e.clientY - this.state.y
    });
  }

  handleMouseUp(e: React.MouseEvent) {
    if (!this.state.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    document.removeEventListener('mouseup', this.mouseUpHandler as any, true);
    document.removeEventListener('mousemove', this.mouseMoveHandler as any, true);
  }

  handleMouseMove(e: React.MouseEvent) {
    if (!this.state.dragging) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.setState({
      x: e.clientX - this.state.dragX,
      y: e.clientY - this.state.dragY
    });
  }
}
