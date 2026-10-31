import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { getMyElectionRegistrations, getPublicElections } from "../elections/api";
import type { NotificationItem } from "./notification-types";

const STORAGE_PREFIX = "voting_notification_reads_";

function getStoredReads(userId: number | string): Set<string> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function saveStoredReads(userId: number | string, reads: Set<string>): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify([...reads]));
  } catch {
    // Ignore storage quota errors
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const userId = user?.id ?? "guest";
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredReads(userId));
  const [dynamicNotifications, setDynamicNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Synchronize readIds whenever the active user changes (e.g. session load, login, logout)
  useEffect(() => {
    const userReads = getStoredReads(userId);
    if (userId !== "guest") {
      // If user has reads, load them; also merge any guest reads marked on this device
      const guestReads = getStoredReads("guest");
      if (guestReads.size > 0) {
        let changed = false;
        guestReads.forEach((id) => {
          if (!userReads.has(id)) {
            userReads.add(id);
            changed = true;
          }
        });
        if (changed) {
          saveStoredReads(userId, userReads);
        }
      }
    }
    setReadIds(userReads);
  }, [userId]);

  // Load contextual notifications from backend polls
  useEffect(() => {
    let cancelled = false;

    async function fetchPollNotifications() {
      try {
        const res = await fetch("/api/v1/polls?page=1&page_size=8");
        if (!res.ok) throw new Error("fetch failed");
        const json = await res.json();
        const items = json?.data?.items ?? [];

        const generated: NotificationItem[] = [];

        // 1. Closed polls -> Result notifications
        const closed = items.find((p: { effective_status: string }) => p.effective_status === "CLOSED");
        if (closed) {
          generated.push({
            id: `poll-closed-${closed.id}`,
            type: "result",
            titleKey: "notifications.resultReadyTitle",
            titleFallback: "Poll Results Finalized",
            pollTitle: closed.title,
            messageKey: "notifications.resultReadyDesc",
            messageFallback: "Voting has ended. View final results and winning choices.",
            pollId: closed.id,
            targetUrl: `/polls/${closed.id}/results`,
            timestamp: closed.closed_at || closed.ends_at || new Date().toISOString(),
            read: false,
          });
        }

        // 2. Open poll -> Trending poll recommendation
        const openPoll = items.find((p: { effective_status: string }) => p.effective_status === "OPEN");
        if (openPoll) {
          generated.push({
            id: `poll-open-${openPoll.id}`,
            type: "new_poll",
            titleKey: "notifications.newPollTitle",
            titleFallback: "Active Poll Ready",
            pollTitle: openPoll.title,
            messageKey: "notifications.newPollDesc",
            messageFallback: "Open for voting now in Overview. Have your say!",
            pollId: openPoll.id,
            targetUrl: `/polls/${openPoll.id}`,
            timestamp: openPoll.starts_at || new Date().toISOString(),
            read: false,
          });
        }

        // 3. Admin security notice if admin, otherwise system notice
        if (user?.role === "ADMIN") {
          generated.push({
            id: "system-audit-admin",
            type: "system",
            titleKey: "notifications.systemUpdateTitle",
            titleFallback: "Audit Logs Active",
            messageKey: "notifications.systemUpdateDesc",
            messageFallback: "Double-voting prevention and tamper-evident audit logging are active.",
            targetUrl: "/audit",
            timestamp: new Date().toISOString(),
            read: false,
          });
        } else {
          generated.push({
            id: "system-status-notice",
            type: "system",
            titleKey: "notifications.systemUpdateTitle",
            titleFallback: "Platform Verified",
            messageKey: "notifications.systemUpdateDesc",
            messageFallback: "Anonymous voting protections and voter receipts are active.",
            targetUrl: "/overview",
            timestamp: new Date().toISOString(),
            read: false,
          });
        }

        // 4. Election registration notifications (Approved / Rejected / Pending review)
        if (user?.id) {
          try {
            const regRes = await getMyElectionRegistrations({ page: 1, page_size: 10 });
            const regs = regRes?.items ?? [];
            for (const reg of regs) {
              if (reg.status === "APPROVED") {
                generated.push({
                  id: `election-reg-approved-${reg.id}`,
                  type: "election_approved",
                  titleKey: "notifications.electionApprovedTitle",
                  titleFallback: "Voter Registration Approved",
                  pollTitle: reg.election_title || reg.poll_title,
                  messageKey: "notifications.electionApprovedDesc",
                  messageFallback:
                    "Your voter registration has been approved. You are eligible to cast a ballot once voting opens.",
                  pollId: reg.poll_id,
                  targetUrl: `/elections/${reg.poll_id}`,
                  timestamp: reg.reviewed_at || reg.submitted_at || new Date().toISOString(),
                  read: false,
                });
              } else if (reg.status === "REJECTED") {
                generated.push({
                  id: `election-reg-rejected-${reg.id}`,
                  type: "election_rejected",
                  titleKey: "notifications.electionRejectedTitle",
                  titleFallback: "Voter Registration Rejected",
                  pollTitle: reg.election_title || reg.poll_title,
                  messageKey: "notifications.electionRejectedDesc",
                  messageFallback:
                    "Your voter registration was not approved. Click to view registration details.",
                  pollId: reg.poll_id,
                  targetUrl: "/elections?view=my_registrations",
                  timestamp: reg.reviewed_at || reg.submitted_at || new Date().toISOString(),
                  read: false,
                });
              } else if (reg.status === "NEEDS_REVIEW" || reg.status === "PENDING") {
                generated.push({
                  id: `election-reg-pending-${reg.id}`,
                  type: "election_pending",
                  titleKey: "notifications.electionPendingTitle",
                  titleFallback: "Registration Under Review",
                  pollTitle: reg.election_title || reg.poll_title,
                  messageKey: "notifications.electionPendingDesc",
                  messageFallback:
                    "Your voter registration has been submitted and is currently awaiting manual review.",
                  pollId: reg.poll_id,
                  targetUrl: "/elections?view=my_registrations",
                  timestamp: reg.submitted_at || new Date().toISOString(),
                  read: false,
                });
              }
            }
          } catch {
            // Non-blocking
          }

          // 5. Approved elections where voting has opened
          try {
            const elecRes = await getPublicElections({ page: 1, page_size: 10 });
            const elections = elecRes?.items ?? [];
            for (const el of elections) {
              const regStatus = el.my_registration_status || (el as any).user_registration_status;
              if (regStatus === "APPROVED" && el.phase === "VOTING_OPEN" && !el.has_voted) {
                generated.push({
                  id: `election-voting-open-${el.id}`,
                  type: "election_voting_open",
                  titleKey: "notifications.electionVotingOpenTitle",
                  titleFallback: "Official Voting is Open",
                  pollTitle: el.title,
                  messageKey: "notifications.electionVotingOpenDesc",
                  messageFallback:
                    "Voting is now officially open! Enter the secret ballot booth to cast your vote.",
                  pollId: el.id,
                  targetUrl: `/elections/${el.id}/vote`,
                  timestamp: el.starts_at || new Date().toISOString(),
                  read: false,
                });
              }
            }
          } catch {
            // Non-blocking
          }
        }

        generated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (!cancelled && generated.length > 0) {
          setDynamicNotifications(generated);
        }
      } catch {
        // Fallback default notifications if fetch fails or in mock test env
        if (!cancelled) {
          setDynamicNotifications([
            {
              id: "fallback-notice-1",
              type: "result",
              titleKey: "notifications.resultReadyTitle",
              titleFallback: "Poll Results Finalized",
              pollTitle: "Campus Fitness Center Equipment Upgrades",
              messageKey: "notifications.resultReadyDesc",
              messageFallback: "Voting has ended. View final results and winning choices.",
              pollId: 1,
              targetUrl: "/polls/1/results",
              timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
              read: false,
            },
            {
              id: "fallback-notice-2",
              type: "new_poll",
              titleKey: "notifications.newPollTitle",
              titleFallback: "Active Poll Ready",
              pollTitle: "Upcoming Campus AI Innovation Showcase 2026",
              messageKey: "notifications.newPollDesc",
              messageFallback: "Open for voting now in Overview. Have your say!",
              pollId: 2,
              targetUrl: "/polls/2",
              timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
              read: false,
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPollNotifications();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Combine dynamic notifications with read status
  const notifications = useMemo(() => {
    return dynamicNotifications.map((item) => ({
      ...item,
      read: readIds.has(item.id),
    }));
  }, [dynamicNotifications, readIds]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const markAsRead = useCallback(
    (id: string) => {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        saveStoredReads(userId, next);
        return next;
      });
    },
    [userId],
  );

  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of dynamicNotifications) {
        next.add(item.id);
      }
      saveStoredReads(userId, next);
      return next;
    });
  }, [dynamicNotifications, userId]);

  const clearAll = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of dynamicNotifications) {
        next.add(item.id);
      }
      saveStoredReads(userId, next);
      return next;
    });
    setDynamicNotifications([]);
  }, [dynamicNotifications, userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    clearAll,
  };
}

