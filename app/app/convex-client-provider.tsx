"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  const [useAuth] = useState(() => createUseAuth(initialToken ?? null));
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

/**
 * Stands in for ConvexBetterAuthProvider. That one builds a new
 * fetchAccessToken when the session first loads, after the server-rendered
 * token already authenticated Convex. Convex then sends "Authenticate None"
 * before re-authenticating, and a query that runs in that gap throws
 * Unauthenticated, which crashes the page ("This page couldn't load").
 * Here the token fetcher only changes when the signed-in session changes.
 */
function createUseAuth(initialToken: string | null) {
  return function useAuthFromBetterAuth() {
    const { data: session, isPending } = authClient.useSession();
    const sessionId = isPending ? undefined : (session?.session.id ?? null);

    // generation counts session changes after the first one we see: the
    // first load confirms the session behind initialToken, it isn't a change.
    const [seen, setSeen] = useState<{ sessionId: string | null | undefined; generation: number }>({
      sessionId: undefined,
      generation: 0,
    });
    if (sessionId !== undefined && sessionId !== seen.sessionId) {
      setSeen({
        sessionId,
        generation: seen.sessionId === undefined ? seen.generation : seen.generation + 1,
      });
    }
    const { generation } = seen;
    const hasInitialToken = initialToken !== null && generation === 0;

    const cache = useRef<{ generation: number; token: Promise<string | null> } | null>(
      initialToken === null ? null : { generation: 0, token: Promise.resolve(initialToken) },
    );
    const fetchAccessToken = useCallback(
      async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
        if (!forceRefreshToken && cache.current?.generation === generation) {
          return cache.current.token;
        }
        const token = authClient.convex
          .token({ fetchOptions: { throw: false } })
          .then(({ data }) => data?.token ?? null)
          .catch(() => null);
        const entry = { generation, token };
        cache.current = entry;
        // A failed fetch isn't cached, so the next call tries again.
        void token.then((value) => {
          if (value === null && cache.current === entry) cache.current = null;
        });
        return token;
      },
      [generation],
    );

    const signedIn = session?.session !== undefined;
    return useMemo(
      () => ({
        isLoading: isPending && !hasInitialToken,
        isAuthenticated: signedIn || (isPending && hasInitialToken),
        fetchAccessToken,
      }),
      [isPending, hasInitialToken, signedIn, fetchAccessToken],
    );
  };
}
