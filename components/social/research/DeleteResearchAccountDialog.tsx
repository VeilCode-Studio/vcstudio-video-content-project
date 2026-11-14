"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/Alert";
import { deleteResearchAccountAction } from "@/app/(authenticated)/app/social/research/actions";
import type { ResearchAccountView } from "@studio/contracts/social-research";

export function DeleteResearchAccountDialog({
  account,
  disabled = false,
}: {
  account: ResearchAccountView;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy.current) return;
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="text-red-800 dark:text-red-200"
            aria-label={`Delete research account ${account.name}`}
          />
        }
      >
        <Trash2Icon aria-hidden="true" />
        Delete
      </DialogTrigger>
      <DialogContent
        initialFocus={cancelRef}
        showCloseButton={!pending}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Delete research account permanently?</DialogTitle>
          <DialogDescription className="break-words">
            Delete {account.name} and all saved research connected to this
            account. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Account details, notes and watchlist entry</li>
          <li>
            Every saved observation, post sample, metric and comparison history
          </li>
          <li>All successful, failed and pending refresh records</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Other research accounts and Meta authorization stay connected. A
          non-identifying security event records the deletion.
        </p>
        {error ? (
          <Alert variant="destructive">
            <p className="col-start-2">{error}</p>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button
            ref={cancelRef}
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Keep account
          </Button>
          <Button
            variant="destructive"
            className="h-auto min-h-9 whitespace-normal text-red-800 dark:text-red-200"
            disabled={pending}
            aria-busy={pending}
            onClick={() => {
              if (busy.current) return;
              busy.current = true;
              setError(null);
              start(async () => {
                try {
                  const result = await deleteResearchAccountAction({
                    accountId: account.id,
                    version: account.version,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setOpen(false);
                  toast.success(
                    "Research account and all saved research deleted",
                  );
                  router.replace("/app/social/research");
                  router.refresh();
                } catch {
                  setError(
                    "Deletion could not be confirmed. Refresh the page to check whether the account is still present before retrying.",
                  );
                } finally {
                  busy.current = false;
                }
              });
            }}
          >
            {pending ? (
              <Loader2Icon className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2Icon aria-hidden="true" />
            )}
            {pending ? "Deleting…" : "Delete account and all research"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
