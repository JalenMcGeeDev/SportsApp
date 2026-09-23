"use client";

import { useDeferredValue, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ClipboardList, Info, ListFilter, LoaderCircle, MapPin, Search, Trophy, Activity } from "lucide-react";
import { localParts } from "@season/core";
import type { PublicCompetition } from "@/lib/public-data";
import { Brand, dateLabel, Empty, GameCard, money, SectionTitle, Status, TeamMark, teamName } from "./shared";

export function PublicSeason({ tournament, organization, view }: { tournament: PublicCompetition; organization: { name: string; slug: string }; view: string }) {
  const [section, setSection] = useState<"overview" | "schedule" | "brackets" | "standings">("overview");
  const [division, setDivision] = useState("all");
  const [date, setDate] = useState(tournament.startsOn);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.toLowerCase());
  const router = useRouter();
  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15_000);
    return () => clearInterval(interval);
  }, [router]);
  const model = { ...tournament, registrations: tournament.teams };
  const divisions = tournament.divisions.filter((item) => division === "all" || item.id === division);
  const games = tournament.games.filter((game) => game.status !== "bye" && divisions.some((item) => item.id === game.divisionId) && `${teamName(model, game.homeId)} ${teamName(model, game.awayId)}`.toLowerCase().includes(query));
  const dayGames = games.filter((game) => game.start && localParts(game.start, tournament.timezone).date === date).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
  const base = `/${organization.slug}/${tournament.slug}`;
  return <main className="public-shell">
    <header className="public-header"><Link href={`/${organization.slug}`} aria-label="Season tournaments"><Brand /></Link><Link href={`/${organization.slug}`}>{organization.name}</Link><span className="public-demo">Public schedule</span></header>
    <section className="public-intro"><div><span className="eyebrow">{tournament.sport.replaceAll("_", " ").toUpperCase()} TOURNAMENT</span><h1>{tournament.name}</h1><div className="event-details"><span><CalendarDays size={15} />{dateLabel(tournament.startsOn, true)} - {dateLabel(tournament.endsOn, true)}, {tournament.startsOn.slice(0, 4)}</span><span><MapPin size={15} />{tournament.location}</span><Status status={tournament.status} /></div></div><div className="public-photo" role="img" aria-label="Soccer tournament field" /></section>
    <nav className="public-tabs" aria-label="Tournament pages">{[{ id: "details", label: "Details", icon: Info }, { id: "register", label: "Register", icon: ClipboardList }].filter((tab) => tab.id === view).map(({ id, label, icon: Icon }) => <Link key={id} href={`${base}/${id}`} className={view === id ? "selected" : ""} aria-current={view === id ? "page" : undefined}><Icon size={17} />{label}</Link>)}</nav>
    {view === "details" && <>
    <nav className="public-subtabs" aria-label="Details sections">{[{ id: "overview", label: "Overview", icon: Info }, { id: "schedule", label: "Schedule & scores", icon: CalendarDays }, { id: "brackets", label: "Brackets", icon: Trophy }, { id: "standings", label: "Standings", icon: Activity }].map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? "selected" : ""} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id as typeof section)}><Icon size={16} />{label}</button>)}</nav>
    {section === "overview" && <section className="public-details">{tournament.description && <p className="public-description">{tournament.description}</p>}<SectionTitle title="Divisions" count={tournament.divisions.length} /><div className="table-wrapper"><table><thead><tr><th>Division</th><th>Format</th><th>Teams</th><th>Guarantee</th><th>Entry fee</th></tr></thead><tbody>{tournament.divisions.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td className="capitalize">{item.format.replaceAll("_", " ")}</td><td>{tournament.teams.filter((team) => team.divisionId === item.id && team.status === "accepted").length} / {item.maxTeams}</td><td>{item.guaranteedGames} games</td><td>{money(item.entryFeeCents)}</td></tr>)}</tbody></table></div><SectionTitle title="Venues" count={new Set(tournament.fields.map((field) => field.venue)).size} /><ul className="public-venue-list">{[...new Set(tournament.fields.map((field) => field.venue))].map((venue) => <li key={venue}><MapPin size={14} />{venue}</li>)}</ul>{tournament.status === "registration_open" && <Link className="button primary" href={`${base}/register`}><ClipboardList size={16} />Register your team</Link>}</section>}
    {["schedule", "brackets", "standings"].includes(section) && <div className="toolbar"><label className="search-box"><Search size={16} /><input aria-label="Search teams" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your team..." /></label><div className="toolbar-right">{section === "schedule" && <input aria-label="Game date" type="date" min={tournament.startsOn} max={tournament.endsOn} value={date} onChange={(event) => setDate(event.target.value)} />}<label className="select-label"><ListFilter size={15} /><select aria-label="Division" value={division} onChange={(event) => setDivision(event.target.value)}><option value="all">All divisions</option>{tournament.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div>}
    {section === "schedule" && <><div className="schedule-summary"><span><span className="live-dot" />{dayGames.filter((game) => game.status === "in_progress").length} live</span><span>{dayGames.length} games</span><span className="muted">{tournament.timezone.replaceAll("_", " ")}</span></div>{dayGames.length ? <div className="public-games">{dayGames.map((game) => <section key={game.id}><div className="field-label">{tournament.fields.find((field) => field.id === game.fieldId)?.name}</div><GameCard tournament={model} game={game} /></section>)}</div> : <Empty title="No published games for this selection" />}</>}
    {section === "brackets" && divisions.map((item) => <section className="bracket-section" key={item.id}><SectionTitle title={item.name} />{["championship", "losers", "consolation"].map((bracket) => { const matches = games.filter((game) => game.divisionId === item.id && game.bracket === bracket); return matches.length ? <div key={bracket}><h3 className="capitalize">{bracket}</h3><div className="bracket-board">{[...new Set(matches.map((game) => game.round))].sort((left, right) => left - right).map((round) => <div className="bracket-round" key={round}><div className="round-heading">{matches.find((game) => game.round === round)?.label}</div><div className="bracket-matches">{matches.filter((game) => game.round === round).map((game) => <GameCard key={game.id} tournament={model} game={game} />)}</div></div>)}</div></div> : null; })}{!games.some((game) => game.divisionId === item.id && game.bracket !== "pool") && <Empty title="No published bracket" />}</section>)}
    {section === "standings" && divisions.map((item) => <section className="standings-section" key={item.id}><SectionTitle title={item.name} />{tournament.standings.filter((standing) => standing.divisionId === item.id).map((standing) => <div className="table-wrapper" key={standing.pool}><table><caption>Pool {standing.pool}</caption><thead><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th><th>Ranking</th></tr></thead><tbody>{standing.rows.filter((row) => teamName(model, row.registrationId).toLowerCase().includes(query)).map((row, index) => <tr key={row.registrationId}><td>{row.rank}</td><td><div className="team-cell"><TeamMark name={teamName(model, row.registrationId)} index={index} /><strong>{teamName(model, row.registrationId)}</strong></div></td><td>{row.played}</td><td>{row.wins}</td><td>{row.ties}</td><td>{row.losses}</td><td>{row.difference}</td><td><strong>{row.points}</strong></td><td><details className="ranking-detail"><summary>Why this rank?</summary><ul>{row.trace.map((trace, index) => <li key={index}>{trace}</li>)}</ul></details></td></tr>)}</tbody></table></div>)}</section>)}
    </>}
    {view === "register" && <RegistrationForm tournament={tournament} organization={organization} />}
    <footer className="page-footer"><Brand /><small>{organization.name}</small><span>All times in {tournament.timezone.replaceAll("_", " ")}</span></footer>
  </main>;
}

