import type { Metadata } from "next";
import { Brand } from "@/components/shared";

export const metadata: Metadata = { title: "Tournament formats | Season" };

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

export default function FormatsDocsPage() {
  return (
    <main className="public-shell">
      <header className="public-header"><Brand /></header>
      <h1 style={{ marginTop: 30 }}>Tournament formats</h1>
      <p className="docs-intro">Every division picks one of the formats below. This page explains how each one works and how teams advance.</p>
      <div className="docs-format-list">
        {formats.map((format) => (
          <section className="venue-card docs-format-card" id={format.id} key={format.id}>
            <h2>{format.label}</h2>
            <div className="docs-format-body">
              <ul>
                <li><strong>{format.summary}</strong></li>
                {format.details.map((detail, index) => <li key={index}>{detail}</li>)}
              </ul>
              <FormatDiagram id={format.id} />
            </div>
          </section>
        ))}
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
