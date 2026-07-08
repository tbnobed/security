import { useRef, useState } from "react";
import { Layout } from "@/components/layout";
import {
  useGetBrandingSettings,
  useUpdateBadgeLogo,
  useDeleteBadgeLogo,
  getGetBrandingSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CLIENT_LOGO_URL } from "@/lib/site";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

export default function BrandingPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: branding, isLoading } = useGetBrandingSettings();
  const { mutateAsync: updateLogo, isPending: uploading } = useUpdateBadgeLogo();
  const { mutateAsync: deleteLogo, isPending: removing } = useDeleteBadgeLogo();

  const [preview, setPreview] = useState<string | null>(null);

  const badgeLogoUrl = branding?.badgeLogoUrl ?? null;
  const effectiveUrl = preview ?? badgeLogoUrl ?? CLIENT_LOGO_URL ?? "";

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetBrandingSettingsQueryKey() });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please choose a PNG, JPEG, or WebP image.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "File too large",
        description: "The logo must be 2MB or smaller.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      try {
        await updateLogo({ data: { imageData: dataUrl } });
        refresh();
        toast({ title: "Badge logo updated", description: "New badges will use this logo." });
      } catch {
        toast({
          title: "Upload failed",
          description: "Could not save the logo. Try again.",
          variant: "destructive",
        });
      } finally {
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = async () => {
    try {
      await deleteLogo();
      refresh();
      toast({
        title: "Badge logo removed",
        description: CLIENT_LOGO_URL
          ? "Badges will fall back to the client logo."
          : "Badges will show no logo.",
      });
    } catch {
      toast({ title: "Failed to remove logo", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Badge Logo</h1>
          <p className="text-sm text-muted-foreground">
            The logo printed in the top-right corner of visitor badges. This can differ from the
            client logo shown on the public registration page.
          </p>
        </div>

        <div className="border border-border rounded-lg p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Preview (badge)
            </p>
            <div className="overflow-hidden rounded-md border border-gray-300 bg-white">
              <div
                className="flex items-center justify-between px-4 py-1.5 text-white"
                style={{ background: "#0b0e1a" }}
              >
                <span className="text-xs font-bold uppercase tracking-[0.18em]">Visitor Pass</span>
              </div>
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-bold text-gray-900">Guest Name</div>
                  <div className="text-xs font-medium text-gray-800">Company</div>
                </div>
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                ) : effectiveUrl ? (
                  <img
                    src={effectiveUrl}
                    alt="Badge logo"
                    className="h-9 w-auto max-w-32 object-contain"
                  />
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <ImageIcon className="w-4 h-4" />
                    No logo
                  </span>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {badgeLogoUrl
                ? "Using the uploaded badge logo."
                : CLIENT_LOGO_URL
                  ? "No badge logo uploaded — badges currently use the client logo."
                  : "No badge logo uploaded and no client logo configured — badges show no logo."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {badgeLogoUrl ? "Replace Logo" : "Upload Logo"}
            </Button>
            {badgeLogoUrl && (
              <Button variant="outline" onClick={handleRemove} disabled={removing}>
                {removing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP · max 2MB</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