function RegistrationForm({ tournament, organization }: { tournament: PublicCompetition; organization: { name: string; slug: string } }) {
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"submitted" | "waitlisted" | "">("");
  if (tournament.status !== "registration_open") return <section className="public-register"><Empty title={tournament.status === "draft" ? "Registration hasn't opened yet" : "Registration is closed"}><p className="muted">Check back with the tournament director for updates.</p></Empty></section>;
  if (result) return <section className="public-register"><div className="success-text"><Check size={18} />{result === "waitlisted" ? "Your team has been added to the waitlist. The tournament director will reach out if a spot opens up." : "Your registration has been submitted. The tournament director will follow up with next steps."}</div></section>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setDetails([]); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = { teamName: String(form.get("teamName") ?? ""), city: String(form.get("city") ?? ""), coachName: String(form.get("coachName") ?? ""), coachEmail: String(form.get("coachEmail") ?? ""), divisionId: String(form.get("divisionId") ?? "") };
    try {
      const response = await fetch(`/api/v1/public/${organization.slug}/${tournament.slug}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error ?? "Unable to submit registration"); setDetails(payload.details ?? []); return; }
      setResult(payload.status === "waitlisted" ? "waitlisted" : "submitted");
    } catch { setError("Unable to submit registration. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="public-register">
    <form onSubmit={submit} className="dialog-form">
      {error && <div role="alert" className="form-error"><strong>{error}</strong>{details.length > 0 && <ul>{details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}</div>}
      <label>Team name<input name="teamName" required minLength={2} maxLength={80} autoFocus placeholder="Team name" /></label>
      <label>Home city<input name="city" maxLength={100} /></label>
      <label>Division<select name="divisionId" required defaultValue="">{<option value="" disabled>Select a division</option>}{tournament.divisions.map((division) => <option key={division.id} value={division.id}>{division.name} - {money(division.entryFeeCents)}</option>)}</select></label>
      <div className="form-grid"><label>Coach name<input name="coachName" required minLength={2} maxLength={100} /></label><label>Coach email<input name="coachEmail" type="email" required /></label></div>
      <div className="form-note">No payment is collected yet.</div>
      <div className="modal-actions"><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ClipboardList size={16} />}Submit registration</button></div>
    </form>
  </section>;
}