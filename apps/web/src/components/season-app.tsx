"use client";

import { useDeferredValue, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Activity, ArrowDownToLine, ArrowUpRight, Bell, CalendarDays, Check, CheckCheck, ChevronRight, ClipboardCheck, Copy, CreditCard, Dice5, ExternalLink, Flag, Info, LayoutDashboard, ListFilter, LoaderCircle, MapPin, Megaphone, Menu, Pencil, Plus, RotateCcw, Save, Search, Send, Settings2, ShieldCheck, Sparkles, Trash2, Trophy, Users, X } from "lucide-react";
import { ApiError, createApiClient } from "@season/api-client";
import { computeStandings, localParts } from "@season/core";
import type { Command, Game, Registration, Tournament, Workspace } from "@season/types";
import { Badge, Brand, dateLabel, Empty, GameCard, gameTime, hasBracketStage, initials, InfoTip, Modal, money, playAreaLabel, SectionTitle, StandingsHead, Status, TeamMark, teamName } from "./shared";
import { ActionDialog, type Dialog } from "./season-dialogs";
import { TournamentWizard } from "./tournament-wizard";
import { signOut } from "@/app/auth/actions";

const api = createApiClient();
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard }, { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "teams", label: "Teams & rosters", icon: Users }, { id: "brackets", label: "Brackets", icon: Trophy },
  { id: "standings", label: "Standings", icon: Activity },
  { id: "communication", label: "Communication", icon: Megaphone },
  { id: "payments", label: "Payments", icon: CreditCard }, { id: "settings", label: "Settings", icon: Settings2 },
];

// Demo-only helper: always returns two distinct scores so both pool and elimination games are valid.
function randomDemoScore() {
  const homeScore = Math.floor(Math.random() * 6) + 1;
  const awayScore = (homeScore + 1 + Math.floor(Math.random() * homeScore)) % (homeScore + 2);
  return awayScore === homeScore ? { homeScore, awayScore: homeScore + 1 } : { homeScore, awayScore };
}

// Demo-only fixture data for filling a division with realistic teams and coaches.
const demoFirstNames = ["Ava", "Liam", "Emma", "Noah", "Olivia", "Ethan", "Sophia", "Mason", "Isabella", "Lucas", "Mia", "Logan", "Amelia", "Elijah", "Harper", "James", "Evelyn", "Benjamin", "Abigail", "Jack"];
const demoLastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Taylor"];
const demoCities = ["Austin", "Round Rock", "Cedar Park", "Pflugerville", "Georgetown", "Leander", "Kyle", "Buda", "San Marcos", "Hutto"];
const demoMascots = ["Comets", "Thunder", "Wolves", "Hawks", "Rangers", "Rebels", "Sharks", "Titans", "Falcons", "Storm", "Blaze", "Aces"];
function demoPick<T>(list: T[]) { return list[Math.floor(Math.random() * list.length)]!; }

