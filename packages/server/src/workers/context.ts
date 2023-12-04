export type BackgroundJobInteraction = 'create' | 'update' | 'delete';

export interface BackgroundJobContext {
  interaction: BackgroundJobInteraction;
}
