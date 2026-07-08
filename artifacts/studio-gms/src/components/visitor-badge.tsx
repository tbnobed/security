import { forwardRef } from "react";
import { CLIENT_LOGO_URL, SITE_NAME } from "@/lib/site";

export interface VisitorBadgeData {
  badgeId: string;
  name: string;
  company: string;
  host: string;
  site: string;
  studios: string[];
  purpose?: string;
  checkinAt: string;
  expectedDeparture?: string | null;
  photo?: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function timeLabel(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * A physical 3in x 2in landscape visitor badge, styled for print.
 * The outer element carries id="print-badge" so the global print CSS can
 * isolate it on the page (see index.css @media print rules).
 */
export const VisitorBadge = forwardRef<HTMLDivElement, { data: VisitorBadgeData }>(
  function VisitorBadge({ data }, ref) {
    const site = data.site || SITE_NAME;
    return (
      <div
        id="print-badge"
        ref={ref}
        className="visitor-badge mx-auto flex flex-col overflow-hidden rounded-md border border-gray-300 shadow-sm"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-2.5 py-1 text-white"
          style={{ background: "#0b0e1a" }}
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.18em]">Visitor Pass</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="max-w-[1.3in] truncate text-[8px] font-medium uppercase tracking-wider text-gray-300">
              {site}
            </span>
            {CLIENT_LOGO_URL && (
              <img
                src={CLIENT_LOGO_URL}
                alt=""
                className="h-[0.16in] w-auto max-w-[0.6in] shrink-0 rounded-[2px] bg-white object-contain p-[1px]"
              />
            )}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1 gap-2 px-2.5 py-1.5">
          {/* Photo */}
          <div className="flex h-[0.95in] w-[0.8in] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-gray-300 bg-gray-100">
            {data.photo ? (
              <img src={data.photo} alt={data.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[18px] font-bold text-gray-400">{initials(data.name) || "?"}</span>
            )}
          </div>

          {/* Details */}
          <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
            <div className="truncate text-[13px] font-bold text-gray-900">{data.name}</div>
            <div className="truncate text-[9px] font-medium text-gray-800">{data.company}</div>
            <div className="mt-1 space-y-0.5 text-[8px] font-medium text-black">
              <div className="truncate">
                <span className="font-bold uppercase tracking-wide text-gray-900">Host </span>
                {data.host}
              </div>
              {data.purpose && (
                <div className="truncate">
                  <span className="font-bold uppercase tracking-wide text-gray-900">Purpose </span>
                  {data.purpose}
                </div>
              )}
              {data.studios.length > 0 && (
                <div className="truncate">
                  <span className="font-bold uppercase tracking-wide text-gray-900">Studios </span>
                  {data.studios.join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer / badge id band */}
        <div
          className="flex items-center justify-between px-2.5 py-1"
          style={{ background: "#f1f5f9", borderTop: "1px solid #e2e8f0" }}
        >
          <span className="font-mono text-[13px] font-bold tracking-wider" style={{ color: "#0f766e" }}>
            {data.badgeId}
          </span>
          <div className="text-right text-[9px] font-semibold leading-tight text-black">
            <div>In {timeLabel(data.checkinAt)}</div>
            <div>Out {timeLabel(data.expectedDeparture)}</div>
          </div>
        </div>
      </div>
    );
  },
);
