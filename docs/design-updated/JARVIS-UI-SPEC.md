# JARVIS — UI implementation spec

Hand this to the coding agent together with `jarvis-pipeline.html`. The HTML is a
working reference, not a mockup — the board renders from a state object and the
approve transition actually runs. Read this file for the reasoning behind it, so
the agent makes the same call on cases the prototype doesn't cover.

---

## 1. The one rule

**Nothing reaches the real world until Umer moves it right.**

Every decision below exists to make that rule visible. When a new feature
conflicts with it, the rule wins. When the agent is unsure whether something is
allowed, the answer is the more conservative one.

Four consequences that must not be broken:

1. A plan's mode is expressed by **which column it sits in**, never only by a label.
2. Approval is **per plan**. No "always allow", no remembered consent, no trusted
   list. The drawer footer says this out loud, and it must stay there.
3. **No drag-and-drop between columns.** Approval costs a deliberate button press
   with the effect summary on screen. Dragging is too easy to do by accident.
4. `approvedAt` is written by the approve click handler and **nowhere else** — not
   by the planner, not by a retry, not by a scheduler. It is the audit trail for
   the only transition that touches the outside world.

---

## 2. State machine

```
stated ──► shadow ──► live ──► done
             │                  ▲
             │                  │
             ├──► discarded ────┤
             │                  │
             └──  live ──► failed (rolled back)
```

| State | Means | Who moves it | Column |
|---|---|---|---|
| `stated` | User said an outcome; planner hasn't finished | system | 1 |
| `shadow` | Plan complete, simulated, has an effect summary | system | 2 |
| `live` | User approved; executing now | **user only** | 3 |
| `done` | Finished with a result | system | 4 |
| `failed` | Stopped mid-run and rolled back | system | 4 |
| `discarded` | User rejected the plan at review | user | 4 |

`stated → shadow` and `live → done|failed` are automatic. **`shadow → live` is the
only user-driven transition.**

`failed` is not an error state — it's an outcome, and it reads as *rolled back*
rather than *broken*. A partial run is worse than no run, so a failure must undo
its own writes before it lands in column 4. The prototype's "Sync the price list"
card shows the intended treatment.

---

## 3. Tokens

All colour goes through CSS custom properties. Dark mode is `[data-theme="dark"]`
on `<html>`; mode is `[data-mode="shadow"|"live"]` on the same element, so chrome
can react to mode without prop-drilling. Never hardcode a hex in a component.

```
Canvas    --canvas --surface --sunken --raise
Lines     --line --line-2 --line-3
Text      --ink --ink-2 --ink-3
Stated    --stated --stated-bg --stated-ink          neutral slate
Shadow    --shadow --shadow-bg --shadow-line --shadow-ink    amber
Live      --live --live-bg --live-line --live-ink     green
Danger    --danger --danger-bg --danger-line --danger-ink    write / destructive
Depth     --shade --shade-lg
Shape     --r (9px controls)  --r-lg (13px cards)
Motion    --dur (.22s)  --ease (cubic-bezier(.34,1.2,.64,1))
Mono      --mono
```

**Colour carries meaning, not decoration.** Amber means simulated. Green means
executing for real. Red-brown means this step changes something. These three are
reserved — never reuse them for a chart, a hover state, or a brand accent.

Domain dots (`ops`, `comms`, `finance`, `data`) are a separate, deliberately
desaturated set. They identify, they don't warn.

Type: Space Grotesk 400/500/600/700; IBM Plex Mono for timestamps, counts, step
numbers, effect values, and system voice. Two families, no more. Headings carry
`-0.024em` tracking. Sentence case everywhere.

---

## 4. Motion

Motion is restrained on purpose. **The approve transition is the only orchestrated
moment in the product** — everything else is quiet feedback. If the agent adds a
flourish somewhere else, it competes with the one moment that matters, and the
answer is no.

### The approve moment (the one that matters)

Ordered, roughly 190ms + 440ms:

1. Card gets `.leave` — slides right 20px, scales to .96, fades. 190ms ease-in.
2. State flips to `live`, board re-renders.
3. Card reappears in the Live column with `.cross` — enters from 30px left,
   scales up from .95. 440ms on `--ease` (slight overshoot).
