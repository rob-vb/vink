"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";

/** Makes the new user Admin of their Organisation, then opens it. */
export function FinishSignUp({ organisation }: { organisation: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const createOrganisation = useMutation(api.onboarding.createOrganisation);
  const started = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/app/sign-in");
      return;
    }
    if (started.current) return;
    started.current = true;
    void createOrganisation({ name: organisation }).then(({ slug }) =>
      router.replace(`/app/o/${slug}`),
    );
  }, [createOrganisation, isAuthenticated, isLoading, organisation, router]);

  return (
    <main className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
      <Spinner />
      Setting up your Organisation…
    </main>
  );
}
