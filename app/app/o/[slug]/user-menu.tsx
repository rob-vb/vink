"use client";

import { LogOut, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { LanguageMenu } from "../../language-switcher";
import { DeleteAccountDialog } from "./delete-account-dialog";

export function UserMenu({
  organisationSlug,
  isAdmin,
}: {
  organisationSlug: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("app.shell");
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const email = session?.user.email ?? "";
  const [deleting, setDeleting] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.push("/app/sign-in");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label={t("account")}
            >
              <Avatar className="size-8">
                <AvatarFallback>
                  {email.slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {isAdmin && (
            <>
              <DropdownMenuItem
                render={<Link href={`/app/o/${organisationSlug}/settings`} />}
              >
                <Settings />
                {t("organisationSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <LanguageMenu />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut />
            {t("signOut")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            {t("deleteAccount")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog
        open={deleting}
        onOpenChange={setDeleting}
        email={email}
      />
    </>
  );
}
