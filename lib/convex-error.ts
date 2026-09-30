import { ConvexError } from "convex/values";

/** A Convex function's refusal as text: its message, or `fallback` for anything else. */
export function errorText(error: unknown, fallback: string): string {
  if (!(error instanceof ConvexError)) return fallback;
  const { data } = error;
  if (typeof data === "object" && data !== null && "message" in data) return String(data.message);
  return String(data);
}

/** Whether an upload was refused for lack of Pages (see convex/pages.ts). */
export function isOutOfPages(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    error.data.code === "out_of_pages"
  );
}
