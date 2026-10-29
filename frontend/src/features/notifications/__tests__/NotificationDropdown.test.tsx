import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Providers } from "../../../app/providers";
import { NotificationDropdown } from "../NotificationDropdown";
import type { NotificationItem } from "../notification-types";

const mockNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    type: "result",
    titleKey: "notifications.resultReadyTitle",
    titleFallback: "Poll Results Finalized",
    pollTitle: "Campus activity preferences · B07",
    messageKey: "notifications.resultReadyDesc",
    messageFallback: "Voting has ended. View final results and winning choices.",
    pollId: 1,
    targetUrl: "/polls/1/results",
    timestamp: new Date().toISOString(),
    read: false,
  },
  {
    id: "notif-2",
    type: "new_poll",
    titleKey: "notifications.newPollTitle",
    titleFallback: "Active Poll Ready",
    pollTitle: "Upcoming campus event",
    messageKey: "notifications.newPollDesc",
    messageFallback: "Open for voting now in Overview. Have your say!",
    pollId: 2,
    targetUrl: "/polls/2",
    timestamp: new Date().toISOString(),
    read: true,
  },
];

describe("NotificationDropdown", () => {
  it("renders notification items, unread count badge, and filter tabs", () => {
    render(
      <Providers>
        <MemoryRouter>
          <NotificationDropdown
            notifications={mockNotifications}
            unreadCount={1}
            onMarkAsRead={vi.fn()}
            onMarkAllAsRead={vi.fn()}
            onClearAll={vi.fn()}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </Providers>,
    );

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByTestId("notif-unread-count")).toHaveTextContent("1");
    expect(screen.getByText("All (2)")).toBeInTheDocument();
    expect(screen.getByText("Unread (1)")).toBeInTheDocument();
    expect(screen.getByText("Campus activity preferences · B07")).toBeInTheDocument();
    expect(screen.getByText("Upcoming campus event")).toBeInTheDocument();
  });

  it("filters unread notifications when Unread tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <MemoryRouter>
          <NotificationDropdown
            notifications={mockNotifications}
            unreadCount={1}
            onMarkAsRead={vi.fn()}
            onMarkAllAsRead={vi.fn()}
            onClearAll={vi.fn()}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </Providers>,
    );

    await user.click(screen.getByText("Unread (1)"));
    expect(screen.getByText("Campus activity preferences · B07")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming campus event")).not.toBeInTheDocument();
  });

  it("triggers onMarkAllAsRead when Mark all read button is clicked", async () => {
    const user = userEvent.setup();
    const handleMarkAll = vi.fn();
    render(
      <Providers>
        <MemoryRouter>
          <NotificationDropdown
            notifications={mockNotifications}
            unreadCount={1}
            onMarkAsRead={vi.fn()}
            onMarkAllAsRead={handleMarkAll}
            onClearAll={vi.fn()}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </Providers>,
    );

    const markAllBtn = screen.getByText("Mark all read");
    await user.click(markAllBtn);
    expect(handleMarkAll).toHaveBeenCalledTimes(1);
  });

  it("triggers onMarkAsRead and onClose when an unread item is clicked", async () => {
    const user = userEvent.setup();
    const handleMarkAsRead = vi.fn();
    const handleClose = vi.fn();

    render(
      <Providers>
        <MemoryRouter>
          <NotificationDropdown
            notifications={mockNotifications}
            unreadCount={1}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={vi.fn()}
            onClearAll={vi.fn()}
            onClose={handleClose}
          />
        </MemoryRouter>
      </Providers>,
    );

    const item = screen.getByText("Campus activity preferences · B07");
    await user.click(item);

    expect(handleMarkAsRead).toHaveBeenCalledWith("notif-1");
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders empty state when list is empty", () => {
    render(
      <Providers>
        <MemoryRouter>
          <NotificationDropdown
            notifications={[]}
            unreadCount={0}
            onMarkAsRead={vi.fn()}
            onMarkAllAsRead={vi.fn()}
            onClearAll={vi.fn()}
            onClose={vi.fn()}
          />
        </MemoryRouter>
      </Providers>,
    );

    expect(screen.getByText("No new notifications")).toBeInTheDocument();
  });
});

