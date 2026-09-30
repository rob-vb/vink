"use client";

import type { ComponentProps } from "react";
import { authClient } from "@/lib/auth-client";
import { trackLoginClick, trackSignUpClick } from "@/lib/analytics";
import { APP_PATH, SIGN_UP_PATH } from "@/lib/site";

// Links into the product are plain <a>: /app has its own root layout, so the
// visit is a full page load and gtag never follows into the app.

type AnchorProps = Omit<ComponentProps<"a">, "href"> & { location: string };

/** "Start free": straight to account creation, measured as a sign-up click. */
export function StartFreeLink({ location, onClick, ...props }: AnchorProps) {
  return (
    <a
      href={SIGN_UP_PATH}
      onClick={(event) => {
        trackSignUpClick(location);
        onClick?.(event);
      }}
      {...props}
    />
  );
}

/**
 * The quiet "Log in", which reads "Open app" once a session exists. It is
 * resolved in the browser, so the page itself stays static. Both go to /app.
 */
export function AccountLink({
  location,
  logIn,
  openApp,
  onClick,
  ...props
}: AnchorProps & { logIn: string; openApp: string }) {
  const { data } = authClient.useSession();
  return (
    <a
      href={APP_PATH}
      onClick={(event) => {
        trackLoginClick(location);
        onClick?.(event);
      }}
      {...props}
    >
      {data?.session ? openApp : logIn}
    </a>
  );
}

/** A plain "Log in" (closing card): always that text, always /app. */
export function LogInLink({ location, onClick, ...props }: AnchorProps) {
  return (
    <a
      href={APP_PATH}
      onClick={(event) => {
        trackLoginClick(location);
        onClick?.(event);
      }}
      {...props}
    />
  );
}
