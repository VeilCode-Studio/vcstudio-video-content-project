"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/ui/FormSelect";
import { SelectItem } from "@/components/ui/select";
import type { ResearchKeywordInput } from "@studio/contracts/social-research";

export function ResearchKeywordForm({
  filters,
  accounts,
}: {
  filters: ResearchKeywordInput;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="app-panel app-section rounded-2xl border bg-card"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const query = new URLSearchParams();
        for (const key of ["query", "kind", "platform", "accountId", "media"])
          query.set(key, String(data.get(key) ?? ""));
        start(() => router.push(`/app/social/research/keywords?${query}`));
      }}
    >
      <div className="app-heading">
        <h2 className="text-lg font-semibold">Explore saved evidence</h2>
        <p className="text-sm text-muted-foreground">
          Search a word, phrase or #hashtag. Leave it empty to discover frequent
          terms.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="keyword-query">Keyword or phrase</Label>
          <Input
            id="keyword-query"
            name="query"
            maxLength={100}
            defaultValue={filters.query}
            placeholder="e.g. saving money or #personalfinance"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="keyword-kind">Term type</Label>
          <FormSelect id="keyword-kind" name="kind" defaultValue={filters.kind}>
            <SelectItem value="all">Keywords and hashtags</SelectItem>
            <SelectItem value="keywords">Keywords</SelectItem>
            <SelectItem value="hashtags">Hashtags</SelectItem>
          </FormSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="keyword-platform">Platform</Label>
          <FormSelect
            id="keyword-platform"
            name="platform"
            defaultValue={filters.platform}
          >
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
          </FormSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="keyword-account">Research account</Label>
          <FormSelect
            id="keyword-account"
            name="accountId"
            defaultValue={filters.accountId}
          >
            <SelectItem value="all">Latest 20 active accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="keyword-media">Evidence</Label>
          <FormSelect
            id="keyword-media"
            name="media"
            defaultValue={filters.media}
          >
            <SelectItem value="captions">Captions only</SelectItem>
            <SelectItem value="captions_and_media">
              Captions + saved media findings
            </SelectItem>
          </FormSelect>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SearchIcon />
            )}
            {pending ? "Searching saved evidence…" : "Research keywords"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {pending
          ? "Updating the results. Your filters are preserved."
          : "Saved data only · No Meta refresh or new AI charge"}
      </p>
    </form>
  );
}
