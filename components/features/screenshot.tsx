import { existsSync } from "node:fs";
import path from "node:path";
import { BrowserFrame } from "./browser-frame";

/**
 * A real app screenshot from public/screenshots/<name>.png (light mode, demo
 * data), in a browser frame. Checked when the page is built: until the file
 * exists, a quiet placeholder of the same shape stands in.
 *
 * TODO(Rob): add the missing files listed in the Features page report.
 */
export function Screenshot({
  name,
  alt,
  framePath,
  placeholder,
}: {
  name: string;
  alt: string;
  framePath: string;
  /** Names the screen while its file is missing. */
  placeholder: string;
}) {
  const file = `/screenshots/${name}.png`;
  const exists = existsSync(path.join(process.cwd(), "public", file));
  return (
    <BrowserFrame path={framePath}>
      {exists ? (
        // A plain <img>: the files are already sized for the frame.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file} alt={alt} loading="lazy" className="block h-auto w-full" />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="relative flex aspect-[16/11] flex-col gap-3 bg-background p-5"
        >
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-muted" />
            <div className="h-7 w-24 rounded-md bg-muted" />
          </div>
          <div className="h-3 w-56 max-w-full rounded bg-muted/70" />
          <div className="mt-2 flex flex-1 flex-col overflow-hidden rounded-lg border">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="h-3 w-2/5 rounded bg-muted" />
                <div className="ml-auto h-3 w-16 rounded bg-muted/70" />
              </div>
            ))}
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center font-mono text-[11px] text-muted-foreground">
            {placeholder}
          </p>
        </div>
      )}
    </BrowserFrame>
  );
}
