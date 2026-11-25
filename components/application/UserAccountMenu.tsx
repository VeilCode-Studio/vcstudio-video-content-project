import { UserButton } from "@clerk/nextjs";

export function UserAccountMenu({ displayName }: { displayName: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full bg-card/80 py-0.5 pr-0.5 pl-1 ring-1 ring-border lg:pl-4">
      <span
        className="hidden max-w-32 truncate text-sm font-semibold lg:block xl:max-w-48"
        title={displayName}
      >
        {displayName}
      </span>
      <UserButton
        appearance={{
          elements: {
            userButtonTrigger: {
              minWidth: "44px",
              minHeight: "44px",
              justifyContent: "center",
            },
            userButtonAvatarBox: { width: "32px", height: "32px" },
          },
        }}
      />
    </div>
  );
}
