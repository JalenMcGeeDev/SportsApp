import type { Metadata } from "next";
import { Brand } from "@/components/shared";

export const metadata: Metadata = { title: "Docs | Season" };

const formats: { id: string; label: string; summary: string; details: string[] }[] = [
  {
    id: "pool_to_bracket",
    label: "Pool to Bracket",
    summary: "Teams play a round-robin within pools, then the top finishers advance to a single-elimination bracket.",
    details: [
      "Teams are split into pools (groups) of similar size.",
      "Every team plays every other team in its pool once.",
      "The top finishers from each pool (set by \u201cAdvance per pool\u201d) move on to a single-elimination bracket.",
      "Once bracket play starts, pool record no longer matters \u2014 lose in the bracket and you're out.",
    ],
  },
  {
    id: "round_robin",
    label: "Round Robin",
    summary: "Every team plays every other team once. The best overall record wins \u2014 no bracket.",
    details: [
      "There are no pools or brackets \u2014 every team plays every other team exactly once.",
      "Standings are ranked by record (and tiebreakers) across all games.",
      "The team with the best overall record at the end is the champion.",
      "Good for smaller divisions where every matchup matters.",
    ],
  },
  {
    id: "pool_only",
    label: "Pool Only",
    summary: "Teams play pool games only. Final standings decide placement; there is no elimination bracket.",
    details: [
      "Teams are split into pools, just like Pool to Bracket.",
      "Each team plays every other team in its pool once.",
      "There is no bracket stage \u2014 final pool standings decide placement.",
      "Good for festival-style events focused on guaranteed games over knockout stakes.",
    ],
  },
  {
    id: "single_elim",
    label: "Single Elim",
    summary: "Single-elimination bracket. Lose once and a team is out.",
    details: [
      "Teams are seeded directly into a single-elimination bracket \u2014 no pool stage.",
      "Every matchup is win-or-go-home.",
      "The bracket narrows each round until one team remains.",
      "Fastest way to crown a champion, but teams get fewer guaranteed games.",
    ],
  },
  {
    id: "double_elim",
    label: "Double Elim",
    summary: "Double-elimination bracket. A team gets a second chance in a losers bracket before elimination.",
    details: [
      "Teams start in the winners bracket, seeded like a single-elimination bracket.",
      "A team's first loss drops it into the losers bracket instead of eliminating it.",
      "A second loss (in either bracket) eliminates the team.",
      "The winners-bracket champion and the losers-bracket champion meet in a final match.",
    ],
  },
];

const points: { id: string; label: string; summary: string; details: string[] }[] = [
  {
    id: "match-points",
    label: "Match points",
    summary: "Every completed game adds points to both teams' totals based on the result.",
    details: [
      "A win awards the tournament's configured win points (3 by default).",
      "A draw awards the configured draw points (1 by default).",
      "A loss awards the configured loss points (0 by default).",
      "These totals accumulate across every completed pool or round-robin game to produce each team's \u201ccompetition points\u201d \u2014 the number shown in the Points column.",
      "The same win/draw/loss math is used for every sport Season supports. Not every sport allows a tied final score \u2014 basketball, baseball, softball, volleyball, and pickleball games are usually decided outright \u2014 so the draw line simply won't show up for those unless a game actually ends level.",
    ],
  },
  {
    id: "forfeits",
    label: "Forfeits",
    summary: "A forfeited game still counts, but the winning team earns forfeit points instead of standard win points.",
    details: [
      "If a team can't field a legal roster or fails to show, the game is recorded as a forfeit rather than a played result.",
      "The winning team earns the tournament's forfeit points \u2014 a separate value from win points, since directors sometimes want forfeits worth less (or the same).",
      "Forfeited games never earn a shutout bonus, even if the score reads as a shutout.",
    ],
  },
  {
    id: "shutout-bonus",
    label: "Shutout bonus",
    summary: "Teams that win without allowing a single point can earn an extra bonus point.",
    details: [
      "If a team wins and its opponent scores zero, it earns the tournament's shutout bonus on top of its win points.",
      "The shutout bonus only applies to games decided on the field \u2014 not forfeits.",
      "Many tournaments leave this at 0 (no bonus); directors can turn it on to reward strong defense.",
    ],
  },
  {
    id: "differential",
    label: "Point differential",
    summary: "The margin of victory in each game, capped so no single blowout skews the standings.",
    details: [
      "Differential is the scored-minus-allowed margin for each game, added up across every completed game.",
      "A configurable \u201cdifferential cap\u201d limits how much any one game can swing a team's differential \u2014 for example, a 30-point win only counts as +5 if the cap is 5.",
      "Differential does not add to competition points \u2014 it's only used as a tiebreaker.",
    ],
  },
  {
    id: "tiebreakers",
    label: "Tiebreakers",
    summary: "When teams finish with the same competition points, an ordered list of tiebreakers decides the order.",
    details: [
      "Head-to-head record \u2014 compares results only among the tied teams.",
      "Head-to-head differential \u2014 compares capped point differential only among the tied teams.",
      "Point differential \u2014 total capped differential across all games.",
      "Fewest points allowed / most points scored \u2014 compares totals across all games.",
      "Fewest disciplinary points \u2014 rewards cleaner play.",
      "Coin flip \u2014 a seeded, reproducible random draw used only as a last resort.",
      "Manual \u2014 the tournament director resolves the tie by hand.",
      "Each tournament picks its own ordered list of these criteria. They're applied one at a time \u2014 as soon as one separates a group of tied teams, the rest move on, and later criteria only apply to teams still tied.",
    ],
  },
  {
    id: "why-this-rank",
    label: "\u201cWhy this rank?\u201d",
    summary: "Every standings table shows its work \u2014 no more guessing how a team landed where it did.",
    details: [
      "Expand \u201cWhy this rank?\u201d under any team's row to see the exact tiebreakers that applied to it, in the order they were checked.",
      "Hover (or focus) the points line in that list to see the win/draw/loss/forfeit/shutout math behind the total.",
    ],
  },
];

