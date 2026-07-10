/**
 * Print the current visitor badge.
 *
 * The badge element (id="print-badge") may be rendered inside a Radix dialog
 * portal whose ancestors use CSS transforms/fixed positioning, which breaks the
 * usual "hide everything but the badge" print approach. To stay robust we clone
 * the badge into #print-root — a direct child of <body> — print, then clean up.
 * The @media print rules in index.css handle the layout.
 */
export function printBadge(): void {
  const source = document.getElementById("print-badge");
  if (!source) {
    window.print();
    return;
  }

  // The label media differs per workstation, so the badge carries its physical
  // size in data-* attrs (set by VisitorBadge from the per-desk size in
  // lib/badge-size.ts). Inject a matching @page size rule so the printed page is
  // exactly the label size and the badge fills it — otherwise the browser falls
  // back to a default paper and shrinks the badge into a corner. The value is a
  // strictly validated CSS length (isValidBadgeLength), safe to interpolate here.
  const w = source.dataset.badgeWidth || "3in";
  const h = source.dataset.badgeHeight || "2in";
  const pageStyle = document.createElement("style");
  pageStyle.id = "print-page-size";
  pageStyle.textContent = `@page { size: ${w} ${h}; margin: 0; }`;
  document.head.appendChild(pageStyle);

  const root = document.createElement("div");
  root.id = "print-root";
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  root.appendChild(clone);
  document.body.appendChild(root);
  document.body.classList.add("printing-badge");

  const cleanup = () => {
    document.body.classList.remove("printing-badge");
    root.remove();
    pageStyle.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();
  // Fallback in case afterprint does not fire (some browsers).
  setTimeout(cleanup, 1000);
}
