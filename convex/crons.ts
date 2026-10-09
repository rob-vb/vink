import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Retention: delete Submissions' data (and R2 objects) that are past their time.
crons.daily("retention", { hourUTC: 2, minuteUTC: 30 }, internal.retention.run, {});

// Plans: periods that ended start the next one; unused Items and Top-ups expire.
crons.hourly("item periods", { minuteUTC: 5 }, internal.items.advancePeriods, {});

// Sign-in rate-limit counters (IP addresses, emails) older than a day.
crons.daily("auth rate limits", { hourUTC: 2, minuteUTC: 45 }, internal.auth.forgetOldRateLimits, {});

export default crons;