4. The Live track flashes `--live-bg` once, 800ms.
5. The column count badge bumps to 1.3× and settles, 400ms.
6. Toast rises from 14px below with a 7-second draining undo ring.

The direction is the whole point: **left-to-right means Shadow-to-Live.** Never
animate a state change in the opposite direction unless it is an undo.

### Everything else

| Element | Motion | Duration |
|---|---|---|
| Card first appearance | fade up 8px, staggered `--d` at 45ms, capped 200ms | 400ms |
| Card hover | lift 1px + soft shadow | 220ms |
| Any button press | scale .988 | instant |
| Page change | fade up 5px | 240ms |
| Goals rows | fade up 4px, stagger 30ms capped 180ms | 300ms |
| Drawer | slide 30px from right | 260ms |
| Palette / dialog | drop 9px, fade | 200ms |
| Progress bar | width transition | 550ms |
| Live pulse, running step tag | opacity blip, infinite | 1.6s |
| Planner spinner | rotate, infinite | 900ms |
| Logo dot on mode change | translate 8px + colour | 220ms |

### Two rules the agent will get wrong

**Animate on state change, not on render.** The board re-renders every 2.2s while
a plan runs. Keying the landing animation to render makes the Live card
re-animate forever. The prototype keeps a `seen` set of `id:stage` keys; a card
animates only when that key is new. `.cross` is used when the id was seen under a
*different* stage (it moved), `.enter` when it's genuinely new.

**Strip one-shot classes on `animationend`.** `animation-fill-mode: both` is
needed so a staggered card isn't visible before its delay elapses — but the
retained final keyframe sets `transform: none` at animation specificity, which
silently kills the hover lift and the press scale. One global listener removes
`enter cross bump flash` when each animation ends.

Progress during a run patches the DOM in place (`updateLive`) rather than
re-rendering the column, so the bar's width transition actually plays.

`prefers-reduced-motion: reduce` disables every animation and transition globally.
Verify this still holds after any change — the pulse and spinner are the ones that
matter for anyone motion-sensitive.

---

## 5. Screens

### Board — default route

Four columns, `minmax(0, 1fr)` so a long title can't blow out a column. 3px top
border per column in its state colour; header carries name, count, and a
plain-language gloss ("simulated only", "running for real").

Only Shadow cards get a **dark filled button**. On any given visit, approving is
the one action that matters and should be the only thing that looks primary. The
Live button is secondary and destructive in meaning ("Stop and roll back").

The page subtitle is derived, never static: it counts what's actually waiting and
changes wording when nothing is. Empty columns get a one-line dashed placeholder
("Nothing waiting on you"), never blank space.

The composer is fixed to the bottom with the input, a Shadow/Live segmented
control, and "Plan it". Board carries `padding-bottom: 104px`.

### Goals

The same data as a list, for when there are forty. State chip (fixed 112px so
chips align), title and summary, right-aligned meta. Filters: All / Needs you /
Running / Done. Chips reuse the board's column colours exactly — someone who
learned the board reads this without relearning anything.

### Activity

Time-grouped log. Each entry is `time | dot | text`, dot coloured by event kind.

**Every execution entry carries an effect chip**: amber `simulated · nothing sent`,
or red-brown `wrote 1 file · sent 0`. A log that doesn't say whether anything real
happened is worse than no log, because it looks like an answer.

The log is a **projection of state transitions**, not a thing you remember to write
to. Every transition function appends its own entry; nothing else writes here.

Entries read in past tense from the user's side: "You approved X", "Planned X in
Shadow", "Finished X". Not "Simulated steps for ops" — that names internals.

### Settings

Mode is not a row. It gets its own tinted panel at the top (amber in Shadow, green
in Live) with two large choice cards explaining what actually differs. Switching to
Live routes through a confirm dialog that names the consequence — including that
runs will queue while the Control API is down.

Everything else is an ordinary row. Control API shows `not connected` in danger
colour with the consequence spelled out. "Coming later" is a row of dashed chips.

---

## 6. Plan drawer

The most important screen. Opens from any card or row. 520px, right side, scrim,
closes on Escape / scrim / ✕. Focus moves to close on open.

