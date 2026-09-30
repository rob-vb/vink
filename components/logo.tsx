import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/vink_icon.svg"
      alt="Vink"
      width={518}
      height={363}
      priority
      className={cn("h-6 w-auto", className)}
    />
  );
}
