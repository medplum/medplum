export interface QueueItem {
  channel: string;
  remote: string;
  body: string;
}

export interface Channel {
  start(): void;
  stop(): void;
  sendToRemote(message: QueueItem): void;
}
