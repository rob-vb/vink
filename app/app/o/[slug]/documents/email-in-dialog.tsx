"use client";

import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { IntakePanel } from "../forms/intake-panel";

/** Every Member's way to a Form's Intake Address and its Recent emails. */
export function EmailInDialog({
  organisationSlug,
  forms,
  isAdmin,
}: {
  organisationSlug: string;
  forms: Array<{ id: Id<"forms">; name: string }>;
  isAdmin: boolean;
}) {
  const t = useTranslations("appDocuments");
  // "organisation" is the Organisation Intake Address; the Forms' follow.
  const [choice, setChoice] = useState<string>("organisation");
  const items = [
    { value: "organisation", label: t("emailIn.organisation") },
    ...forms.map((f) => ({ value: f.id as string, label: f.name })),
  ];
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Mail />
            {t("emailIn.button")}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("emailIn.title")}</DialogTitle>
          <DialogDescription>{t("emailIn.description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="email-in-form">{t("form")}</FieldLabel>
          <Select
            items={items}
            value={choice}
            onValueChange={(value) => setChoice(value ?? "organisation")}
          >
            <SelectTrigger id="email-in-form" className="w-full">
              <SelectValue placeholder={t("chooseForm")} />
            </SelectTrigger>
            <SelectContent>
              {items.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <IntakePanel
          key={choice}
          organisationSlug={organisationSlug}
          formId={choice === "organisation" ? null : (choice as Id<"forms">)}
          isAdmin={isAdmin}
        />
      </DialogContent>
    </Dialog>
  );
}
