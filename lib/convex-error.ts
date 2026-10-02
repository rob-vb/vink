import { ConvexError } from "convex/values";

/** Whether an upload was refused for lack of Pages (see convex/pages.ts). */
export function isOutOfPages(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    error.data.code === "out_of_pages"
  );
}
