# GARBAGE GRAPPLE — Game Design Document
*Competition build · Environmental action-platformer · Based on the Garbage Grapple master checklist*

---

## 1. Vision Statement

**Garbage Grapple** is a fast-paced 3D action-platformer where you play an Eco Ranger armed with a
multi-purpose grappling hook. Run and jump like a classic platformer hero, swing between buildings
and trees, yank litter out of the air, rescue trapped wildlife, and recycle everything at
color-coded segregation stations — all before the clock runs out. Every piece of trash you recycle
visibly heals the world: smog clears, grass turns green, flowers bloom, rivers run blue, animals
return, citizens cheer, and a rainbow crowns a fully restored level.

> **Closing message: “Small Actions. Big Impact. Save Our Planet.”**

**Design pillars**
1. **The hook does everything** — movement, cleanup, rescue, puzzles, boss combat (top innovation item).
2. **Cleaning = visible change** — real-time environment transformation is the reward loop.
3. **Mario-feel movement** — snappy acceleration, coyote time, double jump, air control, momentum swings.
4. **Teach without preaching** — segregation bins, eco facts, SDG badges woven into play.
5. **Easy to start, hard to master** — Level 1 is a guided tutorial; Level 5 is a boss gauntlet.

**SDG integration:** SDG 11 (Sustainable Cities), SDG 12 (Responsible Consumption),
SDG 14 (Life Below Water), SDG 15 (Life on Land) — each level awards a themed SDG badge.

---

## 2. Controls (shown in-game on the How-to-Play screen + tutorial)

| Input | Action |
|---|---|
| **W A S D** / Arrow keys | Move (camera-relative) |
| **Mouse** | Look / aim the crosshair |
| **SPACE** | Jump — press again in mid-air to **Double Jump** |
| **SHIFT** | Sprint |
| **LEFT CLICK** | Fire grappling hook at whatever the crosshair targets |
| **E** | Interact — rescue animals, recycle at the station |
| **V (hold)** | **Future Vision** — preview the fully restored world |
| **P / ESC** | Pause |

**Grapple targets:** 🏢 **building walls** (latch on and zip up — chain latches to climb to
rooftops), ✨ glowing **litter** (pulled straight into your bag — this is how you reach
floating/rooftop trash), and the **boss core**.

**Mario-style movement model:** ground acceleration & friction, sprint, gravity 25 m/s²,
variable-height jump (release SPACE early = shorter hop), double jump, **coyote time** (0.12 s),
**jump buffering**, strong air control, and momentum-preserving swing release.

---

## 3. Core Loop

Explore → **collect litter** (walk over it or grapple it) → bag fills (capacity 12) →
**recycle at the Segregation Station** (items fly into the correct color bins) →
**environment heals** in real time → rescue wildlife & chain combos for bonus →
clear **100 % of litter before the timer ends** → eco fact + SDG badge → next, harder level.

## 4. Waste & Segregation

| Type | Bin | World model |
|---|---|---|
| Plastic bottles | 🔵 Blue | crushed bottle |
| Paper | 🟡 Yellow | crumpled ball |
| Metal cans | 🔴 Red | soda can |
| Glass | 🟣 Purple | green bottle |
| Food waste | 🟢 Green | banana peel |
| E-waste | 🟠 Orange | old battery/board |
| Fishing nets (beach) | 🔵 | tangled net — worth double |
| Toxic barrels (river) | 🟠 | hazard barrel — worth triple |

Depositing at the station auto-sorts each item into its labelled bin with a satisfying
fly-in animation and a per-item **+50 Recycle Bonus** — teaching segregation visually.

## 5. Combo, Power-ups, Scoring

- **Eco Combo:** each pickup within 4 s of the last raises the chain — ×2 at 3, ×5 at 6, ×10 at 10. HUD combo meter drains in real time.
- **Power-ups:** 🧲 Magnetic Recycler (auto-pulls litter 12 m, 10 s) · 👟 Speed Shoes (8 s) · ❄ Freeze Time (timer paused 8 s) · ⭐ Double Score (10 s).
- **Score:** litter 100 × multiplier · recycle +50 · wildlife +250 · time bonus 5/s left · health bonus · perfect-cleaning bonus. Full breakdown on the level-results screen.

## 6. Wildlife Rescue

Animals are trapped under nets/cages (bird, rabbit, squirrel, turtle, deer…). Walk close,
press **E**, the net flies off, the animal celebrates with hearts and hops free (+250, counts
toward the **Wildlife Protector** badge). Rescued species return to roam the healed level.