export function SeasonApp() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("tournaments");
  const [tournamentId, setTournamentId] = useState("");
  const [dialog, setDialog] = useState<Dialog | { type: "tournament" } | null>(null);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.toLowerCase());
  const [divisionId, setDivisionId] = useState("all");
  const [date, setDate] = useState("2026-09-26");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [roster, setRoster] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ team: Registration; status: Registration["status"] } | null>(null);
  const [refundTarget, setRefundTarget] = useState<Registration | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<Registration | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tournament | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  useEffect(() => { api.getWorkspace().then(setWorkspace).catch((error: Error) => setError(error.message)); }, []);
  useEffect(() => {
    if (!window.location.search.includes("stripeReturn")) return;
    window.history.replaceState(null, "", window.location.pathname);
    setTab("payments");
    api.syncStripeStatus().then(setWorkspace).catch(() => {});
  }, []);
  const pendingRunId = workspace?.runs.find((run) => ["queued", "running"].includes(run.status))?.id;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pendingRunId) return;
    const interval = setInterval(() => { api.getWorkspace().then(setWorkspace).catch(() => {}); setNow(Date.now()); }, 1500);
    return () => clearInterval(interval);
  }, [pendingRunId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); }, [toast]);

  // Retries against the latest revision on a 409 (e.g. a background draft autosave, another tab,
  // or a bulk-action loop's own prior iteration landed first), so routine races with other
  // in-flight saves don't surface as user-facing errors. A few attempts (not just one) so a
  // burst of near-simultaneous writes to the same workspace still self-heals.
  async function executeWithRetry(current: Workspace, command: Command, attemptsLeft = 3) {
    try {
      return await api.execute(current.revision, command);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409 || attemptsLeft <= 1) throw error;
      const fresh = await api.getWorkspace();
      return await executeWithRetry(fresh, command, attemptsLeft - 1);
    }
  }
  // `base` lets sequential loops (bulk actions, demo scoring) thread the freshly-returned workspace
  // through each call instead of every iteration reading the same stale outer-scope `workspace`.
  async function execute(command: Command, base: Workspace | null = workspace) {
    if (!base || busy) return;
    setBusy(true);
    try {
      const updated = await executeWithRetry(base, command);
      setWorkspace(updated);
      setToast(command.type === "generate_schedule" ? "Building your schedule..." : command.type === "publish_schedule" ? "Schedule published" : command.type === "announce" ? "Announcement saved to the local notification center" : "Changes saved");
      return updated;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setWorkspace(await api.getWorkspace());
      throw error;
    } finally { setBusy(false); }
  }
  async function quick(command: Command) { try { await execute(command); } catch (error) { setError(error instanceof Error ? error.message : "Unable to save changes"); } }
  async function connectStripe() {
    setStripeBusy(true);
    try { const { url } = await api.startStripeConnect(); window.location.href = url; }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to start Stripe onboarding"); setStripeBusy(false); }
  }
  async function handleRefund(amountCents: number) {
    if (!refundTarget) return;
    const updated = await api.refundRegistration(tournament.id, refundTarget.id, amountCents);
    setWorkspace(updated);
    setToast("Refund issued");
  }
  async function handleSendInvoice() {
    if (!invoiceTarget) return;
    const updated = await api.sendInvoice(tournament.id, invoiceTarget.id);
    setWorkspace(updated);
    setToast("Invoice sent");
  }
  async function handleDeleteTournament() {
    if (!deleteTarget) return;
    await execute({ type: "delete_tournament", tournamentId: deleteTarget.id });
    setTournamentId(""); navigate("tournaments");
    setToast(`${deleteTarget.name} deleted`);
  }
  function navigate(next: string) { setTab(next); setMobileOpen(false); setSearch(""); setRoster(null); setSelectedTeamIds([]); }
  function selectTournament(id: string) {
    setTournamentId(id); setDivisionId("all"); setSearch(""); setRoster(null); setSelectedTeamIds([]);
    const next = workspace?.tournaments.find((tournament) => tournament.id === id);
    if (next) { setDate(next.startsOn); }
  }
  async function bulkUpdateStatus(status: Registration["status"]) {
    let current = workspace;
    for (const registrationId of selectedTeamIds) {
      try { current = await execute({ type: "registration_status", tournamentId: tournament.id, registrationId, status }, current) ?? current; }
      catch (error) { setError(error instanceof Error ? error.message : "Unable to save changes"); break; }
    }
    setSelectedTeamIds([]);
  }
  async function bulkCheckIn() {
    const targets = teams.filter((team) => selectedTeamIds.includes(team.id) && team.status === "accepted" && team.checkIn !== "checked_in");
    let current = workspace;
    for (const team of targets) {
      try { current = await execute({ type: "check_in", tournamentId: tournament.id, registrationId: team.id, status: "checked_in" }, current) ?? current; }
      catch (error) { setError(error instanceof Error ? error.message : "Unable to save changes"); break; }
    }
    setSelectedTeamIds([]);
  }
  // Repeatedly scores whichever game is currently resolvable/unscored; scoring one game can resolve the
  // next round's participants (advanceTournament), so this re-reads the freshly returned workspace each pass.
  async function runDemo() {
    let current = workspace;
    for (let pass = 0; current && pass < tournament.games.length + 1; pass++) {
      const activeTournament = current.tournaments.find((item) => item.id === tournament.id);
      const target = activeTournament?.games.find((game) => game.homeId && game.awayId && game.homeScore === null && !game.needsResolution && !["bye", "cancelled"].includes(game.status));
      if (!target) break;
      try { current = await execute({ type: "score_game", tournamentId: tournament.id, gameId: target.id, version: target.version, ...randomDemoScore(), forfeit: false }, current) ?? null; }
      catch (error) { setError(error instanceof Error ? error.message : "Unable to save changes"); break; }
    }
  }
  // Fills every division up to its team cap with accepted registrations (accepting auto-adds the coach
  // as a contact), so a fresh tournament looks populated instantly. Rosters are left empty.
  async function runTeamsDemo() {
    let current = workspace;
    for (const division of tournament.divisions) {
      for (;;) {
        const activeTournament = current?.tournaments.find((item) => item.id === tournament.id);
        if (!current || !activeTournament) return;
        const divisionTeams = activeTournament.registrations.filter((team) => team.divisionId === division.id);
        if (divisionTeams.filter((team) => !["declined", "withdrawn"].includes(team.status)).length >= division.maxTeams) break;
        const index = divisionTeams.length + 1;
        const city = demoPick(demoCities);
        const teamName = `${city} ${demoPick(demoMascots)} ${index}`;
        const coachName = `${demoPick(demoFirstNames)} ${demoPick(demoLastNames)}`;
        const coachEmail = `coach.${division.id.slice(0, 6)}.${index}@example.com`;
        try {
          current = await execute({ type: "register_team", tournamentId: tournament.id, data: { divisionId: division.id, teamName, clubName: `${city} ${tournament.sport.replaceAll("_", " ")} Club`, city, coachName, coachEmail } }, current) ?? null;
          if (!current) return;
          const created = current.tournaments.find((item) => item.id === tournament.id)!.registrations.find((team) => team.teamName === teamName)!;
          current = await execute({ type: "registration_status", tournamentId: tournament.id, registrationId: created.id, status: "accepted" }, current) ?? null;
          if (!current) return;
        } catch (error) { setError(error instanceof Error ? error.message : "Unable to create demo registrations"); return; }
      }
    }
  }

  if (!workspace) return <main className="loading-screen"><Brand /><div>{error ? <><h1>Season is not connected</h1><p>{error}</p><button className="button primary" onClick={() => window.location.reload()}>Try again</button></> : <><LoaderCircle className="spin" size={25} /><p>Opening your tournament workspace...</p></>}</div></main>;
  const hasTournament = workspace.tournaments.length > 0;
  const tournament = workspace.tournaments.find((item) => item.id === tournamentId) ?? workspace.tournaments[0]!;
  const teams = hasTournament ? tournament.registrations : [];
  const accepted = teams.filter((team) => team.status === "accepted");
  const announcements = hasTournament ? workspace.announcements.filter((item) => item.tournamentId === tournament.id) : [];
  const unread = workspace.notifications.filter((notification) => !notification.read).length;
  const games = hasTournament ? tournament.games.filter((game) => game.status !== "bye" && (divisionId === "all" || game.divisionId === divisionId) && (!query || `${teamName(tournament, game.homeId)} ${teamName(tournament, game.awayId)} ${game.label}`.toLowerCase().includes(query))) : [];
  const dayGames = games.filter((game) => game.start && localParts(game.start, tournament.timezone).date === date).sort((left, right) => (left.start ?? "").localeCompare(right.start ?? ""));
  const filteredTeams = teams.filter((team) => (divisionId === "all" || team.divisionId === divisionId) && `${team.teamName} ${team.coachName} ${team.city}`.toLowerCase().includes(query));
  const venueGroups = hasTournament ? Object.values(tournament.fields.reduce<Record<string, { venue: string; address: string; fields: typeof tournament.fields }>>((groups, field) => { const key = `${field.venue}|${field.address}`; (groups[key] ??= { venue: field.venue, address: field.address, fields: [] }).fields.push(field); return groups; }, {})) : [];
  const selectedRoster = teams.find((team) => team.id === roster);
  const title = tab === "settings" ? "Tournament settings" : tab === "tournaments" ? "Your tournaments" : tab === "payments" ? "Payments" : tab === "notifications" ? "Notifications" : tab === "organization" ? "Organization settings" : navigation.find((item) => item.id === tab)?.label ?? "Overview";
  const latestRun = hasTournament ? workspace.runs.find((run) => run.tournamentId === tournament.id) : undefined;
  const openGame = (game: Game) => setDialog({ type: "game", game });
  const teamsAtCapacity = hasTournament && tournament.divisions.length > 0 && tournament.divisions.every((division) => tournament.registrations.filter((team) => team.divisionId === division.id && !["declined", "withdrawn"].includes(team.status)).length >= division.maxTeams);
  const headerAction = tab === "teams" ? <><button className="button" disabled={busy || teamsAtCapacity} title="Demo only: fills every division with full, accepted registrations (no player rosters)" onClick={runTeamsDemo}><Dice5 size={16} />Demo</button><button className="button primary" onClick={() => setDialog({ type: "registration" })}><Plus size={16} />Add team</button></> : tab === "schedule" ? <><button className="button" disabled={busy || !!pendingRunId} onClick={() => setDialog({ type: "generate" })}><Sparkles size={16} />Generate schedule</button><button className="button" disabled={busy || !!pendingRunId || !tournament.games.some((game) => game.homeId && game.awayId && game.homeScore === null && !game.needsResolution && !["bye", "cancelled"].includes(game.status))} title="Demo only: fills in a random final score for every unscored game" onClick={runDemo}><Dice5 size={16} />Demo</button><button className="button primary" disabled={busy || !tournament.games.length} onClick={() => setDialog({ type: "publish" })}><CheckCheck size={16} />{tournament.publishedAt ? "Republish" : "Publish"}</button></> : tab === "tournaments" ? <button className="button primary" onClick={() => setDialog({ type: "tournament" })}><Plus size={16} />New tournament</button> : tab === "notifications" ? <button className="button" disabled={busy || !unread} onClick={() => quick({ type: "read_notifications" })}><CheckCheck size={16} />Mark all as read</button> : tab === "overview" ? <>{tournament.status === "draft" && <button className="button primary" disabled={busy} onClick={() => quick({ type: "update_tournament", tournamentId: tournament.id, name: tournament.name, status: "registration_open", rules: tournament.rules })}><Check size={16} />Publish tournament</button>}<PublicLinkBox label="Details page" href={`/${workspace.organization.slug}/${tournament.slug}/details`} onCopy={() => setToast("Link copied")} /><PublicLinkBox label="Registration page" href={`/${workspace.organization.slug}/${tournament.slug}/register`} onCopy={() => setToast("Link copied")} /><button className="button primary" onClick={() => setDialog({ type: "announcement" })}><Megaphone size={16} />Send announcement</button></> : null;
  const divisionSelect = <label className="select-label"><ListFilter size={15} /><select aria-label="Filter by division" value={divisionId} onChange={(event) => setDivisionId(event.target.value)}><option value="all">All divisions</option>{(hasTournament ? tournament.divisions : []).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}</select></label>;
  const searchBox = <label className="search-box"><Search size={16} /><input aria-label="Search teams and games" placeholder={tab === "teams" ? "Search teams or coaches..." : "Search teams or games..."} value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14} /></button>}</label>;
  const rosterIssues = accepted.filter((team) => !team.rosterApproved);

  return <div className="app-shell">
    {mobileOpen && <button className="nav-overlay" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <Link className="brand-link" href="/" aria-label="Season home"><Brand /></Link>
      <div className="nav-heading">General</div>
      <button className={`nav-item ${tab === "tournaments" ? "active" : ""}`} onClick={() => navigate("tournaments")}><Trophy size={18} />All Tournaments</button>
      <button className={`nav-item ${tab === "notifications" ? "active" : ""}`} onClick={() => navigate("notifications")}><Bell size={18} /><span>Notifications</span>{unread > 0 && <span className="unread-dot" />}</button>
      <div className="nav-heading tournament-heading" title={tournamentId ? tournament.name : undefined}>{tournamentId ? tournament.name : "Select a Tournament"}</div>
      <nav aria-label="Tournament navigation" className={tournamentId ? "" : "nav-disabled"}>{navigation.map(({ id, label, icon: Icon }) => <button key={id} disabled={!tournamentId} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><button className="profile" onClick={() => navigate("organization")}><span className="avatar">{workspace.organization.avatarUrl ? <img src={workspace.organization.avatarUrl} alt="" /> : initials(workspace.organization.ownerName)}</span><span><strong>{workspace.organization.ownerName}</strong><small>Tournament director</small></span><Settings2 size={15} /></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><button className="icon-button mobile-menu" title="Open navigation" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="topbar-org"><span className="organization-icon">{workspace.organization.logoUrl ? <img src={workspace.organization.logoUrl} alt="" /> : <Flag size={17} />}</span><strong>{workspace.organization.name}</strong></div><div className="topbar-actions"><button className="icon-button notification-button" title="Notifications" aria-label={`Notifications, ${unread} unread`} onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={19} />{unread > 0 && <span />}</button><button className="avatar small" onClick={() => navigate("organization")} aria-label="Manage profile">{workspace.organization.avatarUrl ? <img src={workspace.organization.avatarUrl} alt="" /> : initials(workspace.organization.ownerName)}</button></div></header>
      <main className="main-content">
        <div className="page-heading"><div><h1>{title === "Overview" ? "Tournament overview" : title}</h1></div><div className="heading-actions">{headerAction}</div></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={18} /></button></div>}
        {tab === "overview" && <>
          <section className="event-strip"><div className="event-image" role="img" aria-label="Soccer field at the tournament venue" /><div className="event-strip-content"><h2>{tournament.name}</h2><div className="event-details"><span><CalendarDays size={14} />{dateLabel(tournament.startsOn, true)} - {dateLabel(tournament.endsOn, true)}</span><span><MapPin size={14} />{tournament.location || "Location pending"}</span><span><Flag size={14} />{tournament.sport.replaceAll("_", " ")}</span></div></div><button className="event-arrow" aria-label="View tournament schedule" title="View schedule" onClick={() => navigate("schedule")}><ArrowUpRight size={22} /></button></section>
          <section className="stats-grid" aria-label="Tournament statistics"><Stat label="Registered teams" value={<>{teams.length}<span className="stat-value-max">/{tournament.divisions.reduce((sum, division) => sum + division.maxTeams, 0)}</span></>} icon={<Users size={18} />} onClick={() => navigate("teams")} /><Stat label="Games scheduled" value={tournament.games.filter((game) => game.start && game.status !== "bye").length} icon={<CalendarDays size={18} />} onClick={() => navigate("schedule")} /><Stat label="Teams checked in" value={<>{teams.filter((team) => team.checkIn === "checked_in").length}<span className="stat-value-max">/{accepted.length}</span></>} icon={<ClipboardCheck size={18} />} onClick={() => navigate("teams")} /><Stat label="Roster compliance" value={`${accepted.length ? Math.round(accepted.filter((team) => team.rosterApproved).length / accepted.length * 100) : 0}%`} icon={<ShieldCheck size={18} />} warning={rosterIssues.length > 0} onClick={() => navigate("teams")} /></section>
          <section className="games-section"><SectionTitle title="Game Summary" count={dayGames.filter((game) => game.status === "in_progress" || game.status === "scheduled").length}><div className="toolbar-right"><label className="select-label"><CalendarDays size={14} /><select aria-label="Select day" value={date} onChange={(event) => setDate(event.target.value)}>{[tournament.startsOn, ...(tournament.endsOn !== tournament.startsOn ? [tournament.endsOn] : [])].map((day) => <option key={day} value={day}>{dateLabel(day)}</option>)}</select></label>{divisionSelect}</div></SectionTitle><div className="live-games">{dayGames.filter((game) => game.status === "in_progress" || game.status === "scheduled").map((game) => game.status === "in_progress" ? <div key={game.id}><div className="field-label"><span className="live-dot" />{tournament.fields.find((field) => field.id === game.fieldId)?.name}<small>LIVE NOW</small></div><GameCard game={game} tournament={tournament} onClick={() => openGame(game)} /></div> : <button key={game.id} className="upcoming-row" onClick={() => openGame(game)}><div className="upcoming-time">{gameTime(game.start, tournament.timezone)}<small>{tournament.fields.find((field) => field.id === game.fieldId)?.name}</small></div><div className="upcoming-teams"><strong>{teamName(tournament, game.homeId)}</strong><span><small>vs</small>{teamName(tournament, game.awayId)}</span></div><Badge>{tournament.divisions.find((division) => division.id === game.divisionId)?.name}</Badge><ChevronRight size={17} /></button>)}{!dayGames.some((game) => game.status === "in_progress" || game.status === "scheduled") && <Empty title="No games for this day" />}</div></section>
        </>}
        {tab === "schedule" && <>
          <div className="toolbar">{searchBox}<div className="toolbar-right"><input aria-label="Schedule date" type="date" min={tournament.startsOn} max={tournament.endsOn} value={date} onChange={(event) => setDate(event.target.value)} />{divisionSelect}<button className="icon-button" title="Export schedule as CSV" aria-label="Export schedule as CSV" onClick={() => exportSchedule(tournament)}><ArrowDownToLine size={17} /></button></div></div>
          {latestRun && <div className={`run-status ${latestRun.status === "failed" ? "danger" : ""}`}><Status status={latestRun.status} label={latestRun.status === "queued" ? "In Progress" : undefined} /><span>{latestRun.status === "queued" ? "Generating your tournament schedule..." : latestRun.status === "running" ? "Finding available fields and times..." : latestRun.status === "succeeded" ? (latestRun.unplacedCount ? `Schedule ready. ${latestRun.unplacedCount} unplaced games.` : "Schedule ready!") : latestRun.violations.join(" ")}{["queued", "running"].includes(latestRun.status) && <small className="muted"> · {Math.max(0, Math.round((now - new Date(latestRun.createdAt).getTime()) / 1000))}s, usually under 30s</small>}</span></div>}
          <div className="field-board">{tournament.fields.filter((field) => dayGames.some((game) => game.fieldId === field.id)).map((field) => <section className="field-column" key={field.id}><header><span className="field-number">{field.name.replace(/\D/g, "") || <Flag size={15} />}</span><div><h2>{field.name}</h2><small>{field.venue}</small></div><span className="count">{dayGames.filter((game) => game.fieldId === field.id).length}</span></header><div className="field-games">{dayGames.filter((game) => game.fieldId === field.id).map((game) => <GameCard key={game.id} game={game} tournament={tournament} onClick={() => openGame(game)} />)}</div></section>)}</div>
          {!tournament.fields.length && <Empty title="Add venues to get started"><button className="button" onClick={() => { navigate("settings"); setDialog({ type: "venue" }); }}><Plus size={16} />Add a venue</button></Empty>}
          {!!tournament.fields.length && !dayGames.length && <Empty title="No games scheduled"><p className="muted">No games are scheduled for this day.</p></Empty>}
          {games.some((game) => !game.start) && <section><SectionTitle title="Unplaced games" />{games.filter((game) => !game.start).map((game) => <button key={game.id} className="upcoming-row" onClick={() => setDialog({ type: "move", game })}><span>{game.label}</span><span>{teamName(tournament, game.homeId)} vs {teamName(tournament, game.awayId)}</span><ChevronRight size={16} /></button>)}</section>}
        </>}
        {tab === "teams" && <><div className="toolbar">{searchBox}{divisionSelect}</div>{selectedTeamIds.length > 0 && <div className="bulk-actions-bar"><span>{selectedTeamIds.length} selected</span><div className="bulk-actions-buttons"><button className="button small" disabled={busy} onClick={() => bulkUpdateStatus("accepted")}><Check size={14} />Accept</button><button className="button small" disabled={busy} onClick={() => bulkUpdateStatus("waitlisted")}>Waitlist</button><button className="button small danger-text" disabled={busy} onClick={() => bulkUpdateStatus("declined")}>Decline</button><button className="button small" disabled={busy} onClick={bulkCheckIn}><ClipboardCheck size={14} />Check in</button><button className="icon-button" aria-label="Clear selection" title="Clear selection" onClick={() => setSelectedTeamIds([])}><X size={14} /></button></div></div>}<div className="table-wrapper"><table><thead><tr><th><input type="checkbox" aria-label="Select all teams" checked={filteredTeams.length > 0 && filteredTeams.every((team) => selectedTeamIds.includes(team.id))} onChange={() => setSelectedTeamIds((current) => filteredTeams.every((team) => current.includes(team.id)) ? current.filter((id) => !filteredTeams.some((team) => team.id === id)) : [...new Set([...current, ...filteredTeams.map((team) => team.id)])])} /></th><th>Team</th><th>Division</th><th>Registration</th><th>Roster</th><th>Entry fee</th><th>Check-in</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredTeams.map((team, index) => <tr key={team.id} className="clickable-row" onClick={() => setRoster(team.id)}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${team.teamName}`} checked={selectedTeamIds.includes(team.id)} onChange={() => setSelectedTeamIds((current) => current.includes(team.id) ? current.filter((id) => id !== team.id) : [...current, team.id])} /></td><td><span className="team-cell"><TeamMark name={team.teamName} index={index} /><span><strong>{team.teamName}</strong><small>{team.city}</small></span></span></td><td>{tournament.divisions.find((division) => division.id === team.divisionId)?.name}</td><td><Status status={team.status} /></td><td><span className={`compliance ${team.rosterApproved ? "success-text" : "warning-text"}`}><ShieldCheck size={15} />{team.rosterApproved ? "Approved" : "Needs review"}</span><small className="cell-sub">{team.players.length} players</small></td><td><span>{money(team.amountCents)}<small className="cell-sub">{team.paymentStatus}</small></span></td><td><button className={`button small ${team.checkIn === "checked_in" ? "checked-button" : ""}`} disabled={busy || team.status !== "accepted"} onClick={(event) => { event.stopPropagation(); quick({ type: "check_in", tournamentId: tournament.id, registrationId: team.id, status: team.checkIn === "checked_in" ? "not_checked_in" : "checked_in" }); }}>{team.checkIn === "checked_in" ? <><CheckCheck size={15} />Checked in</> : <><ClipboardCheck size={15} />Check in</>}</button></td><td><button className="icon-button" aria-label={`View ${team.teamName}`} title="View team" onClick={(event) => { event.stopPropagation(); setRoster(team.id); }}><ChevronRight size={18} /></button></td></tr>)}</tbody></table>{!filteredTeams.length && <Empty title="No teams found"><p>Try another filter or add a team.</p></Empty>}</div><div className="table-footer">{filteredTeams.length} of {teams.length} teams<span>{`${teams.filter((team) => team.rosterApproved).length} approved rosters`}</span></div></>}
        {tab === "brackets" && <><div className="toolbar"><div><h2>Championship brackets</h2><p className="muted small-text">{tournament.name}</p></div>{divisionSelect}</div>{tournament.divisions.filter((division) => divisionId === "all" || division.id === divisionId).map((division) => { const divisionGames = games.filter((game) => game.divisionId === division.id && game.bracket !== "pool"); return <section className="bracket-section" key={division.id}><SectionTitle title={division.name}><Badge>{division.format.replaceAll("_", " ")}</Badge></SectionTitle>{["championship", "losers", "consolation"].map((bracket) => { const bracketGames = divisionGames.filter((game) => game.bracket === bracket); return bracketGames.length ? <div key={bracket}>{bracket !== "championship" && <h3>{bracket} bracket</h3>}<div className="bracket-board">{[...new Set(bracketGames.map((game) => game.round))].sort((left, right) => left - right).map((round) => <div className="bracket-round" key={round}><div className="round-heading">{bracketGames.find((game) => game.round === round)?.label}</div><div className="bracket-matches">{bracketGames.filter((game) => game.round === round).map((game) => <GameCard key={game.id} game={game} tournament={tournament} onClick={() => openGame(game)} />)}</div></div>)}</div></div> : null; })}{!divisionGames.length && (hasBracketStage(division.format) ? <Empty title="Bracket not generated"><p>Generate the tournament schedule to create matchups.</p></Empty> : <Empty title="No elimination bracket"><p>This division uses a {division.format.replaceAll("_", " ")} format — see the Standings tab for placement.</p></Empty>)}</section>; })}</>}
        {tab === "standings" && <><div className="toolbar"><div><h2>Pool standings</h2><div className="standings-meta"><span className="muted small-text">Win {tournament.rules.winPoints} pts · Draw {tournament.rules.tiePoints} pt · Loss {tournament.rules.lossPoints} pts</span><a className="field-info-link" href="/docs#points" target="_blank" rel="noopener noreferrer"><Info size={12} />How points work</a></div></div>{divisionSelect}</div>{tournament.divisions.filter((division) => divisionId === "all" || division.id === divisionId).map((division) => <section className="standings-section" key={division.id}><SectionTitle title={division.name} />{[...new Set(accepted.filter((team) => team.divisionId === division.id).map((team) => team.pool))].map((pool) => { const ids = accepted.filter((team) => team.divisionId === division.id && team.pool === pool).map((team) => team.id); const rows = computeStandings(ids, tournament.games.filter((game) => game.divisionId === division.id && game.bracket === "pool" && game.pool === pool), tournament.rules); return <div className="table-wrapper" key={pool}><table><caption>Pool {pool}</caption><thead><StandingsHead /></thead><tbody>{rows.map((row, index) => <tr key={row.registrationId}><td><span className={`rank ${index < division.advancePerPool ? "qualifying" : ""}`}>{row.rank}</span></td><td><div className="team-cell"><TeamMark name={teamName(tournament, row.registrationId)} index={index} /><strong>{teamName(tournament, row.registrationId)}</strong></div></td><td>{row.played}</td><td>{row.wins}</td><td>{row.ties}</td><td>{row.losses}</td><td>{row.scored}</td><td>{row.conceded}</td><td>{row.difference > 0 ? "+" : ""}{row.difference}</td><td><InfoTip hint={row.pointsFormula}><strong>{row.points}</strong></InfoTip></td></tr>)}</tbody></table></div>; })}</section>)}</>}
        {tab === "communication" && <div className="communication-columns">
          <section className="contacts-section"><SectionTitle title="Contacts" count={tournament.contacts.length}><button className="button small" onClick={() => setDialog({ type: "contact" })}><Plus size={15} />Create contact</button></SectionTitle><div className="table-wrapper"><table><thead><tr><th>Name</th><th>Email</th><th>Note</th><th /></tr></thead><tbody>{tournament.contacts.map((contact) => <tr key={contact.id}><td><strong>{contact.name}</strong></td><td>{contact.email}</td><td>{contact.note}</td><td className="row-actions"><button aria-label={`Edit ${contact.name}`} className="icon-button" onClick={() => setDialog({ type: "contact", contact })}><Pencil size={14} /></button><button aria-label={`Delete ${contact.name}`} className="icon-button danger-text" disabled={busy} onClick={() => quick({ type: "delete_contact", tournamentId: tournament.id, contactId: contact.id })}><Trash2 size={14} /></button></td></tr>)}</tbody></table>{!tournament.contacts.length && <Empty title="No contacts yet" />}</div></section>
          <section className="announcements-list"><SectionTitle title="Announcements" count={announcements.length}><button className="button small" onClick={() => setDialog({ type: "announcement" })}><Plus size={15} />Create announcement</button></SectionTitle><div className="table-wrapper"><table><thead><tr><th>Subject</th><th>Audience</th><th>Sent</th><th>Recipients</th></tr></thead><tbody>{announcements.map((item) => <tr key={item.id}><td><strong>{item.subject}</strong></td><td>{item.contactIds.length ? "Selected contacts" : "All contacts"}</td><td>{gameTime(item.sentAt, tournament.timezone)}</td><td>{item.recipientCount} contacts</td></tr>)}</tbody></table>{!announcements.length && <Empty title="No announcements yet" />}</div></section>
        </div>}
        {tab === "tournaments" && (hasTournament ? <div className="tournaments-list">{workspace.tournaments.map((item) => <button className="tournament-row" key={item.id} onClick={() => { selectTournament(item.id); navigate("overview"); }}><div className="tournament-date"><span>{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${item.startsOn}T12:00:00Z`))}</span><strong>{item.startsOn.slice(-2)}</strong></div><div><h2>{item.name}</h2><p><MapPin size={14} />{item.location}<span>{item.registrations.length} teams</span><span>{item.sport}</span></p></div><Status status={item.status} /><ArrowUpRight size={21} /></button>)}</div> : <Empty title="Create your first tournament"><p className="muted">{workspace.organization.name} doesn&apos;t have any tournaments yet.</p></Empty>)}
        {tab === "notifications" && <div className="notifications-list">{workspace.notifications.length ? workspace.notifications.map((notification) => <article className={notification.read ? "read" : ""} key={notification.id}><Bell size={18} /><div><h3>{notification.title}</h3><p>{notification.body}</p><small>{gameTime(notification.createdAt, hasTournament ? tournament.timezone : "UTC")}</small></div>{!notification.read && <span className="unread-dot" />}</article>) : <Empty title="No notifications yet" />}</div>}
        {tab === "payments" && <><div className="stats-grid three"><Stat label="Registration value" value={money(teams.reduce((sum, team) => sum + team.amountCents, 0))} icon={<CreditCard size={18} />} note="Total entry fees" /><Stat label="Collected" value={money(teams.filter((team) => team.paymentStatus === "paid").reduce((sum, team) => sum + team.amountCents, 0))} icon={<CheckCheck size={18} />} note="Confirmed payments only" /><Stat label="Refunded" value={money(teams.reduce((sum, team) => sum + team.refundedCents, 0))} icon={<ArrowUpRight size={18} />} note="Manager-issued refunds" /></div><div className="table-wrapper"><table><thead><tr><th>Team</th><th>Entry fee</th><th>Payment status</th><th>Refunded</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{teams.map((team) => <tr key={team.id}><td><strong>{team.teamName}</strong></td><td>{money(team.amountCents)}</td><td><Status status={team.paymentStatus} /></td><td>{money(team.refundedCents)}</td><td>{["paid", "partially_refunded"].includes(team.paymentStatus) && team.refundedCents < team.amountCents && <button className="button small" onClick={() => setRefundTarget(team)}><RotateCcw size={14} />Refund</button>}</td></tr>)}</tbody></table></div></>}
        {tab === "organization" && <OrganizationSettings workspace={workspace} busy={busy} stripeBusy={stripeBusy} execute={execute} quick={quick} connectStripe={connectStripe} />}
        {tab === "settings" && <><section className="settings-section"><SectionTitle title="Tournament details"><button className="button small" onClick={() => setDialog({ type: "rules" })}><Settings2 size={15} />Edit settings</button></SectionTitle><dl className="details-grid"><div><dt>Name</dt><dd>{tournament.name}</dd></div><div><dt>Sport</dt><dd className="capitalize">{tournament.sport.replaceAll("_", " ")}</dd></div><div><dt>Status</dt><dd className="capitalize">{tournament.status.replaceAll("_", " ")}</dd></div><div><dt>Timezone</dt><dd>{tournament.timezone}</dd></div><div><dt>Location</dt><dd>{tournament.location || "Not set"}</dd></div><div><dt>Competition dates</dt><dd>{dateLabel(tournament.startsOn, true)} - {dateLabel(tournament.endsOn, true)}</dd></div><div><dt>Game duration</dt><dd>{tournament.rules.gameMinutes} minutes</dd></div><div><dt>Minimum team rest</dt><dd>{tournament.rules.restMinutes} minutes</dd></div><div><dt>Minimum {playAreaLabel(tournament.sport).toLowerCase()} buffer</dt><dd>{tournament.rules.bufferMinutes} minutes</dd></div><div><dt>Maximum games per team per day</dt><dd>{tournament.rules.maxGamesPerDay}</dd></div>{tournament.description && <div className="full-width"><dt>Description</dt><dd>{tournament.description}</dd></div>}</dl></section><section className="settings-section"><SectionTitle title="Divisions" count={tournament.divisions.length}><button className="button small" onClick={() => setDialog({ type: "division" })}><Plus size={15} />Add division</button></SectionTitle><div className="table-wrapper"><table><thead><tr><th>Division</th><th>Format</th><th>Teams</th><th>Guarantee</th><th>Entry fee</th></tr></thead><tbody>{tournament.divisions.map((division) => <tr key={division.id}><td><strong>{division.name}</strong></td><td>{division.format.replaceAll("_", " ")}</td><td>{teams.filter((team) => team.divisionId === division.id).length} / {division.maxTeams}</td><td>{division.guaranteedGames} games</td><td>{money(division.entryFeeCents)}</td></tr>)}</tbody></table></div></section><section className="settings-section"><SectionTitle title="Venues" count={venueGroups.length}><button className="button small" onClick={() => setDialog({ type: "venue" })}><Plus size={15} />Add venue</button></SectionTitle><div className="field-settings">{venueGroups.map((group) => <div key={`${group.venue}-${group.address}`}><Flag size={20} /><div><h3>{group.venue}</h3><p>{group.address}</p><small>{group.fields.map((field) => field.name).join(" · ")}</small></div><Badge>{tournament.sport.replaceAll("_", " ")}</Badge></div>)}</div></section><section className="settings-section"><SectionTitle title="Danger zone" /><div className="danger-zone"><div><h3>Delete this tournament</h3><p>Permanently removes all divisions, registrations, games, and schedules. This cannot be undone.</p></div><button className="button danger" onClick={() => setDeleteTarget(tournament)}><Trash2 size={15} />Delete tournament</button></div></section></>}
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
    {notificationsOpen && <Modal title="Notifications" onClose={() => setNotificationsOpen(false)}><button className="text-link" onClick={() => quick({ type: "read_notifications" })}><CheckCheck size={15} />Mark all as read</button><div className="notifications-list">{workspace.notifications.map((notification) => <article className={notification.read ? "read" : ""} key={notification.id}><Bell size={18} /><div><h3>{notification.title}</h3><p>{notification.body}</p><small>{gameTime(notification.createdAt, hasTournament ? tournament.timezone : "UTC")}</small></div>{!notification.read && <span className="unread-dot" />}</article>)}</div></Modal>}
    {selectedRoster && <RosterDetail team={selectedRoster} tournament={tournament} busy={busy} onClose={() => setRoster(null)} onAdd={() => { setRoster(null); setDialog({ type: "player", team: selectedRoster }); }} onApprove={() => quick({ type: "approve_roster", tournamentId: tournament.id, registrationId: selectedRoster.id })} onDecide={(status) => { setRoster(null); setDecision({ team: selectedRoster, status }); }} onInvoice={() => { setRoster(null); setInvoiceTarget(selectedRoster); }} />}
    {decision && <DecisionEmailModal team={decision.team} status={decision.status} organizationName={workspace.organization.name} busy={busy} onClose={() => setDecision(null)} onOpenSettings={() => { setDecision(null); navigate("organization"); }} onSave={async () => { await execute({ type: "registration_status", tournamentId: tournament.id, registrationId: decision.team.id, status: decision.status }); }} onSend={async (subject, body) => { await execute({ type: "registration_status", tournamentId: tournament.id, registrationId: decision.team.id, status: decision.status }); await api.sendRegistrationEmail(tournament.id, decision.team.id, subject, body); }} />}
    {refundTarget && <RefundDialog team={refundTarget} busy={busy} onClose={() => setRefundTarget(null)} onRefund={handleRefund} />}
    {invoiceTarget && <InvoiceDialog team={invoiceTarget} busy={busy} onClose={() => setInvoiceTarget(null)} onSend={handleSendInvoice} />}
    {deleteTarget && <DeleteTournamentDialog tournament={deleteTarget} busy={busy} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteTournament} />}
    {dialog && (dialog.type === "tournament"
      ? <TournamentWizard workspace={workspace} busy={busy} execute={execute} onClose={() => setDialog(null)} onCreated={(created, message) => { selectTournament(created.id); setDate(created.startsOn); navigate("overview"); setToast(message); }} />
      : <ActionDialog dialog={dialog} tournament={tournament} busy={busy} execute={execute} onClose={() => setDialog(null)} onChange={setDialog} />)}
  </div>;
}

