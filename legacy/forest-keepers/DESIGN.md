# Forest Keepers — Design Document

**Theme:** Environmental Conservation and Wildlife Protection
**Setting:** Humara Desh Wildlife Reserve
**Tech:** Three.js (WebGL) via CDN import map — plain HTML/JS/CSS, no build step, no installation.

## Core Loop
Explore the 3D forest → collect litter (limited bag) → return to the recycling camp →
unload into the recycling truck → earn **Wildlife Tokens 🪙** → upgrade gear in the
**Ranger Shop** → beat all 7 timed patrols → **YOU WIN**.

## Levels (7 patrols — less time each level)
| Level | Trash quota | Time | Poachers |
|---|---|---|---|
| 1 | 6  | 180s | 1 |
| 2 | 8  | 160s | 1 |
| 3 | 10 | 145s | 2 |
| 4 | 12 | 130s | 2 |
| 5 | 14 | 115s | 3 |
| 6 | 16 | 100s | 3 |
| 7 | 18 | 85s  | 4 |

## Economy — Wildlife Tokens 🪙
- +6 per trash piece recycled at the truck
- +30 per poacher arrested and jailed
- Level bonus: 25 + leftover-time bonus
- −40 if an animal is poached

## Ranger Shop
**Bags:** Jute Sack (5, free) · Canvas Duffel (8, 🪙60) · Ranger Rucksack (12, 🪙140) ·
Compactor Pack (18, 🪙280) · Titan Eco-Vault (25, 🪙520)
**Gear:** Trail Runners (+30% speed, 🪙120) · Poacher Radar (poachers visible through forest, 🪙200)

## Wildlife (zones across the reserve)
- 🐘 **Elephant Savanna** (NE) — 3 elephants with swaying trunks
- 🦏 **Rhino Mudflats** (W) — 3 rhinos
- 🐅 **Tiger Jungle** (SE) — 2 tigers with procedural stripe textures
- 🦌 **Deer Meadow** (SW) — deer that flee from the player
- Birds circling overhead, drifting clouds, campfire at camp

## Poachers
Spawn mid-level at the reserve boundary, stalk the nearest animal, and start a 12s
poach countdown (red shrinking ring). Press **E** within range to arrest — the poacher
is flown to the camp jail. If the countdown finishes, the animal is lost (−40 🪙);
it returns at the next level.

## Camp (starter area)
Recycling truck (animated compactor) · Ranger Shop hut · Poacher jail ·
Start podium (press E to begin next level) · Entrance arch with swinging
**HUMARA DESH WILDLIFE RESERVE** banner · Ranger NPC · Campfire.

## Excitement layer
- **Sky beams** mark every trash piece (and bonus pickups) so targets are visible across the reserve
- **Bonus pickups** each level: 8 golden tokens (+5 🪙) and, from Level 3, 2 clocks (+12s)
- **Combo streaks**: chain pickups within 4.5s → escalating token bonuses with popup
- **Close-call arrests**: stop a poacher mid-poach for +50 🪙
- **Poacher chases**: poachers dodge the ranger — sprint them down with Shift
- Camera shake, sprint FOV kick, red danger vignette under 15s, ambient bird chirps,
  tension drums while poachers are active

## Controls
WASD / Arrow keys move · Mouse look (click to lock **or hold & drag**) · Shift run ·
Wheel zoom · **E** interact (arrest / unload / start level / shop)

## Persistence
Progress (tokens, level, purchases, stats) saved to localStorage.
