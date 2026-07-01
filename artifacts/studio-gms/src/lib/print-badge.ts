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
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();
  // Fallback in case afterprint does not fire (some browsers).
  setTimeout(cleanup, 1000);
}