function OrganizationSettings({ workspace, busy, stripeBusy, execute, quick, connectStripe }: { workspace: Workspace; busy: boolean; stripeBusy: boolean; execute: (command: Command) => Promise<Workspace | undefined>; quick: (command: Command) => Promise<void>; connectStripe: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState(workspace.organization.avatarUrl ?? null);
  const [logoUrl, setLogoUrl] = useState(workspace.organization.logoUrl ?? null);
  function readImage(file: File | undefined, onLoad: (dataUrl: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") onLoad(reader.result); };
    reader.readAsDataURL(file);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setDetails([]);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    try { await execute({ type: "update_organization", name: text("name"), avatarUrl, logoUrl, replyToEmail: text("replyToEmail").trim() || null }); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to save changes"); if (err instanceof ApiError) setDetails(err.details); }
  }
  return <>
    {error && <div role="alert" className="form-error"><strong>{error}</strong>{details.length > 0 && <ul>{details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}</div>}
    <form onSubmit={submit}>
      <section className="settings-section">
        <SectionTitle title="Profile" />
        <div className="dialog-form">
          <div className="picture-fields"><div className="picture-field"><span className="avatar large">{avatarUrl ? <img src={avatarUrl} alt="" /> : workspace.organization.ownerName.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span><div><strong>Profile picture</strong><label className="text-link file-label">Change photo<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], setAvatarUrl)} /></label>{avatarUrl && <button type="button" className="text-link" onClick={() => setAvatarUrl(null)}>Remove</button>}</div></div><div className="picture-field"><span className="organization-icon large">{logoUrl ? <img src={logoUrl} alt="" /> : <Flag size={17} />}</span><div><strong>Organization logo</strong><label className="text-link file-label">Change logo<input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0], setLogoUrl)} /></label>{logoUrl && <button type="button" className="text-link" onClick={() => setLogoUrl(null)}>Remove</button>}</div></div></div>
          <label>Organization name<input name="name" defaultValue={workspace.organization.name} minLength={2} maxLength={80} required /></label>
        </div>
      </section>
      <section className="settings-section">
        <SectionTitle title="Email" />
        <div className="dialog-form">
          <label>Reply-to email (optional)<input name="replyToEmail" type="email" defaultValue={workspace.organization.replyToEmail ?? ""} maxLength={200} placeholder="you@example.com" /></label>
          <div className="form-note">Registration decision emails are always sent from notifications@season.com. Set a reply-to address here to receive coaches&apos; replies at your own inbox.</div>
        </div>
        <div className="modal-actions"><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Save organization</button></div>
      </section>
    </form>
    <section className="settings-section">
      <SectionTitle title="Payments" />
      <div className="integration-notice"><span className="integration-icon"><CreditCard size={18} /></span>{!workspace.organization.stripeConnectAccountId ? <><div><h2>Connect Stripe to accept entry fees</h2><p>Requires a Stripe Express account for {workspace.organization.name}. A 10% platform fee applies; registration can&apos;t open until onboarding is complete.</p></div><button className="button primary" disabled={stripeBusy} onClick={connectStripe}>{stripeBusy ? <LoaderCircle className="spin" size={16} /> : <ExternalLink size={16} />}Connect Stripe</button></> : !workspace.organization.stripeOnboardingComplete ? <><div><h2>Finish Stripe onboarding</h2><p>Stripe needs a few more details before {workspace.organization.name} can accept live payments.</p></div><button className="button primary" disabled={stripeBusy} onClick={connectStripe}>{stripeBusy ? <LoaderCircle className="spin" size={16} /> : <ExternalLink size={16} />}Continue onboarding</button></> : <><div><h2>Stripe Connect is active</h2><p>{workspace.organization.name} is ready to accept entry fees. Choose who covers the 10% platform fee.</p></div><div className="segmented"><button className={workspace.organization.feeMode === "absorb" ? "selected" : ""} onClick={() => quick({ type: "update_fee_mode", feeMode: "absorb" })}>Organization absorbs it</button><button className={workspace.organization.feeMode === "passthrough" ? "selected" : ""} onClick={() => quick({ type: "update_fee_mode", feeMode: "passthrough" })}>Pass to the team</button></div></>}</div>
    </section>
    <section className="settings-section">
      <SectionTitle title="Ownership" />
      <div className="dialog-form">
        <div className="details-grid"><div><dt>Owner</dt><dd>{workspace.organization.ownerName}</dd></div></div>
        <form action={signOut}><button type="submit" className="text-link">Sign out</button></form>
      </div>
    </section>
  </>;
}

