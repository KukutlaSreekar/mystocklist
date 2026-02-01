import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { User, Check, Loader2 } from "lucide-react";

export function ProfileSettings() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile?.display_name]);

  useEffect(() => {
    setHasChanges(displayName !== (profile?.display_name || ""));
  }, [displayName, profile?.display_name]);

  const handleSave = () => {
    if (displayName.trim()) {
      updateProfile.mutate({ display_name: displayName.trim() });
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 glass-card animate-pulse">
        <div className="h-24 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="p-6 glass-card">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg gradient-primary">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">Profile Settings</h3>
          <p className="text-sm text-muted-foreground">
            Customize how your watchlist appears to others
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            type="text"
            placeholder="Your display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
          />
          <p className="text-xs text-muted-foreground">
            This name will be shown on your public watchlist page
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateProfile.isPending || !displayName.trim()}
          className="w-full"
        >
          {updateProfile.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : hasChanges ? (
            "Save Changes"
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Saved
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
