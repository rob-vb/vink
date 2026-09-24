/** A sign-in or sign-up that started from an invite link returns there, and nowhere else. */
export function invitePath(next: string | string[] | undefined): string | null {
  return typeof next === "string" && /^\/invite\/[\w-]+$/.test(next) ? next : null;
}