1. **Header** — state chip, title, one sentence of provenance ("Simulated at
   3:52 AM against a copy of your data").
2. **Steps** — numbered, each tagged `read` / `compute` / `writes`. `writes` is
   red-brown. During a Live run the current step is tagged `running` in green and
   pulses; steps not yet reached are dimmed to 50%. Someone should be able to scan
   the right column and count the dangerous steps without reading prose.
3. **Effect summary** — files written, messages sent, anything deleted, reversible.
   Non-zero writes in red-brown. **This must be on screen at the moment of
   approval.** Never behind a tab or toggle.

Footer: one primary, two secondary (Edit a step / Discard plan), and the line
"Approval applies to this plan only. It is never remembered for next time."

Primary label and intent change by state: `Approve and run Live` (shadow),
`Stop and roll back` (live, secondary styling), `Resolve the 2 open lines` (done
with open items), `Retry with a fix` (failed), `Cancel this goal` (stated).
Discard is hidden outside `shadow`.

---

## 7. Command palette

`⌘K` / `Ctrl+K`. Searches goals by title and domain, offers page navigation, and
if the query matches nothing, offers to state it as a new outcome. Arrow keys move
the selection, Enter runs it, Escape closes.

This isn't a nicety. A personal AI OS gets opened forty times a day and should not
require the mouse. Treat it as a first-class route into every action, not a search
box — if a new feature can't be reached from the palette, it's half-built.

---

## 8. The undo window

After approval, a toast offers **Undo for 7 seconds** with a draining ring so the
window is visible rather than guessed. Undo stops the run, returns the plan to
`shadow`, clears `approvedAt`, and removes the log entry it created.

This is the safety net that makes a single-press approval defensible. The duration
lives in Settings. If a run cannot be safely undone, the plan must say so in its
effect summary (`Reversible: no`) and the toast must not offer Undo.

---

## 9. Data shape

```ts
type Stage = 'stated' | 'shadow' | 'live' | 'done' | 'failed' | 'discarded';
type Effect = 'read' | 'compute' | 'writes';

interface Step { text: string; effect: Effect }

interface Goal {
  id: string;
  title: string;        // short, imperative, no terminal punctuation
  summary: string;      // one sentence: what it does
  domain: 'ops' | 'comms' | 'finance' | 'data';
  stage: Stage;
  steps: Step[];
  effects: {
    filesWritten: number;
    messagesSent: number;
    deletes: boolean;
    reversible: boolean;
  };
  plannedAt?: string;
  approvedAt?: string;   // user action only — see rule 4
  finishedAt?: string;
  progress?: number;     // 1-based index of the running step
  needsAttention?: number;
}
```

Derive rather than store: step counts, read counts, and write counts all come from
`steps`. A stored count will drift from the plan it describes, and this is the one
number a person leans on when deciding to approve.

---

## 10. Quality floor

- Every interactive element is a real `<button>` or `<a>`. Cards are buttons.
- Visible 2px focus ring on `:focus-visible`.
- Drawer, palette, and dialog are `role="dialog" aria-modal="true"` with labelled
  titles. The prototype restores focus on close but does not trap it — **the agent
  must add the focus trap.**
- The toast is `role="status"` so undo is announced, not just drawn.
- Contrast: state colours pass AA on their own tinted backgrounds in both themes.
  Re-check before changing any of them.
- Below 1100px the board drops to two columns; below 720px to one, with column
  headers becoming section headings. Composer stays fixed on mobile.

---

## 11. Build order

1. Tokens, shell, routing, `data-mode` / `data-theme` on `<html>`.
2. Board rendering from state — all six stages, empty states, derived subtitle.
3. Plan drawer with the effect summary.
4. **The approve transition, undo window, and the `seen`-set motion rule.** Do this
   before any backend work. If this moment feels right, the rest of the product has
   an obvious shape; if it doesn't, no amount of adapter work will save it.
5. Activity as a projection of transitions.
6. Command palette over the routes and goals that now exist.
7. Settings, with the mode panel driving the composer default.
8. Only now: swap the mock adapter for the Control API.

Steps 1–4 are the product. Everything after is plumbing.
