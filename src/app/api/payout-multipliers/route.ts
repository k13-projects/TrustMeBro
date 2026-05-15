import { NextResponse } from "next/server";
import { loadPayoutMap } from "@/lib/analysis/payouts";

export const revalidate = 300;

export async function GET() {
  const map = await loadPayoutMap();
  return NextResponse.json(map);
}
