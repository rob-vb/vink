"use client";

import { useQuery } from "convex/react";
import { Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";

/** The active Organisation is the one in the URL; switching changes the slug. */
export function OrganisationSwitcher({ slug, name }: { slug: string; name: string }) {
  const organisations = useQuery(api.organisations.mine);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="min-w-0 shrink gap-1 px-2 font-medium">
            <span className="truncate">{name}</span>
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organisations</DropdownMenuLabel>
          {(organisations ?? [{ slug, name, role: null }]).map((organisation) => (
            <DropdownMenuItem
              key={organisation.slug}
              render={<Link href={`/app/o/${organisation.slug}`} />}
            >
              <Check className={organisation.slug === slug ? "" : "invisible"} />
              <span className="flex-1 truncate">{organisation.name}</span>
              {organisation.role && (
                <span className="text-xs text-muted-foreground">
                  {organisation.role === "admin" ? "Admin" : "Member"}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
