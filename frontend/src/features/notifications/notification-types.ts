import type { MessageKey } from "../../i18n/messages";

export type NotificationType =
  | "result"
  | "new_poll"
  | "cap"
  | "vote"
  | "system"
  | "election_approved"
  | "election_rejected"
  | "election_pending"
  | "election_voting_open";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  titleKey: MessageKey;
  titleFallback: string;
  pollTitle?: string;
  messageKey: MessageKey;
  messageFallback: string;
  pollId?: number;
  targetUrl: string;
  timestamp: string; // ISO 8601
  read: boolean;
}
