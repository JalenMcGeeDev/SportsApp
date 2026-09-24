"use client";

import { useState } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Dice5, Info, LoaderCircle, Plus, Save, ShieldCheck, Trash2, Trophy, X } from "lucide-react";
import { estimateCapacity, type CapacityResult } from "@season/core";
import { ApiError } from "@season/api-client";
import type { Command, Tournament, Workspace } from "@season/types";
import { Modal, playAreaLabel } from "./shared";

const sports = ["soccer", "basketball", "baseball", "softball", "volleyball", "flag_football", "pickleball"];
const formats = ["pool_to_bracket", "round_robin", "pool_only", "single_elim", "double_elim"];
const formatDescriptions: Record<string, string> = {
  pool_to_bracket: "Teams play a round-robin within pools, then the top finishers advance to a single-elimination bracket.",
  round_robin: "Every team plays every other team once. The best overall record wins \u2014 no bracket.",
  pool_only: "Teams play pool games only. Final standings decide placement; there is no elimination bracket.",
  single_elim: "Single-elimination bracket. Lose once and a team is out.",
  double_elim: "Double-elimination bracket. A team gets a second chance in a losers bracket before elimination.",
};
function formatLabel(format: string) { return format.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); }
const steps = ["Details", "Venues", "Rules & Divisions", "Review"];

type PlayAreaDraft = { name: string };
type VenueDraft = { name: string; address: string; playAreas: PlayAreaDraft[] };
type DivisionDraft = {
  name: string; format: string; maxTeams: number; guaranteedGames: number; advancePerPool: number; entryFeeCents: number;
  earliestTime: string; latestTime: string; earliestBirthdate: string; latestBirthdate: string; rosterMin: number; rosterMax: number;
};
type Details = { name: string; sport: string; startsOn: string; endsOn: string; timezone: string; description: string };
type RulesDraft = { gameMinutes: number; bufferMinutes: number; restMinutes: number; maxGamesPerDay: number };
type Props = { workspace: Workspace; busy: boolean; execute: (command: Command, base?: Workspace | null) => Promise<Workspace | undefined>; onClose: () => void; onCreated: (tournament: Tournament, message: string) => void };

function defaultVenue(sport: string): VenueDraft { return { name: "", address: "", playAreas: [{ name: `${playAreaLabel(sport)} 1` }] }; }
// Derived from the browser so the wizard doesn't need to ask the organizer to pick one.
function detectTimezone(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } }
function defaultDetails(): Details { return { name: "", sport: "soccer", startsOn: "2026-10-10", endsOn: "2026-10-11", timezone: detectTimezone(), description: "" }; }
function defaultRules(): RulesDraft { return { gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 4 }; }
// Venues are the source of truth for where a tournament happens, so the wizard derives a display location from them instead of asking for one directly.
function deriveLocation(venues: VenueDraft[]): string { return [...new Set(venues.map((venue) => venue.address.trim()).filter(Boolean))].join(" \u2022 ").slice(0, 100); }
function defaultDivision(): DivisionDraft {
  return { name: "", format: "pool_to_bracket", maxTeams: 16, guaranteedGames: 3, advancePerPool: 2, entryFeeCents: 45000, earliestTime: "08:00", latestTime: "18:00", earliestBirthdate: "2014-01-01", latestBirthdate: "2015-12-31", rosterMin: 7, rosterMax: 18 };
}

