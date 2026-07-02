import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface GuestAvatarProps {
  name: string;
  photoUrl?: string | null;
  className?: string;
  enlargeable?: boolean;
}

export function GuestAvatar({ name, photoUrl, className, enlargeable = true }: GuestAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  const avatar = (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted",
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={photoUrl as string}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {initials(name) || "?"}
        </span>
      )}
    </div>
  );

  if (!showPhoto || !enlargeable) {
    return avatar;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Enlarge photo of ${name}`}
      >
        {avatar}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-4">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="sr-only">Enlarged guest photo</DialogDescription>
          <img
            src={photoUrl as string}
            alt={name}
            className="w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
