"use client";

import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InviteDialog } from "./invite-dialog";
import { useDescribeProblem, useRoles, type Role } from "./roles";

type Confirming =
  | { kind: "remove"; membershipId: Id<"memberships">; email: string }
  | { kind: "revoke"; invitationId: Id<"invitations">; email: string };

export function MembersList({ organisationSlug }: { organisationSlug: string }) {
  const t = useTranslations("appMembers");
  const tRoles = useTranslations("app.roles");
  const locale = useLocale();
  const roles = useRoles();
  const describeProblem = useDescribeProblem();
  const dateFormat = new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", { dateStyle: "medium" });
  const data = useQuery(api.memberships.list, { organisationSlug });
  const changeRole = useMutation(api.memberships.changeRole);
  const remove = useMutation(api.memberships.remove);
  const revoke = useMutation(api.invitations.revoke);
  // Kept after closing so the dialog's text doesn't blank out while it fades.
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirm(action: Confirming) {
    setConfirming(action);
    setConfirmOpen(true);
  }

  async function onChangeRole(membershipId: Id<"memberships">, email: string, role: Role) {
    try {
      await changeRole({ organisationSlug, membershipId, role });
      toast.success(t("nowRole", { email, role }));
    } catch (error) {
      toast.error(describeProblem(error, t("roleNotChanged")));
    }
  }

  async function onConfirm() {
    if (!confirming) return;
    try {
      if (confirming.kind === "remove") {
        await remove({ organisationSlug, membershipId: confirming.membershipId });
        toast.success(t("removed", { email: confirming.email }));
      } else {
        await revoke({ organisationSlug, invitationId: confirming.invitationId });
        toast.success(t("revoked", { email: confirming.email }));
      }
    } catch (error) {
      toast.error(describeProblem(error, t("failed")));
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <InviteDialog organisationSlug={organisationSlug} />
      </div>

      {data === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead className="w-36">{t("role")}</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell className="max-w-0 w-full">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{member.email || "—"}</span>
                        {member.isYou && <Badge variant="secondary">{t("you")}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.isYou ? (
                        <Badge variant="outline">{tRoles(member.role)}</Badge>
                      ) : (
                        <Select
                          items={roles}
                          value={member.role}
                          onValueChange={(role) =>
                            role &&
                            role !== member.role &&
                            void onChangeRole(member.membershipId, member.email, role as Role)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-28"
                            aria-label={t("roleOf", { email: member.email })}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!member.isYou && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            confirm({
                              kind: "remove",
                              membershipId: member.membershipId,
                              email: member.email,
                            })
                          }
                        >
                          {t("remove")}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {data.invitations.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium">
                {t("pending", { count: data.invitations.length })}
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("email")}</TableHead>
                      <TableHead className="w-36">{t("role")}</TableHead>
                      <TableHead className="hidden w-36 sm:table-cell">{t("expires")}</TableHead>
                      <TableHead className="w-24">
                        <span className="sr-only">{t("actions")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invitations.map((invitation) => (
                      <TableRow key={invitation.invitationId}>
                        <TableCell className="max-w-0 w-full truncate">
                          {invitation.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tRoles(invitation.role)}</Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {dateFormat.format(invitation.expiresAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              confirm({
                                kind: "revoke",
                                invitationId: invitation.invitationId,
                                email: invitation.email,
                              })
                            }
                          >
                            {t("revoke")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.kind === "revoke" ? t("revokeTitle") : t("removeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === "revoke"
                ? t("revokeDescription", { email: confirming.email })
                : t("removeDescription", { email: confirming?.email ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onConfirm()}>
              {confirming?.kind === "revoke" ? t("revoke") : t("remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
