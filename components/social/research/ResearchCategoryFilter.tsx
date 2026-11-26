"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  researchCategoryFilterSchema,
  type ResearchCategoryView,
  type ResearchCategoryFilter as CategoryFilter,
} from "@studio/contracts/research-categories";
import { researchAccountsHref } from "@/lib/social/research/organization";

export function ResearchCategoryFilter({
  categories,
  value,
}: {
  categories: ResearchCategoryView[];
  value: CategoryFilter;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Label htmlFor="research-category-filter">Browse category</Label>
      <FormSelect
        id="research-category-filter"
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          const category = researchCategoryFilterSchema.parse(next);
          start(() =>
            router.push(researchAccountsHref({ category }), { scroll: false }),
          );
        }}
      >
        <SelectItem value="all">All accounts</SelectItem>
        <SelectItem value="uncategorized">Uncategorized</SelectItem>
        {categories.map((category) => (
          <SelectItem key={category.id} value={category.id}>
            {category.name} ({category.accountCount})
          </SelectItem>
        ))}
      </FormSelect>
      {pending ? (
        <p
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2Icon className="size-3 animate-spin" />
          Loading category…
        </p>
      ) : null}
    </div>
  );
}
