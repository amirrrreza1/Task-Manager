export interface DispatchNotificationDto {
  recipientUserIds: string[];
  actorId?: string;
  type: string;
  title: string;
  message: string;
  lines?: string[];
  link?: string;
  actionLabel?: string;
}
