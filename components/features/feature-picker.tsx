"use client";

import { ArrowRight, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "cn";

export type Feature = {
  id: string;
  title: string;
  text: string;
  bullets: string[];
  links?: Array<{ label: string; href: string }>;
  visual: ReactNode;
};

/**
 * One chapter's features: a list on the left (the open one shows its text
 * and links) and the open feature's picture on the right. Stacks on mobile,
 * list first.
 */
export function FeaturePicker({ features }: { features: Feature[] }) {
  const [open, setOpen] = useState(features[0]?.id);

  return (
    <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <ul className="flex flex-col">
        {features.map((feature) => {
          const active = feature.id === open;
          return (
            <li
              key={feature.id}
              className={cn(
                "border-l-2 py-1 pl-5 transition-colors",
                active ? "border-foreground" : "border-border hover:border-foreground/30",
              )}
            >
              <button
                type="button"
                aria-expanded={active}
                aria-controls={`feature-${feature.id}`}
                onClick={() => setOpen(feature.id)}
                className={cn(
                  "w-full cursor-pointer py-2 text-left text-lg font-semibold tracking-tight transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {feature.title}
              </button>
              {active && (
                <div className="animate-in pb-4 duration-300 fade-in-0">
                  <p className="text-muted-foreground">{feature.text}</p>
                  <ul className="mt-4 flex flex-col gap-2 text-sm">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  {feature.links && (
                    <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
                      {feature.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        >
                          {link.label}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="min-w-0">
        {features.map((feature) => (
          <figure
            key={feature.id}
            id={`feature-${feature.id}`}
            hidden={feature.id !== open}
            className="m-0"
          >
            {feature.visual}
          </figure>
        ))}
      </div>
    </div>
  );
}
