"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlusIcon, Loader2Icon } from "lucide-react";
import {
  DEFAULT_RESEARCH_CATEGORIES,
  type ResearchCategoryView,
} from "@studio/contracts/research-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createResearchCategoryAction } from "@/app/(authenticated)/app/social/research/category-actions";
import { ResearchCategoryRow } from "./ResearchCategoryRow";

export function ResearchCategoryManager({
  categories,
}: {
  categories: ResearchCategoryView[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function create(value: string) {
    if (pending) return;
    setError(null);
    start(async () => {
      try {
        const result = await createResearchCategoryAction({ name: value });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setName("");
        router.refresh();
      } catch {
        setError("The category could not be created. Try again.");
      }
    });
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FolderPlusIcon />
        Manage categories
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Research categories</DialogTitle>
          <DialogDescription>
            Organize accounts by topic or purpose. Categories are shared with
            your workspace; removing one preserves all research.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            create(name);
          }}
        >
          <Label htmlFor="new-research-category">New category</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="new-research-category"
              placeholder="e.g. Finance creators"
              className="min-w-0 flex-1 basis-40"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              disabled={pending || categories.length >= 50}
            />
            <Button
              type="submit"
              disabled={pending || !name.trim() || categories.length >= 50}
            >
              {pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <FolderPlusIcon />
              )}
              Create category
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2" aria-label="Suggested categories">
          {DEFAULT_RESEARCH_CATEGORIES.filter(
            (suggestion) =>
              !categories.some(
                (category) =>
                  category.name.toLowerCase() === suggestion.toLowerCase(),
              ),
          ).map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending || categories.length >= 50}
              onClick={() => create(suggestion)}
            >
              Add {suggestion}
            </Button>
          ))}
        </div>
        <div className="space-y-3">
          {categories.map((category) => (
            <ResearchCategoryRow
              key={`${category.id}:${category.version}`}
              category={category}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {categories.length} of 50 categories. Accounts can belong to one
          category at a time.
        </p>
      </DialogContent>
    </Dialog>
  );
}
