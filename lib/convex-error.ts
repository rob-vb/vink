import { ConvexError } from "convex/values";

/** Whether an upload was refused for lack of Items (see convex/items.ts). */
export function isOutOfItems(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    error.data.code === "out_of_items"
  );
}