export function TournamentWizard({ workspace, busy, execute, onClose, onCreated }: Props) {
  const stripeConnected = workspace.organization.stripeOnboardingComplete;
  const [step, setStep] = useState(0);
  const [copyFromId, setCopyFromId] = useState("");
  const [details, setDetails] = useState<Details>(defaultDetails());
  const [rules, setRules] = useState<RulesDraft>(defaultRules());
  const [venues, setVenues] = useState<VenueDraft[]>([defaultVenue("soccer")]);
  const [divisions, setDivisions] = useState<DivisionDraft[]>([defaultDivision()]);
  const [stepError, setStepError] = useState("");
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<CapacityResult | null>(null);
  const [checkingCapacity, setCheckingCapacity] = useState<"draft" | "publish" | null>(null);

  function updateDetail<K extends keyof Details>(key: K, value: Details[K]) { setDetails((current) => ({ ...current, [key]: value })); }
  function updateRule<K extends keyof RulesDraft>(key: K, value: RulesDraft[K]) { setRules((current) => ({ ...current, [key]: value })); }
  function goFix(targetStep: number) { setStep(targetStep); setCapacity(null); }

  function updateSport(sport: string) {
    const previousLabel = playAreaLabel(details.sport);
    const nextLabel = playAreaLabel(sport);
    if (previousLabel !== nextLabel) setVenues((current) => current.map((venue) => ({ ...venue, playAreas: venue.playAreas.map((area, index) => area.name === `${previousLabel} ${index + 1}` ? { name: `${nextLabel} ${index + 1}` } : area) })));
    updateDetail("sport", sport);
  }

  function runCapacityCheck() {
    return estimateCapacity({
      sport: details.sport, startsOn: details.startsOn, endsOn: details.endsOn, timezone: details.timezone, venues, rules,
      divisions: divisions.map((division) => ({ name: division.name, format: division.format, maxTeams: division.maxTeams, guaranteedGames: division.guaranteedGames, advancePerPool: division.advancePerPool, earliestTime: division.earliestTime, latestTime: division.latestTime })),
    });
  }

  function copyFrom(tournamentId: string) {
    setCopyFromId(tournamentId);
    if (!tournamentId) return;
    const source = workspace.tournaments.find((item) => item.id === tournamentId);
    if (!source) return;
    setDetails({ name: `${source.name} (copy)`, sport: source.sport, startsOn: source.startsOn, endsOn: source.endsOn, timezone: source.timezone, description: source.description });
    setRules({ gameMinutes: source.rules.gameMinutes, bufferMinutes: source.rules.bufferMinutes, restMinutes: source.rules.restMinutes, maxGamesPerDay: source.rules.maxGamesPerDay });
    const groups = new Map<string, VenueDraft>();
    for (const field of source.fields) {
      const key = `${field.venue}|${field.address}`;
      const group = groups.get(key) ?? { name: field.venue, address: field.address, playAreas: [] };
      group.playAreas.push({ name: field.name });
      groups.set(key, group);
    }
    setVenues(groups.size ? [...groups.values()] : [defaultVenue(source.sport)]);
    setDivisions(source.divisions.length ? source.divisions.map((division) => ({ name: division.name, format: division.format, maxTeams: division.maxTeams, guaranteedGames: division.guaranteedGames, advancePerPool: division.advancePerPool, entryFeeCents: division.entryFeeCents, earliestTime: division.earliestTime, latestTime: division.latestTime, earliestBirthdate: division.eligibility.earliestBirthdate, latestBirthdate: division.eligibility.latestBirthdate, rosterMin: division.eligibility.rosterMin, rosterMax: division.eligibility.rosterMax })) : [defaultDivision()]);
    setStepError("");
  }

  function updateVenue(index: number, patch: Partial<Pick<VenueDraft, "name" | "address">>) { setVenues((current) => current.map((venue, position) => position === index ? { ...venue, ...patch } : venue)); }
  function addVenue() { setVenues((current) => [...current, defaultVenue(details.sport)]); }
  function removeVenue(index: number) { setVenues((current) => current.filter((_, position) => position !== index)); }
  function updatePlayArea(venueIndex: number, areaIndex: number, name: string) { setVenues((current) => current.map((venue, position) => position === venueIndex ? { ...venue, playAreas: venue.playAreas.map((area, position) => position === areaIndex ? { name } : area) } : venue)); }
  function addPlayArea(venueIndex: number) { setVenues((current) => current.map((venue, position) => position === venueIndex ? { ...venue, playAreas: [...venue.playAreas, { name: `${playAreaLabel(details.sport)} ${venue.playAreas.length + 1}` }] } : venue)); }
  function removePlayArea(venueIndex: number, areaIndex: number) { setVenues((current) => current.map((venue, position) => position === venueIndex ? { ...venue, playAreas: venue.playAreas.filter((_, position) => position !== areaIndex) } : venue)); }

  function updateDivision<K extends keyof DivisionDraft>(index: number, key: K, value: DivisionDraft[K]) { setDivisions((current) => current.map((division, position) => position === index ? { ...division, [key]: value } : division)); }
  function addDivision() { setDivisions((current) => [...current, defaultDivision()]); }
  function removeDivision(index: number) { setDivisions((current) => current.filter((_, position) => position !== index)); }

  function validateStep(): boolean {
    setStepError("");
    if (step === 0) {
      if (details.name.trim().length < 3) { setStepError("Tournament name must be at least 3 characters."); return false; }
      if (details.endsOn < details.startsOn) { setStepError("End date must not precede the start date."); return false; }
      return true;
    }
    if (step === 1) {
      if (!venues.length) { setStepError("Add at least one venue."); return false; }
      for (const venue of venues) {
        if (venue.name.trim().length < 2 || venue.address.trim().length < 2) { setStepError("Every venue needs a name and address."); return false; }
        if (!venue.playAreas.length || venue.playAreas.some((area) => area.name.trim().length < 2)) { setStepError(`Every venue needs at least one named ${playAreaLabel(details.sport).toLowerCase()}.`); return false; }
      }
      return true;
    }
    if (step === 2) {
      if (!divisions.length) { setStepError("Add at least one division."); return false; }
      for (const division of divisions) {
        if (division.name.trim().length < 2) { setStepError("Every division needs a name."); return false; }
        if (division.earliestTime >= division.latestTime) { setStepError("Each division's earliest game time must be before its latest finish time."); return false; }
        if (division.earliestBirthdate >= division.latestBirthdate) { setStepError("Each division's earliest eligible birthdate must be before its latest eligible birthdate."); return false; }
        if (division.rosterMin > division.rosterMax) { setStepError("Each division's minimum players must not exceed its maximum players."); return false; }
      }
      return true;
    }
    return true;
  }

  function next() { if (validateStep()) { setCapacity(null); setStep((current) => Math.min(current + 1, steps.length - 1)); } }
  function back() { setStepError(""); setCapacity(null); setStep((current) => Math.max(current - 1, 0)); }

  // Demo only: fills every step with realistic sample data and jumps straight to the review screen.
  function fillDemo() {
    const sport = "soccer";
    setCopyFromId("");
    setDetails({ name: "Fall Classic Invitational", sport, startsOn: "2026-11-14", endsOn: "2026-11-16", timezone: detectTimezone(), description: "A weekend club tournament for U10-U14 teams featuring pool play followed by single-elimination brackets." });
    setRules({ gameMinutes: 40, bufferMinutes: 10, restMinutes: 30, maxGamesPerDay: 3 });
    setVenues([
      { name: "Zilker Sports Complex", address: "2100 Barton Springs Rd, Austin, TX", playAreas: [{ name: `${playAreaLabel(sport)} 1` }, { name: `${playAreaLabel(sport)} 2` }] },
      { name: "Round Rock Multipurpose Complex", address: "3300 E Palm Valley Blvd, Round Rock, TX", playAreas: [{ name: `${playAreaLabel(sport)} 1` }] },
    ]);
    setDivisions([
      { name: "U12 Boys", format: "pool_to_bracket", maxTeams: 12, guaranteedGames: 3, advancePerPool: 2, entryFeeCents: 35000, earliestTime: "08:00", latestTime: "18:00", earliestBirthdate: "2013-01-01", latestBirthdate: "2014-12-31", rosterMin: 8, rosterMax: 16 },
      { name: "U14 Girls", format: "round_robin", maxTeams: 8, guaranteedGames: 4, advancePerPool: 2, entryFeeCents: 40000, earliestTime: "08:00", latestTime: "18:00", earliestBirthdate: "2011-01-01", latestBirthdate: "2012-12-31", rosterMin: 8, rosterMax: 16 },
    ]);
    setCapacity(null);
    setStepError("");
    setError("");
    setErrorDetails([]);
    setStep(steps.length - 1);
  }

  // publish=false leaves the new tournament in "draft" status (the default); publish=true immediately follows up with an
  // update_tournament command that opens it for registration, mirroring the overview tab's "Publish tournament" button.
  async function create(result: CapacityResult, publish: boolean) {
    if (!validateStep()) return;
    setError(""); setErrorDetails([]);
    const command: Command = {
      type: "create_tournament",
      data: {
        name: details.name, sport: details.sport as Tournament["sport"], startsOn: details.startsOn, endsOn: details.endsOn,
        timezone: details.timezone, location: deriveLocation(venues), description: details.description,
        rules,
        venues: venues.map((venue) => ({ name: venue.name, address: venue.address, playAreas: venue.playAreas.map((area) => ({ name: area.name })) })),
        divisions: divisions.map((division) => ({
          name: division.name, format: division.format as Tournament["divisions"][number]["format"], maxTeams: division.maxTeams,
          guaranteedGames: division.guaranteedGames, advancePerPool: division.advancePerPool, entryFeeCents: division.entryFeeCents,
          earliestTime: division.earliestTime, latestTime: division.latestTime,
          eligibility: { earliestBirthdate: division.earliestBirthdate, latestBirthdate: division.latestBirthdate, rosterMin: division.rosterMin, rosterMax: division.rosterMax, requiredDocuments: ["age_verification"], waiverVersion: 1 },
        })),
      },
    };
    try {
      const updated = await execute(command);
      if (!updated) return;
      const created = updated.tournaments.at(-1)!;
      if (!publish) {
        onCreated(created, result.feasible ? "Checks passed \u2014 tournament saved as a draft." : "Tournament saved as a draft \u2014 some capacity checks did not pass.");
        onClose();
        return;
      }
      try {
        const published = await execute({ type: "update_tournament", tournamentId: created.id, name: created.name, status: "registration_open", rules: created.rules }, updated);
        const finalTournament = published?.tournaments.find((item) => item.id === created.id) ?? created;
        onCreated(finalTournament, result.feasible ? "Checks passed \u2014 tournament published and open for registration!" : "Tournament published \u2014 some capacity checks did not pass.");
      } catch {
        onCreated(created, "Tournament saved as a draft, but publishing failed \u2014 open it and try \u201cPublish tournament\u201d again.");
      }
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create the tournament"); if (error instanceof ApiError) setErrorDetails(error.details); }
  }

  // Runs the capacity simulation before creating; feasible results create immediately, infeasible ones stop and ask the user to fix issues or proceed anyway.
  function attemptCreate(publish: boolean) {
    if (!validateStep()) return;
    if (capacity) { create(capacity, publish); return; }
    setCheckingCapacity(publish ? "publish" : "draft");
    // Deferred so the "checking…" state paints before the (synchronous) simulation runs.
    setTimeout(() => {
      const result = runCapacityCheck();
      setCapacity(result);
      setCheckingCapacity(null);
      if (result.feasible) create(result, publish);
    }, 0);
  }

  return <Modal title="Create a tournament" onClose={onClose} wide headerAction={<button type="button" className="button small" title="Demo only: fills every step with sample data and jumps to review" onClick={fillDemo}><Dice5 size={14} />Demo</button>}>
    <div className="wizard">
    <div className="wizard-steps">{steps.map((label, index) => <div key={label} className={`wizard-step ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}><span className="wizard-step-index">{index < step ? <Check size={13} /> : index + 1}</span>{label}</div>)}</div>
    {error && <div role="alert" className="form-error"><strong>{error}</strong>{errorDetails.length > 0 && <ul>{errorDetails.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}</div>}
    {stepError && <div role="alert" className="form-error"><strong>{stepError}</strong></div>}

    {step === 0 && <div className="dialog-form">
      {workspace.tournaments.length > 0 && <div className="quickstart">
        <label>Copy from an existing tournament<select value={copyFromId} onChange={(event) => copyFrom(event.target.value)}><option value="">Start from scratch</option>{workspace.tournaments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>}
      <fieldset><legend>Tournament info</legend><div className="dialog-form">
        <label>Tournament name<input value={details.name} onChange={(event) => updateDetail("name", event.target.value)} required minLength={3} maxLength={100} placeholder="e.g. Spring Invitational" autoFocus /></label>
        <label>Sport<select value={details.sport} onChange={(event) => updateSport(event.target.value)}>{sports.map((sport) => <option key={sport} value={sport}>{sport.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></label>
        <label>Description<textarea value={details.description} onChange={(event) => updateDetail("description", event.target.value)} rows={3} maxLength={3000} placeholder="Tournament details" /></label>
      </div></fieldset>
      <fieldset><legend>Schedule</legend><div className="form-grid">
        <label>Starts on<input type="date" value={details.startsOn} onChange={(event) => updateDetail("startsOn", event.target.value)} required /></label>
        <label>Ends on<input type="date" value={details.endsOn} onChange={(event) => updateDetail("endsOn", event.target.value)} required /></label>
      </div><small className="field-hint">Detected time zone: {details.timezone}. All game times will use this zone.</small></fieldset>
    </div>}

    {step === 1 && <div className="dialog-form">
      <div className="venue-list">{venues.map((venue, index) => <div className="venue-card" key={index}>
        <div className="venue-card-header">
          <span className="venue-card-index"><Building2 size={14} />Venue {index + 1}</span>
          {venues.length > 1 && <button type="button" className="icon-button danger-text" aria-label={`Remove venue ${index + 1}`} onClick={() => removeVenue(index)}><Trash2 size={15} /></button>}
        </div>
        <div className="form-grid">
          <label>Venue name<input value={venue.name} onChange={(event) => updateVenue(index, { name: event.target.value })} minLength={2} maxLength={100} required placeholder="Zilker Sports Complex" /></label>
          <label>Venue address<input value={venue.address} onChange={(event) => updateVenue(index, { address: event.target.value })} minLength={2} maxLength={200} required placeholder="2100 Barton Springs Rd, Austin, TX" /></label>
        </div>
        <div className="play-area-field">
          <span className="play-area-label">{playAreaLabel(details.sport)}s</span>
          <div className="play-area-chips">
            {venue.playAreas.map((area, areaIndex) => <div className="play-area-chip" key={areaIndex}>
              <input aria-label={`${playAreaLabel(details.sport)} name ${areaIndex + 1}`} value={area.name} onChange={(event) => updatePlayArea(index, areaIndex, event.target.value)} minLength={2} maxLength={80} required placeholder={`${playAreaLabel(details.sport)} ${areaIndex + 1}`} />
              {venue.playAreas.length > 1 && <button type="button" aria-label={`Remove ${playAreaLabel(details.sport).toLowerCase()} ${areaIndex + 1}`} onClick={() => removePlayArea(index, areaIndex)}><X size={12} /></button>}
            </div>)}
            <button type="button" className="play-area-add" onClick={() => addPlayArea(index)}><Plus size={13} />Add {playAreaLabel(details.sport).toLowerCase()}</button>
          </div>
        </div>
      </div>)}</div>
      <button type="button" className="button add-venue-button" onClick={addVenue}><Plus size={15} />Add another venue</button>
    </div>}

    {step === 2 && <div className="dialog-form">
      <div className="venue-list"><div className="venue-card">
        <div className="venue-card-header"><span className="venue-card-index"><ShieldCheck size={14} />Competition rules</span></div>
        <div className="form-grid">
        <div className="field"><label>Game duration (minutes)<input type="number" min={5} max={240} value={rules.gameMinutes} onChange={(event) => updateRule("gameMinutes", Number(event.target.value))} required /></label></div>
        <div className="field">
          <label>Minimum {playAreaLabel(details.sport).toLowerCase()} buffer (minutes)<input type="number" min={0} max={120} value={rules.bufferMinutes} onChange={(event) => updateRule("bufferMinutes", Number(event.target.value))} required /></label>
          <small className="field-hint">The shortest gap left between two games on the same {playAreaLabel(details.sport).toLowerCase()}.</small>
        </div>
        <div className="field">
          <label>Minimum team rest (minutes)<input type="number" min={0} max={360} value={rules.restMinutes} onChange={(event) => updateRule("restMinutes", Number(event.target.value))} required /></label>
          <small className="field-hint">The shortest gap left between two games for the same team.</small>
        </div>
        <div className="field">
          <label>Maximum games per team per day<input type="number" min={1} max={12} value={rules.maxGamesPerDay} onChange={(event) => updateRule("maxGamesPerDay", Number(event.target.value))} required /></label>
          <small className="field-hint">No team will be scheduled for more games than this on the same day.</small>
        </div>
        </div>
        <small className="field-hint">These lock once games are generated — you can still change them later from Settings until then.</small>
      </div></div>
      <div className="venue-list">{divisions.map((division, index) => <div className="venue-card" key={index}>
        <div className="venue-card-header">
          <span className="venue-card-index"><Trophy size={14} />Division {index + 1}</span>
          {divisions.length > 1 && <button type="button" className="icon-button danger-text" aria-label={`Remove division ${index + 1}`} onClick={() => removeDivision(index)}><Trash2 size={15} /></button>}
        </div>
        <label>Division name<input value={division.name} onChange={(event) => updateDivision(index, "name", event.target.value)} minLength={2} maxLength={80} required placeholder="U12 Boys Elite" /></label>
        <div className="form-grid">
          <div className="field">
            <label>
              <span className="field-label-row">Format<a className="field-info-link" href={`/docs#${division.format}`} target="_blank" rel="noopener noreferrer"><Info size={12} />"More info"</a></span>
              <select value={division.format} onChange={(event) => updateDivision(index, "format", event.target.value)}>{formats.map((format) => <option key={format} value={format}>{formatLabel(format)}</option>)}</select>
            </label>
            <small className="field-hint">{formatDescriptions[division.format]}</small>
          </div>
          <div className="field">
            <label>Maximum teams<input type="number" min={2} max={1024} value={division.maxTeams} onChange={(event) => updateDivision(index, "maxTeams", Number(event.target.value))} required /></label>
            <small className="field-hint">The most teams this division will accept before waitlisting.</small>
          </div>
          <div className="field">
            <label>Guaranteed games<input type="number" min={1} max={12} value={division.guaranteedGames} onChange={(event) => updateDivision(index, "guaranteedGames", Number(event.target.value))} required /></label>
            <small className="field-hint">Every registered team is guaranteed at least this many games.</small>
          </div>
          {division.format === "pool_to_bracket" && <div className="field">
            <label>Advance per pool<input type="number" min={1} max={8} value={division.advancePerPool} onChange={(event) => updateDivision(index, "advancePerPool", Number(event.target.value))} required /></label>
            <small className="field-hint">Teams per pool that move on to the bracket stage.</small>
          </div>}
          <div className="field">
            <label>Entry fee ($)<input type="number" min={0} max={100000} step={0.01} value={division.entryFeeCents / 100} onChange={(event) => updateDivision(index, "entryFeeCents", Math.round(Number(event.target.value) * 100))} required /></label>
            <small className="field-hint">Registration fee per team. No payment is collected yet.</small>
          </div>
          {division.format === "pool_to_bracket" && <div />}
          <div className="field">
            <label>Earliest game time<input type="time" value={division.earliestTime} onChange={(event) => updateDivision(index, "earliestTime", event.target.value)} required /></label>
            <small className="field-hint">No games in this division are scheduled before this time.</small>
          </div>
          <div className="field">
            <label>Latest finish time<input type="time" value={division.latestTime} onChange={(event) => updateDivision(index, "latestTime", event.target.value)} required /></label>
            <small className="field-hint">No games in this division are scheduled to finish after this time.</small>
          </div>
          {/* eligibility by birthdate not implemented yet; fields kept with defaults, just hidden */}
          <div className="field" hidden>
            <label>Earliest eligible birthdate<input type="date" value={division.earliestBirthdate} onChange={(event) => updateDivision(index, "earliestBirthdate", event.target.value)} /></label>
            <small className="field-hint">Players born before this date are not eligible.</small>
          </div>
          <div className="field" hidden>
            <label>Latest eligible birthdate<input type="date" value={division.latestBirthdate} onChange={(event) => updateDivision(index, "latestBirthdate", event.target.value)} /></label>
            <small className="field-hint">Players born after this date are not eligible.</small>
          </div>
          <div className="field">
            <label>Minimum players<input type="number" min={1} max={100} value={division.rosterMin} onChange={(event) => updateDivision(index, "rosterMin", Number(event.target.value))} required /></label>
            <small className="field-hint">Teams need at least this many rostered players to be eligible.</small>
          </div>
          <div className="field">
            <label>Maximum players<input type="number" min={1} max={100} value={division.rosterMax} onChange={(event) => updateDivision(index, "rosterMax", Number(event.target.value))} required /></label>
            <small className="field-hint">The most players a team roster may carry.</small>
          </div>
        </div>
      </div>)}</div>
      <button type="button" className="button add-venue-button" onClick={addDivision}><Plus size={15} />Add another division</button>
    </div>}

    {step === 3 && <div className="dialog-form">
      <div className="wizard-review">
        <div><dt>Tournament</dt><dd>{details.name || "Untitled tournament"}</dd></div>
        <div><dt>Sport</dt><dd className="capitalize">{details.sport.replaceAll("_", " ")}</dd></div>
        <div><dt>Dates</dt><dd>{details.startsOn} - {details.endsOn} ({details.timezone})</dd></div>
        <div><dt>Venues</dt><dd>{venues.map((venue) => venue.name || "Unnamed venue").join(", ")}</dd></div>
        <div><dt>Divisions</dt><dd>{divisions.map((division) => division.name || "Unnamed division").join(", ")}</dd></div>
      </div>
      {!stripeConnected && <div className="form-note"><Info size={15} />Connect and finish onboarding your Stripe account before publishing — you can still save this as a draft.</div>}
      <div className="capacity-check">
        {capacity && !capacity.feasible && <div className="eligibility-banner warning"><ShieldCheck size={21} /><div>
              <strong>{capacity.setupErrors.length + capacity.issues.length} capacity issue{capacity.setupErrors.length + capacity.issues.length === 1 ? "" : "s"} found</strong>
              <ul>
                {capacity.setupErrors.map((setupError) => <li key={`setup-${setupError.divisionIndex}`}>
                  {setupError.message}
                  {" "}<button type="button" className="link-button" onClick={() => goFix(2)}>Fix in Rules & Divisions</button>
                </li>)}
                {capacity.issues.map((issue) => <li key={issue.divisionName}>
                  {issue.divisionName}: if this division fills to its {issue.maxTeams}-team maximum, your current {playAreaLabel(details.sport).toLowerCase()}s/schedule can only fit {issue.totalGames - issue.unplacedCount} of the {issue.totalGames} games that would require. Add more {playAreaLabel(details.sport).toLowerCase()} time or lower the max teams before opening registration.
                  {" "}<button type="button" className="link-button" onClick={() => goFix(2)}>Fix in Rules & Divisions</button>
                </li>)}
              </ul>
            </div></div>}
      </div>
    </div>}

    <div className="modal-actions wizard-actions">
      <button type="button" className="button" onClick={step === 0 ? onClose : back}>{step === 0 ? "Cancel" : <><ChevronLeft size={15} />Back</>}</button>
      {step < steps.length - 1
        ? <button type="button" className="button primary" onClick={next}><ChevronRight size={16} />Continue</button>
        : capacity && !capacity.feasible
          ? <>
              <button type="button" className="button" disabled={busy} onClick={() => create(capacity, false)}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}Save as draft anyway</button>
              <button type="button" className="button primary" disabled={busy || !stripeConnected} title={stripeConnected ? undefined : "Connect Stripe before publishing"} onClick={() => create(capacity, true)}>{busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}Publish anyway</button>
            </>
          : <>
              <button type="button" className="button" disabled={busy || !!checkingCapacity} onClick={() => attemptCreate(false)}>{checkingCapacity === "draft" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{checkingCapacity === "draft" ? "Checking capacity\u2026" : "Save as draft"}</button>
              <button type="button" className="button primary" disabled={busy || !!checkingCapacity || !stripeConnected} title={stripeConnected ? undefined : "Connect Stripe before publishing"} onClick={() => attemptCreate(true)}>{checkingCapacity === "publish" ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}{checkingCapacity === "publish" ? "Checking capacity\u2026" : "Publish tournament"}</button>
            </>}
    </div>
    </div>
  </Modal>;
}
