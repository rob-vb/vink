import { demoPages } from "@/components/demo/demo-papers";
import { ScaledStill } from "./scaled-still";

const pages = [
  { Page: demoPages.invoice[0], tilt: "-rotate-2" },
  { Page: demoPages.claim[0], tilt: "rotate-1" },
  { Page: demoPages.service[0], tilt: "-rotate-1" },
  { Page: demoPages.order[0], tilt: "rotate-2" },
];

/** The demo's four kinds of paper side by side: typed, a form filled in on a computer, handwritten, faxed. */
export function PapersStill({ label }: { label: string }) {
  return (
    <div className="light rounded-2xl bg-[#EDF0F4] p-3 sm:p-5">
      <ScaledStill width={960} fade={false} label={label} className="rounded-lg bg-transparent">
        <div className="flex flex-wrap justify-center gap-6 px-4 py-8">
          {pages.map(({ Page, tilt }, i) => (
            <div key={i} className={tilt} style={{ zoom: 0.42 }}>
              <Page />
            </div>
          ))}
        </div>
      </ScaledStill>
    </div>
  );
}
