"use client";

import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, ClipboardList, Info, ListFilter, LoaderCircle, Mail, MapPin, Search, Shuffle, Trophy, Activity } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { localParts } from "@season/core";
import type { PublicCompetition } from "@/lib/public-data";
import { Brand, dateLabel, Empty, GameCard, hasBracketStage, InfoTip, money, SectionTitle, StandingsHead, Status, TeamMark, teamName } from "./shared";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) : null;

export function PublicSeason({ tournament, organization, view, registrationId }: { tournament: PublicCompetition; organization: { name: string; slug: string }; view: string; registrationId?: string }) {
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
    <header className="public-header"><Link href={`/${organization.slug}`} aria-label="Season tournaments"><Brand /></Link><span className="public-demo">Public schedule</span></header>
    <section className="public-intro"><div><span className="eyebrow">{tournament.sport.replaceAll("_", " ").toUpperCase()} TOURNAMENT</span><h1>{tournament.name}</h1><Link href={`/${organization.slug}`} className="hosted-by">Hosted by {organization.name}</Link><div className="event-details"><span><CalendarDays size={15} />{dateLabel(tournament.startsOn, true)} - {dateLabel(tournament.endsOn, true)}, {tournament.startsOn.slice(0, 4)}</span><span><MapPin size={15} />{tournament.location}</span>{tournament.status === "registration_open" ? <Link href={`${base}/register`}><Status status={tournament.status} /></Link> : <Status status={tournament.status} />}</div></div><div className="public-photo" role="img" aria-label="Soccer tournament field" /></section>
    <nav className="public-tabs" aria-label="Tournament pages">{[{ id: "details", label: "Details", icon: Info }, { id: "register", label: "Register", icon: ClipboardList }].filter((tab) => tab.id === view).map(({ id, label, icon: Icon }) => <Link key={id} href={`${base}/${id}`} className={view === id ? "selected" : ""} aria-current={view === id ? "page" : undefined}><Icon size={17} />{label}</Link>)}</nav>
    {view === "details" && (tournament.publishedAt ? <>
    <nav className="public-subtabs" aria-label="Details sections">{[{ id: "overview", label: "Overview", icon: Info }, { id: "schedule", label: "Schedule & scores", icon: CalendarDays }, { id: "brackets", label: "Brackets", icon: Trophy }, { id: "standings", label: "Standings", icon: Activity }].map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? "selected" : ""} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id as typeof section)}><Icon size={16} />{label}</button>)}</nav>
    {section === "overview" && <section className="public-details">{tournament.description && <p className="public-description">{tournament.description}</p>}<SectionTitle title="Divisions" count={tournament.divisions.length} /><div className="table-wrapper"><table><thead><tr><th>Division</th><th>Format</th><th>Teams</th><th>Guarantee</th><th>Entry fee</th></tr></thead><tbody>{tournament.divisions.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td className="capitalize">{item.format.replaceAll("_", " ")}</td><td>{tournament.teams.filter((team) => team.divisionId === item.id && team.status === "accepted").length} / {item.maxTeams}</td><td>{item.guaranteedGames} games</td><td>{money(item.entryFeeCents)}</td></tr>)}</tbody></table></div><SectionTitle title="Venues" count={new Set(tournament.fields.map((field) => field.venue)).size} /><ul className="public-venue-list">{[...new Set(tournament.fields.map((field) => field.venue))].map((venue) => <li key={venue}><MapPin size={14} />{venue}</li>)}</ul>{tournament.status === "registration_open" && <Link className="button primary" href={`${base}/register`}><ClipboardList size={16} />Register your team</Link>}<FollowTournament tournament={tournament} organization={organization} /></section>}
    {["schedule", "brackets", "standings"].includes(section) && <div className="toolbar"><label className="search-box"><Search size={16} /><input aria-label="Search teams" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find your team..." /></label><div className="toolbar-right">{section === "schedule" && <input aria-label="Game date" type="date" min={tournament.startsOn} max={tournament.endsOn} value={date} onChange={(event) => setDate(event.target.value)} />}<label className="select-label"><ListFilter size={15} /><select aria-label="Division" value={division} onChange={(event) => setDivision(event.target.value)}><option value="all">All divisions</option>{tournament.divisions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div></div>}
    {section === "schedule" && <><div className="schedule-summary"><span><span className="live-dot" />{dayGames.filter((game) => game.status === "in_progress").length} live</span><span>{dayGames.length} games</span><span className="muted">{tournament.timezone.replaceAll("_", " ")}</span></div>{dayGames.length ? <div className="public-games">{dayGames.map((game) => <section key={game.id}><div className="field-label">{tournament.fields.find((field) => field.id === game.fieldId)?.name}</div><GameCard tournament={model} game={game} /></section>)}</div> : <Empty title="No published games for this selection" />}</>}
    {section === "brackets" && divisions.map((item) => <section className="bracket-section" key={item.id}><SectionTitle title={item.name} />{["championship", "losers", "consolation"].map((bracket) => { const matches = games.filter((game) => game.divisionId === item.id && game.bracket === bracket); return matches.length ? <div key={bracket}><h3 className="capitalize">{bracket}</h3><div className="bracket-board">{[...new Set(matches.map((game) => game.round))].sort((left, right) => left - right).map((round) => <div className="bracket-round" key={round}><div className="round-heading">{matches.find((game) => game.round === round)?.label}</div><div className="bracket-matches">{matches.filter((game) => game.round === round).map((game) => <GameCard key={game.id} tournament={model} game={game} />)}</div></div>)}</div></div> : null; })}{!games.some((game) => game.divisionId === item.id && game.bracket !== "pool") && (hasBracketStage(item.format) ? <Empty title="No published bracket" /> : <Empty title="No elimination bracket"><p>{`This division uses a ${item.format.replaceAll("_", " ")} format \u2014 see Standings for placement.`}</p></Empty>)}</section>)}
    {section === "standings" && <><a className="field-info-link standings-points-link" href="/docs#points" target="_blank" rel="noopener noreferrer"><Info size={12} />How points work</a>{divisions.map((item) => <section className="standings-section" key={item.id}><SectionTitle title={item.name} />{tournament.standings.filter((standing) => standing.divisionId === item.id).map((standing) => <div className="table-wrapper" key={standing.pool}><table><caption>Pool {standing.pool}</caption><thead><StandingsHead /></thead><tbody>{standing.rows.filter((row) => teamName(model, row.registrationId).toLowerCase().includes(query)).map((row, index) => <tr key={row.registrationId}><td><span className={`rank ${index < item.advancePerPool ? "qualifying" : ""}`}>{row.rank}</span></td><td><div className="team-cell"><TeamMark name={teamName(model, row.registrationId)} index={index} /><strong>{teamName(model, row.registrationId)}</strong></div></td><td>{row.played}</td><td>{row.wins}</td><td>{row.ties}</td><td>{row.losses}</td><td>{row.scored}</td><td>{row.conceded}</td><td>{row.difference > 0 ? "+" : ""}{row.difference}</td><td><InfoTip hint={row.pointsFormula}><strong>{row.points}</strong></InfoTip></td></tr>)}</tbody></table></div>)}</section>)}</>}
    </>
    : <Empty title="Details coming soon"><p className="muted">The tournament director hasn&apos;t published the schedule yet. Check back later.</p></Empty>)}
    {view === "register" && <RegistrationForm tournament={tournament} organization={organization} />}
    {view === "pay" && registrationId && <PayRegistration organization={organization} tournament={tournament} registrationId={registrationId} />}
    <footer className="page-footer"><Brand /><span>All times in {tournament.timezone.replaceAll("_", " ")}</span></footer>
  </main>;
}

