import { useState } from "react";
import { cn } from "@/lib/utils";

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
}

export function GuestAvatar({ name, photoUrl, className }: GuestAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
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
}
