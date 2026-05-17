import { redirect } from "next/navigation";
import { getRequester } from "@/lib/identity";
import { loadProfileByUserId } from "@/lib/bros/loaders";
import { suggestHandle } from "@/lib/bros/handle";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const requester = await getRequester();
  if (!requester || requester.kind !== "auth") {
    redirect(`/login?next=${encodeURIComponent(`/bros/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`)}`);
  }
  const existing = await loadProfileByUserId(requester.user_id);
  if (existing) {
    redirect(next ?? `/bros/${existing.handle}`);
  }

  const suggested = suggestHandle(requester.display_name);

  return (
    <div className="mx-auto max-w-md px-4 py-12 space-y-6">
      <header>
        <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
          Claim your handle
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Set up your Bro Board profile
        </h1>
        <p className="text-sm text-foreground/55 mt-2">
          One-time setup. You can change your display name and bio later, but
          your handle sticks.
        </p>
      </header>
      <OnboardingForm
        suggestedHandle={suggested}
        suggestedDisplayName={requester.display_name}
        nextUrl={next ?? null}
      />
    </div>
  );
}
