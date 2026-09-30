import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Retention: delete Documents' data (and R2 objects) that are past their time.
crons.daily("retention", { hourUTC: 2, minuteUTC: 30 }, internal.retention.run, {});

// Plans: periods that ended start the next one; unused Pages and Top-ups expire.
crons.hourly("pages periods", { minuteUTC: 5 }, internal.pages.advancePeriods, {});

export default crons;
