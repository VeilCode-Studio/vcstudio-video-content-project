"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ResearchCategoryView } from "@studio/contracts/research-categories";
import type { ResearchAccountView } from "@studio/contracts/social-research";
import { assignResearchCategoryAction } from "@/app/(authenticated)/app/social/research/category-actions";
import { researchAccountsHref } from "@/lib/social/research/organization";

export function ResearchAccountCategory({
  account,
  categories,
}: {
  account: ResearchAccountView;
  categories: ResearchCategoryView[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(account.categoryId ?? "uncategorized");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError(null);
        start(async () => {
          try {
            const result = await assignResearchCategoryAction({
              accountId: account.id,
              version: account.version,
              categoryId: value === "uncategorized" ? null : value,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            if (new URLSearchParams(window.location.search).has("category"))
              router.replace(
                researchAccountsHref({
                  category: value,
                  accountId: account.id,
                }),
              );
            router.refresh();
          } catch {
            setError("The account could not be moved. Try again.");
          }
        });
      }}
    >
      <Label htmlFor="selected-account-category">Account category</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <FormSelect
            id="selected-account-category"
            value={value}
            onValueChange={setValue}
            disabled={pending}
          >
            <SelectItem value="uncategorized">Uncategorized</SelectItem>
            {categories.map((category) => (
              <SelectItem value={category.id} key={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={
            pending || value === (account.categoryId ?? "uncategorized")
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}Save
          category
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
