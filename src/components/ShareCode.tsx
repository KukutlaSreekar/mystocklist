import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useProfile } from "@/hooks/useProfile";
import { Copy, Check, Share2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function ShareCode() {
  const { data: profile, isLoading } = useProfile();
  const [copied, setCopied] = useState(false);

  const shareUrl = profile?.public_code
    ? `${window.location.origin}/public/${profile.public_code}`
    : "";

  const copyCode = () => {
    if (profile?.public_code) {
      navigator.clipboard.writeText(profile.public_code);
      setCopied(true);
      toast.success("Code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied to clipboard!");
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 glass-card animate-pulse">
        <div className="h-20 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg gradient-primary">
          <Share2 className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">Share Your Watchlist</h3>
          <p className="text-sm text-muted-foreground">
            Anyone with your code can view your watchlist
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Your Public Code
          </label>
          <div className="flex gap-2">
            <Input
              value={profile?.public_code || ""}
              readOnly
              className="font-mono text-lg font-bold tracking-widest text-center"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={copyCode}
              className="shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Share Link
          </label>
          <div className="flex gap-2">
            <Input
              value={shareUrl}
              readOnly
              className="text-sm text-muted-foreground"
            />
            <Button variant="outline" size="icon" onClick={copyLink} className="shrink-0">
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(shareUrl, "_blank")}
              className="shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
