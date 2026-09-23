"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, Inbox } from "lucide-react";
import type { Game } from "@season/types";

type CompetitionView = { timezone: string; registrations: { id: string; teamName: string }[]; divisions: { id: string; name: string }[] };

export function Brand() { return <span className="brand"><img src="/images/season-logo.png" alt="Season" /></span>; }
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Status({ status }: { status: string }) { return <Badge tone={["final", "accepted", "approved", "checked_in", "paid", "succeeded"].includes(status) ? "success" : ["in_progress", "scheduled", "registration_open"].includes(status) ? "accent" : ["pending", "submitted", "waitlisted", "unpaid", "postponed", "flagged", "running", "queued"].includes(status) ? "warning" : "neutral"}>{status === "in_progress" ? <><i className="live-dot" />Live</> : status.replaceAll("_", " ")}</Badge>; }
export const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
export const gameTime = (instant: string | null, timezone: string) => instant ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(instant)) : "Unscheduled";
export const dateLabel = (date: string, short = false) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: short ? "short" : "long", day: "numeric", weekday: short ? undefined : "short" }).format(new Date(`${date}T12:00:00Z`));
export const teamName = (tournament: CompetitionView, id: string | null) => tournament.registrations.find((team) => team.id === id)?.teamName ?? "To be determined";
export const playAreaLabel = (sport: string) => ["basketball", "volleyball", "pickleball"].includes(sport) ? "Court" : "Field";
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
export function TeamMark({ name, index = 0 }: { name: string; index?: number }) { return <span className={`team-mark team-${index % 4}`} aria-hidden="true">{name.split(" ").slice(0, 2).map((word) => word[0]).join("")}</span>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Inbox size={30} /><h3>{title}</h3>{children}</div>; }
export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: ReactNode }) { return <div className="section-title"><h2>{title}{count !== undefined && <span className="count">{count}</span>}</h2>{children}</div>; }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={15} /></button>; }

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "wide" : ""}`} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" title="Close" onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></dialog>;
}

export function GameCard({ game, tournament, onClick }: { game: Game; tournament: CompetitionView; onClick?: () => void }) {
  const home = teamName(tournament, game.homeId);
  const away = teamName(tournament, game.awayId);
  return <button className={`game-card ${game.status === "in_progress" ? "live" : ""} ${game.needsResolution ? "flagged" : ""}`} onClick={onClick} disabled={!onClick}>
    <div className="game-meta"><span>{gameTime(game.start, tournament.timezone)}</span><Status status={game.status} /></div>
    <div className="game-team"><TeamMark name={home} /><span>{home}</span><strong>{game.homeScore ?? "-"}</strong></div>
    <div className="game-team"><TeamMark name={away} index={2} /><span>{away}</span><strong>{game.awayScore ?? "-"}</strong></div>
    <div className="game-footer"><span>{tournament.divisions.find((division) => division.id === game.divisionId)?.name}</span><span>{game.needsResolution ? "Needs resolution" : game.label}</span></div>
  </button>;
}