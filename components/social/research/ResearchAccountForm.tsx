"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addResearchAccountAction } from "@/app/(authenticated)/app/social/research/actions";

export function ResearchAccountForm() {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("instagram");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        Add research account
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow an account’s work</DialogTitle>
          <DialogDescription>
            Save a public Facebook Page or professional Instagram account.
            Adding an account does not fetch data or start monitoring.
          </DialogDescription>
        </DialogHeader>
        <form
          className="app-section"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy.current) return;
            busy.current = true;
            const data = new FormData(event.currentTarget);
            start(async () => {
              try {
                const result = await addResearchAccountAction({
                  platform,
                  identifier: data.get("identifier"),
                  name: data.get("name"),
                  notes: data.get("notes"),
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.push(`/app/social/research?account=${result.id}`);
                router.refresh();
              } catch {
                setError("The account could not be saved. Try again.");
              } finally {
                busy.current = false;
              }
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-platform">Platform</Label>
            <FormSelect
              id="research-platform"
              name="platform"
              value={platform}
              onValueChange={setPlatform}
              disabled={pending}
            >
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="facebook">Facebook</SelectItem>
            </FormSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-name">Account label</Label>
            <Input
              id="research-name"
              name="name"
              required
              maxLength={160}
              disabled={pending}
              placeholder="A business or creator you learn from"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-identifier">
              {platform === "facebook"
                ? "Numeric Facebook Page ID"
                : "Instagram username"}
            </Label>
            <Input
              id="research-identifier"
              name="identifier"
              required
              maxLength={100}
              disabled={pending}
              placeholder={
                platform === "facebook" ? "123456789012345" : "@accountname"
              }
            />
            <p className="text-xs text-muted-foreground">
              {platform === "facebook"
                ? "Use the Page’s numeric ID from its About / Page transparency information. Personal profiles are not supported."
                : "Public Business and Creator accounts only. Consumer and private accounts are not supported."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="research-notes">
              What do you want to learn?{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="research-notes"
              name="notes"
              disabled={pending}
              maxLength={2000}
              placeholder="Audience, topics, hooks or formats to study"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlusIcon />
              )}
              {pending ? "Saving account…" : "Save account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
