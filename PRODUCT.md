# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: Satisfactory players planning and sizing factories**, mostly on a desktop beside
  the game (alt-tabbed or on a second monitor) while they play. Phones are occasional and must
  still work. Their job: decide what to build (machines, miners, generators, belt splits,
  trains) and read off exact numbers to build it in-game.
- **areeb** builds and maintains it; it sits next to the portfolio at
  `areeb-ece.github.io/satisfactorytools/`.

## Product Purpose

Ten calculators and planners for Satisfactory in one static page. The production planner plans a
whole factory for several products at once; the other tools size machines, miners, power, belt
splits, trains and drones, the AWESOME Sink and milestones. Success: a player gets a buildable,
exact answer without leaving the flow of the game.

## Positioning

- The planner is a linear programme solved in the tab, checked against HiGHS on 907 plans.
- Any belt ratio (1234:63:17 included), from any number of input belts, is split exactly with
  splitters, mergers and loops, drawn belt by belt. No belt is faster than the fastest the
  player can build, and the build with the fewest pieces found wins. The planner's splits use
  the same balancer.
- Every tool saves as an image (PNG at 2–6× or SVG, any theme), with the PrereqFlow export's
  choices of what to draw.
- The factory diagram is the PrereqFlow chart: one card per machine, hover to trace, pin, highlight.
- Nothing leaves the browser: `connect-src 'none'`, no analytics; plans live in `localStorage`
  and shared plans travel inside the link.

## Operating Context

- Static site, no build step, no framework: `index.html`, `css/style.css`, ES modules in `js/`.
- Served by GitHub Pages at `/satisfactorytools/` on the portfolio's origin, and loads the shared
  design system from `/design/` (tokens, components, theme, settings panel, night sky). A theme
  picked on any of the four sites applies to all of them.
- CI runs the unit tests and a Playwright browser check, offline and with the live `/design/`.

## Capabilities and Constraints

- Logic, data handling, storage keys (`satisfactorytools.*`), hash routes and behaviour are fixed;
  design work restyles and reorganises only (confirmed 2026-10-20).
- Strict CSP: no inline scripts or styles and no `style` attributes; styles go through classes or
  `el.style.setProperty`.
- Game data is generated (`js/data.js`, from greeny/SatisfactoryTools, MIT); no game images.
- Visual tokens and components come from the master files in `areeb-ece.github.io/public/design/`;
  anything missing there is reported, not invented locally.

## Brand Commitments

- Wordmark `SATISFACTORY/TOOLS`, "by areeb". Same family look as the portfolio, PrereqFlow and
  OTU Calendar.
- Text face Libre Franklin, loaded from the portfolio's `/fonts/` (decided 2026-10-20); mononoki
  for figures, tables, the wordmark and chart cards.
- Independent fan project, not affiliated with Coffee Stain Studios; that line stays visible.
- Voice: plain, short; says what a number means and where it comes from.

## Evidence on Hand

- README, unit tests (`tests/lib.test.js`) and the browser check are the record of what each tool
  does. There are no users' testimonials, usage numbers or reviews; never invent any.

## Product Principles

1. Exact numbers first: the answer is the most prominent thing on every tool.
2. Desktop beside the game: scanable at a glance, every control reachable by keyboard.
3. One family: the shared design system decides the look; this site adds only what's tool-specific.
4. Private and quiet: nothing external, motion that is subtle and can be switched off.

## Accessibility & Inclusion

WCAG 2.2 AA: text contrast in every shared theme, visible focus on everything reachable, full
keyboard use, `prefers-reduced-motion` and the settings panel's Animations switch stop motion,
touch targets sized by the shared `--ctl-h*` scale on coarse pointers.
