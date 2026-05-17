import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ScoreRedirect({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const tail = qs.toString();
  redirect(tail ? `/scorecard?${tail}` : "/scorecard");
}