function Stat({ label, value, icon, note, warning = false, onClick }: { label: string; value: ReactNode; icon: ReactNode; note?: string; warning?: boolean; onClick?: () => void }) {
  const content = <><div className="stat-label">{label}<span>{onClick ? <ArrowUpRight size={14} className="stat-hover-icon" /> : null}{icon}</span></div><strong className="stat-value">{value}</strong>{note && <div className={`stat-note ${warning ? "warning-text" : ""}`}>{warning ? <span className="warning-dot" /> : <span className="mini-dash" />}{note}</div>}</>;
  return onClick ? <button type="button" className="stat stat-clickable" onClick={onClick}>{content}</button> : <div className="stat">{content}</div>;
}

function PublicLinkBox({ label, href, onCopy }: { label: string; href: string; onCopy: () => void }) {
  async function copy() {
    const url = new URL(href, window.location.origin).toString();
    try { await navigator.clipboard.writeText(url); } catch { /* clipboard unavailable */ }
    onCopy();
  }
  return <div className="link-box"><a href={href} target="_blank" rel="noreferrer"><ExternalLink size={14} />{label}</a><button type="button" className="icon-button" title="Copy link" aria-label={`Copy ${label} link`} onClick={copy}><Copy size={14} /></button></div>;
}

function RosterDetail({ team, tournament, busy, onClose, onAdd, onApprove, onDecide, onInvoice }: { team: Registration; tournament: Tournament; busy: boolean; onClose: () => void; onAdd: () => void; onApprove: () => void; onDecide: (status: Registration["status"]) => void; onInvoice: () => void }) {
  const division = tournament.divisions.find((division) => division.id === team.divisionId)!;
  const canInvoice = team.status === "accepted" && team.amountCents > 0 && ["unpaid", "failed"].includes(team.paymentStatus);
  return <Modal title={team.teamName} onClose={onClose} wide><div className="roster-summary"><TeamMark name={team.teamName} /><div><h3>{division.name}</h3><p>{team.coachName} · {team.coachEmail}</p></div><Status status={team.status} />{canInvoice && <button className="button small" onClick={onInvoice}><CreditCard size={14} />Send invoice</button>}</div>{team.status !== "accepted" && <div className="decision-actions"><button className="button primary" disabled={busy} onClick={() => onDecide("accepted")}>Accept team</button><button className="button" disabled={busy} onClick={() => onDecide("waitlisted")}>Waitlist</button><button className="button danger-text" disabled={busy} onClick={() => onDecide("declined")}>Decline</button></div>}<SectionTitle title="Roster" count={team.players.length}><button className="button small" onClick={onAdd}><Plus size={15} />Add player</button></SectionTitle><div className="table-wrapper"><table><thead><tr><th>Player</th><th>Number</th><th>Birthdate</th></tr></thead><tbody>{team.players.map((player) => <tr key={player.id}><td><strong>{player.firstName} {player.lastName}</strong></td><td>{player.jerseyNumber}</td><td>{player.birthdate}</td></tr>)}</tbody></table></div><div className="modal-actions"><button className="button" onClick={onClose}>Close</button><button className="button primary" disabled={busy || team.rosterApproved} onClick={onApprove}><ShieldCheck size={16} />{team.rosterApproved ? "Roster approved" : "Approve roster"}</button></div></Modal>;
}

