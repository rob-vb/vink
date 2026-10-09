// In-app notifications for Admins, such as a Delivery that failed.
import { orgMutation, orgQuery } from "./lib/functions";

const RECENT = 30;

export const list = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .order("desc")
      .take(RECENT);
    return notifications.map((n) => ({
      id: n._id,
      text: n.text,
      submissionId: n.submissionId ?? null,
      at: n.at,
      read: n.readBy.includes(ctx.userId),
    }));
  },
});

export const unreadCount = orgQuery({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .order("desc")
      .take(RECENT);
    return notifications.filter((n) => !n.readBy.includes(ctx.userId)).length;
  },
});

export const markAllRead = orgMutation({
  role: "admin",
  args: {},
  handler: async (ctx) => {
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_organisationId", (q) => q.eq("organisationId", ctx.organisationId))
      .order("desc")
      .take(RECENT);
    for (const n of notifications) {
      if (!n.readBy.includes(ctx.userId)) {
        await ctx.db.patch(n._id, { readBy: [...n.readBy, ctx.userId] });
      }
    }
  },
});