function FollowTournament({ tournament, organization }: { tournament: PublicCompetition; organization: { name: string; slug: string } }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/v1/public/${organization.slug}/${tournament.slug}/follow`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error ?? "Unable to follow this tournament."); return; }
      setDone(true);
    } catch { setError("Unable to follow this tournament. Please try again."); }
    finally { setBusy(false); }
  }
  if (done) return <div className="follow-card success-text"><Check size={16} />You're following {tournament.name}. Announcements will be sent to {email}.</div>;
  return <form onSubmit={submit} className="follow-card">
    <div><strong>Follow this tournament</strong><span className="muted">Get an email whenever the director sends an announcement.</span></div>
    <div className="chip-input-row">
      <input type="email" required placeholder="you@example.com" aria-label="Email address" value={email} onChange={(event) => setEmail(event.target.value)} />
      <button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Mail size={16} />}Follow</button>
    </div>
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
  </form>;
}

const demoTeamAdjectives = ["Thunder", "Blaze", "Storm", "Fury", "Rapid", "Shadow", "Iron", "Golden", "Rogue", "Crimson"];
const demoTeamNouns = ["Hawks", "Wolves", "Tigers", "Eagles", "Sharks", "Comets", "Titans", "Vipers", "Falcons", "Bears"];
const demoFirstNames = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Sam", "Jamie", "Drew", "Quinn"];
const demoLastNames = ["Johnson", "Smith", "Garcia", "Martinez", "Brown", "Davis", "Miller", "Wilson", "Anderson", "Taylor"];
const demoCities = ["Austin, TX", "Dallas, TX", "Houston, TX", "San Antonio, TX", "Denver, CO", "Phoenix, AZ", "Portland, OR", "Nashville, TN"];
function demoPick<T>(options: T[]): T { return options[Math.floor(Math.random() * options.length)]!; }

function RegistrationForm({ tournament, organization }: { tournament: PublicCompetition; organization: { name: string; slug: string } }) {
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"submitted" | "waitlisted" | "">("");
  const teamNameRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const divisionRef = useRef<HTMLSelectElement>(null);
  const coachNameRef = useRef<HTMLInputElement>(null);
  const coachEmailRef = useRef<HTMLInputElement>(null);
  if (tournament.status !== "registration_open") return <section className="public-register"><Empty title={tournament.status === "draft" ? "Registration hasn't opened yet" : "Registration is closed"}><p className="muted">Check back with the tournament director for updates.</p></Empty></section>;
  if (result) return <section className="public-register"><div className="success-text"><Check size={18} />{result === "waitlisted" ? "Your team has been added to the waitlist. The tournament director will reach out if a spot opens up." : "Your registration has been submitted. The tournament director will follow up with next steps."}</div></section>;
  function fillDemoTeam() {
    const coachFirstName = demoPick(demoFirstNames);
    const coachLastName = demoPick(demoLastNames);
    if (teamNameRef.current) teamNameRef.current.value = `${demoPick(demoTeamAdjectives)} ${demoPick(demoTeamNouns)}`;
    if (cityRef.current) cityRef.current.value = demoPick(demoCities);
    if (divisionRef.current && tournament.divisions.length) divisionRef.current.value = demoPick(tournament.divisions).id;
    if (coachNameRef.current) coachNameRef.current.value = `${coachFirstName} ${coachLastName}`;
    if (coachEmailRef.current) coachEmailRef.current.value = `${coachFirstName}.${coachLastName}@example.com`.toLowerCase();
  }
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
      <button type="button" className="button" onClick={fillDemoTeam}><Shuffle size={16} />Demo team registration</button>
      <label>Team name<input ref={teamNameRef} name="teamName" required minLength={2} maxLength={80} autoFocus placeholder="Team name" /></label>
      <label>Home city<input ref={cityRef} name="city" maxLength={100} /></label>
      <label>Division<select ref={divisionRef} name="divisionId" required defaultValue={tournament.divisions.length === 1 ? tournament.divisions[0]!.id : ""}>{tournament.divisions.length !== 1 && <option value="" disabled>Select a division</option>}{tournament.divisions.map((division) => <option key={division.id} value={division.id}>{division.name} - {money(division.entryFeeCents)}</option>)}</select></label>
      <div className="form-grid"><label>Coach name<input ref={coachNameRef} name="coachName" required minLength={2} maxLength={100} /></label><label>Coach email<input ref={coachEmailRef} name="coachEmail" type="email" required /></label></div>
      <div className="form-note">No payment is collected yet.</div>
      <div className="modal-actions"><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ClipboardList size={16} />}Submit registration</button></div>
    </form>
  </section>;
}

type PayInfo = { teamName: string; tournamentName: string; divisionName: string; amountCents: number; paymentStatus: string; clientSecret: string | null };

function PayRegistration({ organization, tournament, registrationId }: { organization: { name: string; slug: string }; tournament: PublicCompetition; registrationId: string }) {
  const [info, setInfo] = useState<PayInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/v1/public/${organization.slug}/${tournament.slug}/pay/${registrationId}`)
      .then((response) => { if (!response.ok) throw new Error("Unable to load this payment link."); return response.json(); })
      .then(setInfo)
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : "Unable to load this payment link."));
  }, [organization.slug, tournament.slug, registrationId]);
  if (error) return <section className="public-register"><Empty title="This payment link isn't available"><p className="muted">{error}</p></Empty></section>;
  if (!info) return <section className="public-register"><LoaderCircle className="spin" size={24} /></section>;
  if (info.paymentStatus === "paid") return <section className="public-register"><div className="success-text"><Check size={18} />Payment received for {info.teamName}. You're all set for {info.tournamentName}.</div></section>;
  if (!info.clientSecret || !stripePromise) return <section className="public-register"><Empty title="No payment is due right now"><p className="muted">Contact the tournament director if you believe this is a mistake.</p></Empty></section>;
  return <section className="public-register">
    <div className="pay-summary"><h2>Pay entry fee</h2><p>{info.teamName} &middot; {info.divisionName} &middot; {info.tournamentName}</p><strong>{money(info.amountCents)}</strong></div>
    <Elements stripe={stripePromise} options={{ clientSecret: info.clientSecret }}>
      <PayForm amount={info.amountCents} />
    </Elements>
  </section>;
}

function PayForm({ amount }: { amount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const { error: confirmError } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (confirmError) { setError(confirmError.message ?? "Payment failed. Please try again."); setBusy(false); return; }
    setDone(true); setBusy(false);
  }
  if (done) return <div className="success-text"><Check size={18} />Payment submitted. You&apos;ll receive a confirmation email shortly.</div>;
  return <form onSubmit={submit} className="dialog-form">
    <PaymentElement />
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
    <div className="modal-actions"><button className="button primary" disabled={!stripe || busy}>{busy ? <LoaderCircle size={16} className="spin" /> : null}Pay {money(amount)}</button></div>
  </form>;
}