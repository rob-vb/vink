import { FileText } from "lucide-react";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-medium">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <FileText className="size-4" />
      </span>
      DocuHelper
    </span>
  );
}
