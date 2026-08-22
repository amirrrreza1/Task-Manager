export interface DispatchNotificationDto {
  recipientUserIds: string[];
  actorId?: string;
  type: string;
  title: string;
  message: string;
  lines?: string[];
  link?: string;
  actionLabel?: string;
  /** When false, skip the SMTP email. Defaults to true. */
  sendEmail?: boolean;
  /** When false, skip the Telegram group message. Defaults to true. */
  sendTelegram?: boolean;
}
