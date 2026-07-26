# Garbage Grapple

3D eco action-platformer built for a school competition, from the checklist in
`DESIGN.md`. Player is an Eco Ranger with a grappling hook: collect litter,
recycle it into segregated bins, rescue animals, defeat a pollution boss on
every level, and watch the world visibly heal as you clean.

## Running the game

Plain HTML/JS + Three.js 0.160 via CDN import map — **no build step, no npm**.
Serve statically and open in a browser:

```bash
python -m http.server 8095
```

(`.claude/launch.json` has this as the `garbage-grapple` config.) It cannot run
from `file://` because of ES modules. Deployed via Vercel (static, no config)
from this GitHub repo; every push to `main` auto-redeploys.

## Architecture

- `index.html` — all UI/HUD/screens (start, how-to, level intro, pause, results,
  game over, victory certificate) + styles + import map.
- `src/main.js` — Game orchestrator: state machine (menu/intro/play/celebrate/
  results/gameover/victory), input, scoring, combos, power-ups, tutorial steps,
  level flow. Exposes `window.__gg = {game, input, step, shot}` — a dev hook for
  headless testing (step frames manually; rAF freezes when the tab isn't visible).
- `src/world.js` — builds each level's environment, owns environment
  transformation (`applyEnvHealth(0..1)` drives fog/sky/trees/water/flowers/
  smoke), hazards, animals, NPCs, particles, and the boss (`buildBoss`).
- `src/player.js` — Mario-style controller (accel/friction, coyote time, jump
  buffer, variable jump, double jump) + pendulum grapple swing + third-person
  camera. Camera view direction comes from yaw/pitch directly (do NOT change to
  lookAt(player) — that breaks aiming upward at grapple rings).
- `src/models.js` — procedural Three.js model factories (ranger, animals, trash,
  bins, boss variants, trees, buildings…). Interactive roots are tagged via
  `tagRoot(group, kind)` with kind ∈ ring|trash|golden|core for raycasts.
- `src/levels.js` — 5 level configs (env, trash mix, hazards, boss) + bins + facts.
- `src/audio.js` — fully procedural WebAudio SFX + adaptive music (brightens
  with environment health).
- `legacy/forest-keepers/` — earlier prototype, kept for reference; don't touch.

## Game rules (as implemented)

- 5 open-world circular levels: Campus (tutorial) → Park → City → Beach → River.
- **Every level ends with a boss** (Litter Imp → Oil Sludge Beast → Smog Golem →
  Plastic Kraken → Garbage Monster). Recycle `boss.coreNeed` litter to stun it,
  grapple its green core `boss.hits` times to win the level. Bosses shed litter
  if the level runs low (softlock guard).
- Bag capacity 12 forces recycling trips; combo ×2/×5/×10 on chained pickups;
  power-ups: magnet, speed, freeze (pauses timer), double score.
- Timer out = retry level; health 0 = respawn at station, −15 s.

## Decisions to respect

- **Open-world movement, NOT linear.** A Mario-style forward-only corridor
  redesign was built and the user rejected it ("revert back to previous
  state") — do not reintroduce it without being asked.
- Keep it zero-install: no bundlers, no npm dependencies, CDN Three.js only.
- Kid-friendly tone; environmental/SDG messaging stays front and center.
- Git identity: Viyaan <3753viaan@dpsi.ac.in>; repo
  https://github.com/3753viaan/garbage-grapple (branch `main`).