const groups = [
  { id: "formats", label: "Tournament formats", items: formats },
  { id: "points", label: "How points work", items: points },
];

export default function DocsPage() {
  return (
    <main className="public-shell docs-page">
      <header className="public-header"><Brand /></header>
      <h1 style={{ marginTop: 30 }}>Docs</h1>
      <p className="docs-intro">Everything about how tournament formats and standings work, in one place.</p>
      <div className="docs-shell">
        <nav className="docs-nav" aria-label="Docs sections">
          {groups.map((group) => (
            <div className="docs-nav-group" key={group.id}>
              <a className="docs-nav-heading" href={`#${group.id}`}>{group.label}</a>
              <ul>
                {group.items.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}
              </ul>
            </div>
          ))}
        </nav>
        <div className="docs-content">
          <section className="docs-format-list">
            <h2 id="formats" className="docs-group-title">Tournament formats</h2>
            {formats.map((format) => (
              <section className="venue-card docs-format-card" id={format.id} key={format.id}>
                <h3>{format.label}</h3>
                <div className="docs-format-body">
                  <ul>
                    <li><strong>{format.summary}</strong></li>
                    {format.details.map((detail, index) => <li key={index}>{detail}</li>)}
                  </ul>
                  <FormatDiagram id={format.id} />
                </div>
              </section>
            ))}
          </section>
          <section className="docs-format-list">
            <h2 id="points" className="docs-group-title">How points work</h2>
            <p className="docs-intro">The points and tiebreaker engine only deals in scored/conceded numbers and game results \u2014 it works identically for every supported sport (soccer, basketball, baseball, softball, volleyball, flag football, and pickleball). No sport gets special-cased math.</p>
            {points.map((section) => (
              <section className="venue-card docs-format-card" id={section.id} key={section.id}>
                <h3>{section.label}</h3>
                <ul>
                  <li><strong>{section.summary}</strong></li>
                  {section.details.map((detail, index) => <li key={index}>{detail}</li>)}
                </ul>
              </section>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}

function FormatDiagram({ id }: { id: string }) {
  if (id === "pool_to_bracket") return <PoolToBracketDiagram />;
  if (id === "round_robin") return <RoundRobinDiagram />;
  if (id === "pool_only") return <PoolOnlyDiagram />;
  if (id === "single_elim") return <SingleElimDiagram />;
  return <DoubleElimDiagram />;
}

function PoolToBracketDiagram() {
  return (
    <svg className="format-diagram" viewBox="0 0 260 150" role="img" aria-label="Diagram of the pool to bracket format">
      <rect x="8" y="10" width="100" height="55" rx="8" />
      <text x="58" y="24" textAnchor="middle">POOL A</text>
      {[[30, 42], [58, 34], [86, 42]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="6" />)}
      <line x1="30" y1="42" x2="58" y2="34" /><line x1="58" y1="34" x2="86" y2="42" /><line x1="30" y1="42" x2="86" y2="42" />
      <rect x="8" y="85" width="100" height="55" rx="8" />
      <text x="58" y="99" textAnchor="middle">POOL B</text>
      {[[30, 117], [58, 109], [86, 117]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="6" />)}
      <line x1="30" y1="117" x2="58" y2="109" /><line x1="58" y1="109" x2="86" y2="117" /><line x1="30" y1="117" x2="86" y2="117" />
      <line className="accent-line" x1="108" y1="34" x2="150" y2="60" />
      <line className="accent-line" x1="108" y1="109" x2="150" y2="83" />
      <line className="accent-line" x1="150" y1="60" x2="150" y2="83" />
      <line className="accent-line" x1="150" y1="71" x2="200" y2="71" />
      <circle className="accent-node" cx="220" cy="71" r="14" />
      <text x="220" y="74" textAnchor="middle">WIN</text>
    </svg>
  );
}

function RoundRobinDiagram() {
  const points = [0, 1, 2, 3, 4].map((index) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return { x: 130 + Math.cos(angle) * 55, y: 75 + Math.sin(angle) * 55 };
  });
  const pairs = points.flatMap((point, index) => points.slice(index + 1).map((other) => [point, other] as const));
  return (
    <svg className="format-diagram" viewBox="0 0 260 150" role="img" aria-label="Diagram of the round robin format">
      {pairs.map(([a, b], index) => <line key={index} className="muted-line" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)}
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="9" />)}
    </svg>
  );
}

function PoolOnlyDiagram() {
  return (
    <svg className="format-diagram" viewBox="0 0 260 150" role="img" aria-label="Diagram of the pool only format">
      <rect x="8" y="10" width="100" height="55" rx="8" />
      <text x="58" y="24" textAnchor="middle">POOL A</text>
      {[[30, 42], [58, 34], [86, 42]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="6" />)}
      <line x1="30" y1="42" x2="58" y2="34" /><line x1="58" y1="34" x2="86" y2="42" /><line x1="30" y1="42" x2="86" y2="42" />
      <rect x="8" y="85" width="100" height="55" rx="8" />
      <text x="58" y="99" textAnchor="middle">POOL B</text>
      {[[30, 117], [58, 109], [86, 117]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="6" />)}
      <line x1="30" y1="117" x2="58" y2="109" /><line x1="58" y1="109" x2="86" y2="117" /><line x1="30" y1="117" x2="86" y2="117" />
      <line className="muted-line" x1="108" y1="45" x2="160" y2="60" />
      <line className="muted-line" x1="108" y1="105" x2="160" y2="90" />
      <rect className="accent-node" x="160" y="45" width="90" height="60" rx="6" />
      {[57, 71, 85, 99].map((y, index) => <line key={index} x1="170" y1={y} x2={240 - index * 12} y2={y} />)}
      <text x="205" y="38" textAnchor="middle">FINAL STANDINGS</text>
    </svg>
  );
}

function SingleElimDiagram() {
  return (
    <svg className="format-diagram" viewBox="0 0 260 150" role="img" aria-label="Diagram of the single elimination format">
      {[20, 55, 95, 130].map((y, index) => <circle key={index} cx="20" cy={y} r="7" />)}
      <line x1="20" y1="20" x2="60" y2="37" /><line x1="20" y1="55" x2="60" y2="37" />
      <line x1="20" y1="95" x2="60" y2="112" /><line x1="20" y1="130" x2="60" y2="112" />
      <circle cx="60" cy="37" r="7" /><circle cx="60" cy="112" r="7" />
      <line x1="60" y1="37" x2="130" y2="74" /><line x1="60" y1="112" x2="130" y2="74" />
      <circle cx="130" cy="74" r="7" />
      <line className="accent-line" x1="130" y1="74" x2="200" y2="74" />
      <circle className="accent-node" cx="220" cy="74" r="14" />
      <text x="220" y="77" textAnchor="middle">WIN</text>
    </svg>
  );
}

function DoubleElimDiagram() {
  return (
    <svg className="format-diagram" viewBox="0 0 260 150" role="img" aria-label="Diagram of the double elimination format">
      <text x="4" y="14" fontWeight="600">WINNERS</text>
      {[24, 44].map((y, index) => <circle key={index} cx="16" cy={y} r="6" />)}
      <line x1="16" y1="24" x2="50" y2="34" /><line x1="16" y1="44" x2="50" y2="34" />
      <circle cx="50" cy="34" r="6" />
      <line className="accent-line" x1="50" y1="34" x2="110" y2="34" />
      <circle className="accent-node" cx="122" cy="34" r="10" />
      <line className="muted-line" x1="16" y1="24" x2="16" y2="70" />
      <line className="muted-line" x1="16" y1="44" x2="30" y2="90" />
      <text x="4" y="86" fontWeight="600">LOSERS</text>
      {[100, 120].map((y, index) => <circle key={index} cx="16" cy={y} r="6" />)}
      <line x1="16" y1="100" x2="50" y2="110" /><line x1="16" y1="120" x2="50" y2="110" />
      <circle cx="50" cy="110" r="6" />
      <line x1="50" y1="110" x2="110" y2="80" />
      <line x1="122" y1="44" x2="122" y2="70" className="muted-line" />
      <circle cx="122" cy="80" r="8" />
      <line className="accent-line" x1="122" y1="80" x2="180" y2="60" />
      <line className="accent-line" x1="122" y1="44" x2="180" y2="60" />
      <circle className="accent-node" cx="200" cy="60" r="14" />
      <text x="200" y="63" textAnchor="middle">WIN</text>
      <text x="200" y="100" textAnchor="middle" fontSize="7">Final match</text>
    </svg>
  );
}
