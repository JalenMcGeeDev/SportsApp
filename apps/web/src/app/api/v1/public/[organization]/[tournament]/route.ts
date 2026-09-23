import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { publicCompetition, publicWorkspace } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ organization: string; tournament: string }> }) {
  const { organization, tournament: slug } = await params;
  const workspace = await publicWorkspace(organization);
  const tournament = workspace.tournaments.find((item) => item.slug === slug && !["draft", "archived"].includes(item.status));
  if (!tournament) notFound();
  return NextResponse.json(publicCompetition(tournament), { headers: { "Cache-Control": "private, no-store" } });
}