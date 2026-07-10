import { useState } from "react";
import { Printer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BADGE_SIZE_PRESETS,
  badgeLengthToMm,
  isValidBadgeLength,
  normalizeBadgeLength,
  setBadgeSize,
  useBadgeSize,
  type BadgeSize,
} from "@/lib/badge-size";

function matchPreset(size: BadgeSize): number {
  return BADGE_SIZE_PRESETS.findIndex((p) => p.width === size.width && p.height === size.height);
}

/**
 * Per-workstation label-size picker. The printed badge is sized to the label
 * media loaded in THIS desk's printer, remembered in this browser. Rendered
 * next to the Print Badge button wherever badges print.
 */
export function BadgeSizeControl({ className }: { className?: string }) {
  const current = useBadgeSize();
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(current.width);
  const [height, setHeight] = useState(current.height);

  const openDialog = () => {
    setWidth(current.width);
    setHeight(current.height);
    setOpen(true);
  };

  const normWidth = normalizeBadgeLength(width);
  const normHeight = normalizeBadgeLength(height);
  const selectedPreset = matchPreset({ width: normWidth, height: normHeight });
  const widthValid = isValidBadgeLength(normWidth);
  const heightValid = isValidBadgeLength(normHeight);
  const canSave = widthValid && heightValid;

  const applyPreset = (index: number) => {
    const p = BADGE_SIZE_PRESETS[index];
    if (!p) return;
    setWidth(p.width);
    setHeight(p.height);
  };

  const wMm = badgeLengthToMm(normWidth);
  const hMm = badgeLengthToMm(normHeight);
  const orientation = wMm && hMm ? (hMm > wMm ? "portrait" : "landscape") : null;

  // Flip orientation by swapping width/height (keeps whatever units are typed).
  const setOrientation = (want: "portrait" | "landscape") => {
    if (!wMm || !hMm) return;
    const isPortraitNow = hMm > wMm;
    if (isPortraitNow !== (want === "portrait")) {
      setWidth(normHeight);
      setHeight(normWidth);
    }
  };

  const save = () => {
    if (!canSave) return;
    setBadgeSize({ width: normWidth, height: normHeight });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
        data-testid="button-badge-size"
      >
        <Printer className="w-3.5 h-3.5" />
        Label size: {current.width} × {current.height}
        <span className="underline">Change</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Printer label size</DialogTitle>
            <DialogDescription>
              Set the badge size to match the label roll in this desk's printer so the
              badge fills the whole label. This is saved on this computer only — each
              desk can use a different printer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Common labels</Label>
              <div className="grid gap-1.5">
                {BADGE_SIZE_PRESETS.map((p, i) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(i)}
                    className={`text-left text-sm rounded-md border px-3 py-2 transition-colors ${selectedPreset === i ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                    data-testid={`button-badge-preset-${i}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Orientation</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation("landscape")}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${orientation === "landscape" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                  data-testid="button-orientation-landscape"
                >
                  Landscape (wide)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation("portrait")}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${orientation === "portrait" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
                  data-testid="button-orientation-portrait"
                >
                  Portrait (tall)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="badge-width">Width</Label>
                <Input
                  id="badge-width"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder="3in"
                  data-testid="input-badge-width"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="badge-height">Height</Label>
                <Input
                  id="badge-height"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="2in"
                  data-testid="input-badge-height"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a number in inches (e.g. <code>2.4</code>), or add a unit like{" "}
              <code>2.4in</code>, <code>62mm</code>, or <code>6cm</code>.
              {!canSave && (
                <span className="block text-destructive mt-1">
                  Enter valid sizes (like 2.4 or 62mm) to save.
                </span>
              )}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="button-badge-size-cancel">
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave} data-testid="button-badge-size-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
