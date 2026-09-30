"use client";

import { useMutation, useQuery } from "convex/react";
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
import { describeProblem, roles, type Role } from "./roles";

type Confirming =
  | { kind: "remove"; membershipId: Id<"memberships">; email: string }
  | { kind: "revoke"; invitationId: Id<"invitations">; email: string };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function MembersList({ organisationSlug }: { organisationSlug: string }) {
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
      toast.success(`${email} is now ${role === "admin" ? "an Admin" : "a Member"}`);
    } catch (error) {
      toast.error(describeProblem(error, "We couldn't change the role."));
    }
  }

  async function onConfirm() {
    if (!confirming) return;
    try {
      if (confirming.kind === "remove") {
        await remove({ organisationSlug, membershipId: confirming.membershipId });
        toast.success(`${confirming.email} was removed`);
      } else {
        await revoke({ organisationSlug, invitationId: confirming.invitationId });
        toast.success(`The invitation for ${confirming.email} was revoked`);
      }
    } catch (error) {
      toast.error(describeProblem(error, "That didn't work. Try again."));
    } finally {
      setConfirmOpen(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Members</h1>
          <p className="text-sm text-muted-foreground">
            Admins manage Forms, Integrations and Members. Members upload, review and approve
            Documents.
          </p>
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
                  <TableHead>Email</TableHead>
                  <TableHead className="w-36">Role</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.membershipId}>
                    <TableCell className="max-w-0 w-full">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{member.email || "—"}</span>
                        {member.isYou && <Badge variant="secondary">You</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.isYou ? (
                        <Badge variant="outline">
                          {member.role === "admin" ? "Admin" : "Member"}
                        </Badge>
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
                            aria-label={`Role of ${member.email}`}
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
                          Remove
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
                Pending invitations ({data.invitations.length})
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-36">Role</TableHead>
                      <TableHead className="hidden w-36 sm:table-cell">Expires</TableHead>
                      <TableHead className="w-24">
                        <span className="sr-only">Actions</span>
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
                          <Badge variant="outline">
                            {invitation.role === "admin" ? "Admin" : "Member"}
                          </Badge>
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
                            Revoke
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
              {confirming?.kind === "revoke" ? "Revoke invitation?" : "Remove Member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.kind === "revoke"
                ? `The link sent to ${confirming.email} stops working.`
                : `${confirming?.email} loses access to this Organisation at once.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void onConfirm()}>
              {confirming?.kind === "revoke" ? "Revoke" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
