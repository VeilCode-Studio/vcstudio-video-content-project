"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ResearchCategoryView } from "@studio/contracts/research-categories";
import {
  renameResearchCategoryAction,
  deleteResearchCategoryAction,
} from "@/app/(authenticated)/app/social/research/category-actions";

export function ResearchCategoryRow({
  category,
}: {
  category: ResearchCategoryView;
}) {
  const router = useRouter();
  const [name, setName] = useState(category.name);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function save(remove: boolean) {
    if (pending) return;
    setError(null);
    start(async () => {
      try {
        const input = {
          categoryId: category.id,
          version: category.version,
          name,
        };
        const result = await (remove
          ? deleteResearchCategoryAction(input)
          : renameResearchCategoryAction(input));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setConfirm(false);
        if (
          remove &&
          new URLSearchParams(window.location.search).get("category") ===
            category.id
        )
          router.replace("/app/social/research");
        router.refresh();
      } catch {
        setError("The category could not be updated. Try again.");
      }
    });
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <Label htmlFor={`category-${category.id}`}>
        {category.accountCount}{" "}
        {category.accountCount === 1 ? "account" : "accounts"}
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`category-${category.id}`}
          className="min-w-0 flex-1 basis-40"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          disabled={pending}
        />
        <Button
          type="button"
          variant="outline"
          disabled={pending || !name.trim() || name.trim() === category.name}
          onClick={() => save(false)}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setConfirm(true)}
        >
          Remove
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pending) setConfirm(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {category.name}?</DialogTitle>
            <DialogDescription>
              Accounts in this category will move to Uncategorized. Their saved
              observations, previews and analysis will be preserved.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              Keep category
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => save(true)}
            >
              {pending ? <Loader2Icon className="animate-spin" /> : null}Remove
              category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