## 7. Environment Transformation (WOW feature)

A global **Environment Health meter** = litter recycled ÷ total. It drives, continuously:
smog/fog density & color → clear blue sky · sun intensity · ground brown → lush green ·
dead grey trees → full green canopies · flowers bloom in waves · smoke columns fade ·
water clears · butterflies and birds appear · NPCs start cheering — and at **100 %**: a
**rainbow**, leaf-fireworks, victory fanfare, and every NPC celebrating.
**Future Vision Mode (hold V)** previews the restored world at any time — motivation in a keypress.
**Adaptive music:** the soundtrack literally brightens (filter opens, melody layer fades in) as the world heals.

## 8. Levels & Difficulty Curve (easy → hard)

| # | Environment | Litter | Time | New challenge | Boss (stun cost × core pulls) | Badge (SDG) |
|---|---|---|---|---|---|---|
| 1 | **School Campus** | 10 | 4:00 | Guided tutorial, no hazards | **Litter Imp** (5 × 1) | Eco Hero (SDG 4/12) |
| 2 | **Public Park** | 16 | 3:30 | Oil slicks, falling branches | **Oil Sludge Beast** (5 × 2) | Nature Warrior (SDG 15) |
| 3 | **City Streets** | 22 | 3:30 | Traffic, toxic gas, rooftop litter | **Smog Golem** (7 × 2) | Recycling Master (SDG 11) |
| 4 | **Beach** | 26 | 3:00 | Coconuts, floating litter (grapple-only), nets | **Plastic Kraken** (6 × 3) | River Guardian (SDG 14) |
| 5 | **River Bank** | 20 | 4:30 | River crossing, toxic barrels | **The Garbage Monster** (6 × 3) | Planet Defender (SDG 13) |

Difficulty levers per level: less time per litter piece, more/faster hazards, litter placed
higher and farther (forcing grapple mastery), health pressure, and bosses that grow bigger,
hit harder (10 → 20 damage), throw faster, and need more core-pulls.

**Boss fights (every level):** a pollution monster guards the far side of every area. It hurls
garbage projectiles (telegraphed landing rings — dodge!). Recycling the level's **stun cost**
at the station overloads it — its glowing **green core** is exposed for 12 seconds:
**grapple the core** to rip a chunk of pollution out. Enough core-pulls and it collapses into
neatly sorted recyclables; defeating the boss completes the level. If the level runs out of
litter mid-fight, the boss sheds more. The finale monster's defeat fully restores the river.

## 9. Health & Hazards

Player has 100 HP. Traffic 15, coconuts/branches 10, toxic gas 8/s, boss projectiles 20.
At 0 HP you respawn at the station with **−15 s** — pressure without punishment-frustration.
Timer at 0:00 → retry the level (score kept per level, not cumulative-lost).

## 10. Presentation

- **Tech:** Three.js (WebGL) via CDN import map — plain HTML/JS, zero install, runs in any browser.
- **Look:** high-detail stylized-realistic: ACES filmic tone mapping, soft PCF shadows, exponential
  fog, hemisphere + sun lighting, particles (sparkles, hearts, smoke, leaf-fireworks), water shader-lite,
  articulated characters with procedural run/jump/swing animation, visible backpack that fills up.
- **Audio:** fully procedural WebAudio — adaptive layered music, whoosh, dings that rise with combo,
  rescue harp, crowd cheers, boss growls, countdown ticks, victory fanfare.
- **UI:** timer, score & combo meter, objectives list, bag meter, health bar, Environment Health leaf
  meter, live minimap, contextual prompts, edge-of-screen arrow to the station when the bag is full.
- **Onboarding:** animated start screen → How-to-Play card → Level 1 step-by-step tutorial prompts →
  contextual hints throughout. A player who has never seen the game can learn it in 60 seconds.
- **Finale:** certificate screen with the player’s name, total score, all badges, and the closing
  message — *Small Actions. Big Impact. Save Our Planet.*

## 11. Checklist Coverage Map

Every numbered section of the master checklist maps to a system above: 1→Vision · 2→Controls/Loop ·
3→Grapple targets & swing · 4→Levels 1-5 environments · 5-6→Waste & Segregation · 7→Wildlife ·
8→Transformation · 9→Combo · 10→Power-ups · 11→Hazards · 12→Boss · 13→NPC reactions ·
14→Difficulty curve · 15→Hidden golden bottle per level · 16→Eco facts between levels ·
17→Scoring · 18→Badges · 22→UI · 23→Finale · 24→all ten innovation features · 25→WOW moments.
