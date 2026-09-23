import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, ArrowUpRight } from "lucide-react";
import { publicCompetition, publicWorkspace } from "@/lib/public-data";
import { PublicSeason } from "@/components/public-season";
import { Brand, dateLabel, Status } from "@/components/shared";

export const dynamic = "force-dynamic";

export default async function PublicPage({ params }: { params: Promise<{ organization: string; path?: string[] }> }) {
  const { organization, path = [] } = await params;
  const workspace = await publicWorkspace(organization);
  const visible = workspace.tournaments.filter((item) => !["draft", "archived"].includes(item.status));
  if (!path.length) return <main className="public-shell"><header className="public-header"><Brand /><span>{workspace.organization.name}</span></header><section className="public-intro"><span className="eyebrow">TOURNAMENTS</span><h1>{workspace.organization.name}</h1></section><div className="tournaments-list">{visible.map((item) => <Link key={item.id} className="tournament-row" href={`/${organization}/${item.slug}`}><CalendarDays size={25} /><div><h2>{item.name}</h2><p><MapPin size={14} />{item.location}<span>{dateLabel(item.startsOn, true)} - {dateLabel(item.endsOn, true)}</span></p></div><Status status={item.status} /><ArrowUpRight size={19} /></Link>)}</div></main>;
  const tournament = visible.find((item) => item.slug === path[0]);
  const view = path[1] ?? "details";
  if (!tournament || path.length > 2 || !["details", "register"].includes(view)) notFound();
  return <PublicSeason tournament={publicCompetition(tournament)} organization={{ name: workspace.organization.name, slug: organization }} view={view} />;
}