function DecisionEmailModal({ team, status, organizationName, busy, onClose, onOpenSettings, onSave, onSend }: { team: Registration; status: Registration["status"]; organizationName: string; busy: boolean; onClose: () => void; onOpenSettings: () => void; onSave: () => Promise<void>; onSend: (subject: string, body: string) => Promise<void> }) {
  const templates: Record<string, { subject: string; body: string }> = {
    accepted: { subject: `${team.teamName} is confirmed!`, body: `Hi ${team.coachName},\n\nGreat news - ${team.teamName} has been accepted into the tournament. We're looking forward to seeing you compete!\n\nWe'll follow up with the schedule as soon as it's published.\n\n${organizationName}` },
    waitlisted: { subject: `${team.teamName} is on the waitlist`, body: `Hi ${team.coachName},\n\n${team.teamName} has been placed on the waitlist. We'll reach out right away if a spot opens up.\n\nThanks for your patience.\n\n${organizationName}` },
    declined: { subject: `Update on your ${team.teamName} registration`, body: `Hi ${team.coachName},\n\nThank you for registering ${team.teamName}. Unfortunately we're not able to offer a spot in this tournament at this time.\n\nWe hope to see you at a future event.\n\n${organizationName}` },
  };
  const template = templates[status] ?? templates.declined!;
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const label = status === "accepted" ? "Accept" : status === "waitlisted" ? "Waitlist" : "Decline";
  const decisionLabel = status === "accepted" ? "Acceptance" : status === "waitlisted" ? "Waitlist" : "Rejection";
  async function handleSend() {
    setError(""); setSending(true);
    try { await onSend(subject, body); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to send the email"); }
    finally { setSending(false); }
  }
  async function handleSave() {
    setError(""); setSaving(true);
    try { await onSave(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save changes"); }
    finally { setSaving(false); }
  }
  return <Modal title={`${label} ${team.teamName}`} onClose={onClose} wide><div className="dialog-form">
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
    <div className="form-note"><span>This email will be sent from <strong>notifications@season.com</strong>. To receive replies at your own address, add a reply-to email in <button type="button" className="link-button" onClick={onOpenSettings}>Organization settings</button>.</span></div>
    <label>To<input value={team.coachEmail} readOnly disabled /></label>
    <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={150} required /></label>
    <label>Message<textarea rows={8} value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} required /></label>
    <div className="modal-actions">
      <button className="button" disabled={busy || sending || saving} onClick={handleSave}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}Confirm {decisionLabel}, don't email</button>
      <button className="button primary" disabled={busy || sending || saving || !subject.trim() || !body.trim()} onClick={handleSend}>{sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}Confirm {decisionLabel}, send email</button>
    </div>
  </div></Modal>;
}

function RefundDialog({ team, busy, onClose, onRefund }: { team: Registration; busy: boolean; onClose: () => void; onRefund: (amountCents: number) => Promise<void> }) {
  const remainingCents = team.amountCents - team.refundedCents;
  const [amount, setAmount] = useState((remainingCents / 100).toFixed(2));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > remainingCents) { setError("Enter a valid amount up to the amount paid."); return; }
    setSending(true);
    try { await onRefund(amountCents); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to process refund"); }
    finally { setSending(false); }
  }
  return <Modal title={`Refund ${team.teamName}`} onClose={onClose}><form className="dialog-form" onSubmit={handleSubmit}>
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
    <p className="muted small-text">Paid {money(team.amountCents)}{team.refundedCents > 0 ? ` \u00b7 ${money(team.refundedCents)} already refunded` : ""}. The platform fee is not refunded.</p>
    <label>Refund amount (USD)<input type="number" min="0.01" max={(remainingCents / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
    <div className="modal-actions"><button className="button primary" disabled={busy || sending}>{sending ? <LoaderCircle className="spin" size={16} /> : <RotateCcw size={16} />}Issue refund</button></div>
  </form></Modal>;
}

function InvoiceDialog({ team, busy, onClose, onSend }: { team: Registration; busy: boolean; onClose: () => void; onSend: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  async function handleSubmit() {
    setError(""); setSending(true);
    try { await onSend(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to send the invoice"); }
    finally { setSending(false); }
  }
  return <Modal title={`Send invoice to ${team.teamName}`} onClose={onClose}><div className="dialog-form">
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
    <p className="muted small-text">Stripe will email <strong>{team.coachEmail}</strong> a hosted invoice for {money(team.amountCents)}, due in 7 days.</p>
    <div className="modal-actions"><button className="button primary" disabled={busy || sending} onClick={handleSubmit}>{sending ? <LoaderCircle className="spin" size={16} /> : <CreditCard size={16} />}Send invoice</button></div>
  </div></Modal>;
}

function DeleteTournamentDialog({ tournament, busy, onClose, onConfirm }: { tournament: Tournament; busy: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (confirmText !== tournament.name) { setError("Type the tournament name exactly to confirm."); return; }
    setSending(true);
    try { await onConfirm(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to delete this tournament"); }
    finally { setSending(false); }
  }
  return <Modal title={`Delete ${tournament.name}`} onClose={onClose}><form className="dialog-form" onSubmit={handleSubmit}>
    {error && <div role="alert" className="form-error"><strong>{error}</strong></div>}
    <p className="muted small-text">This permanently deletes all divisions, registrations, games, and schedules for this tournament. This cannot be undone.</p>
    <label>Type <strong>{tournament.name}</strong> to confirm<input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoComplete="off" required /></label>
    <div className="modal-actions"><button className="button danger" disabled={busy || sending || confirmText !== tournament.name}>{sending ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}Delete tournament</button></div>
  </form></Modal>;
}

function exportSchedule(tournament: Tournament) {
  const cell = (value: string) => `"${(/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  const rows = [["Date", "Time", "Field", "Division", "Home", "Away", "Status"], ...tournament.games.filter((game) => game.status !== "bye").map((game) => [game.start ? localParts(game.start, tournament.timezone).date : "", gameTime(game.start, tournament.timezone), tournament.fields.find((field) => field.id === game.fieldId)?.name ?? "", tournament.divisions.find((division) => division.id === game.divisionId)?.name ?? "", teamName(tournament, game.homeId), teamName(tournament, game.awayId), game.status])];
  const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${tournament.slug}-schedule.csv`; anchor.click(); URL.revokeObjectURL(url);
}