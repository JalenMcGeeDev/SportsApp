"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUpRight, Inbox, Info, MapPin } from "lucide-react";
import type { Game } from "@season/types";

type CompetitionView = { timezone: string; registrations: { id: string; teamName: string }[]; divisions: { id: string; name: string }[]; fields: { id: string; name: string; venue: string }[] };

export function Brand() { return <span className="brand"><img src="/images/season-logo.png" alt="Season" /></span>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Status({ status, label }: { status: string; label?: string }) { return <Badge tone={["final", "accepted", "approved", "checked_in", "paid", "succeeded"].includes(status) ? "success" : ["in_progress", "scheduled", "registration_open"].includes(status) ? "accent" : ["pending", "submitted", "waitlisted", "unpaid", "postponed", "flagged", "running", "queued"].includes(status) ? "warning" : "neutral"}>{label ?? (status === "in_progress" ? <><i className="live-dot" />Live</> : status.replaceAll("_", " "))}</Badge>; }
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
export const gameTime = (instant: string | null, timezone: string) => instant ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(instant)) : "Unscheduled";
export const gameDateTime = (instant: string | null, timezone: string) => instant ? `${new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "2-digit", day: "2-digit" }).format(new Date(instant))} ${gameTime(instant, timezone)}` : "Unscheduled";
export const dateLabel = (date: string, short = false) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: short ? "short" : "long", day: "numeric", weekday: short ? undefined : "short" }).format(new Date(`${date}T12:00:00Z`));
export const teamName = (tournament: CompetitionView, id: string | null) => tournament.registrations.find((team) => team.id === id)?.teamName ?? "To be determined";
export const playAreaLabel = (sport: string) => ["basketball", "volleyball", "pickleball"].includes(sport) ? "Court" : "Field";
export const hasBracketStage = (format: string) => ["pool_to_bracket", "single_elim", "double_elim"].includes(format);
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
export function TeamMark({ name, index = 0 }: { name: string; index?: number }) { return <span className={`team-mark team-${index % 4}`} aria-hidden="true">{name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Inbox size={30} /><h3>{title}</h3>{children}</div>; }
export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: ReactNode }) { return <div className="section-title"><h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>{children}</div>; }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={15} /></button>; }

const standingsColumns = [
  { label: "Played", hint: "Number of completed games in this pool" },
  { label: "Wins", hint: "Games won" },
  { label: "Draws", hint: "Games tied" },
  { label: "Losses", hint: "Games lost" },
  { label: "Scored", hint: "Total points scored across all games" },
  { label: "Allowed", hint: "Total points allowed across all games" },
  { label: "Differential", hint: "Points scored minus points allowed, capped per game" },
  { label: "Points", hint: "Competition points earned from wins, draws, and any bonus rules" },
];
export function InfoTip({ hint, children }: { hint: string; children?: ReactNode }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);

  function show() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 7 });
  }
  function hide() {
    setCoords(null);
  }

  return (
    <span className="info-tip">
      <button ref={triggerRef} type="button" className={children ? "info-trigger" : "info-icon"} aria-label={children ? undefined : hint} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children ?? <Info size={11} />}
      </button>
      {coords && createPortal(<span className="info-bubble" role="tooltip" style={{ left: coords.left, bottom: coords.bottom }}>{hint}</span>, document.body)}
    </span>
  );
}
export function StandingsHead() {
  return <tr><th>Rank</th><th>Team</th>{standingsColumns.map((column) => <th key={column.label}>{column.label}<InfoTip hint={column.hint} /></th>)}</tr>;
}

export function Modal({ title, headerAction, children, onClose, wide = false, full = false }: { title: string; headerAction?: ReactNode; children: ReactNode; onClose: () => void; wide?: boolean; full?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""} ${full ? "full" : ""}`} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><div className="modal-heading-title"><h2>{title}</h2>{headerAction}</div><button className="icon-button" aria-label="Close dialog" title="Close" onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></dialog>;
}

export function GameCard({ game, tournament, onClick }: { game: Game; tournament: CompetitionView; onClick?: () => void }) {
  const home = teamName(tournament, game.homeId);
  const away = teamName(tournament, game.awayId);
  const field = tournament.fields.find((field) => field.id === game.fieldId);
  return <button className={`game-card ${game.status === "in_progress" ? "live" : ""} ${game.needsResolution ? "flagged" : ""}`} onClick={onClick} disabled={!onClick}>
    <div className="game-meta"><span>{gameDateTime(game.start, tournament.timezone)}</span><Status status={game.status} /></div>
    <div className="game-team"><TeamMark name={home} /><span>{home}</span><strong>{game.homeScore ?? "-"}</strong></div>
    <div className="game-team"><TeamMark name={away} index={2} /><span>{away}</span><strong>{game.awayScore ?? "-"}</strong></div>
    <div className="game-footer"><span>{field ? <><MapPin size={10} />{field.venue} · {field.name}</> : "Unassigned"}</span></div>
  </button>;
}