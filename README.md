# Pocket Parrot

A browser-based virtual parrot. Build your own bird, keep its stats up with food, play and training, and level it up to unlock new tricks, abilities and accessories.

It's plain HTML, CSS and JavaScript: no frameworks, no build step and no dependencies.

## Play it

- **Locally:** open `index.html` in any modern browser. Double-clicking the file works.
- **With a local server:** run `npm start`, then open http://localhost:8080.
- **On the web:** GitHub Pages can serve the repo as-is. Go to *Settings → Pages* and deploy from the `main` branch root.

## How the game works

**Build your bird.** Pick one of six real species (Scarlet Macaw, Blue-and-gold Macaw, African Grey, Sulphur-crested Cockatoo, Budgerigar, Cockatiel), recolor any of eight feather regions, choose a crest, and pick a personality:

| Personality | Bonus |
|---|---|
| Chatty | Learns phrases in 2 lessons instead of 3; chatting gives 50% more |
| Playful | Happiness drains 30% slower; toys give 25% more |
| Cuddly | Bond grows 50% faster |
| Clever | Higher training success; tricks are mastered faster |
| Chill | Energy and plumage drain 30% slower |

**Keep five stats up.** Fullness, Happiness, Bond, Energy and Plumage drain in real time. While you're away they drain at half speed and never drop below 20, so your bird is never in crisis when you come back.

**Care for it.**
- *Feed:* seven foods with different effects (carrots help plumage, almonds build bond).
- *Play:* head scratches, chatting, toys, misting baths and, at higher levels, music, free flight and a puzzle feeder.
- *Train:* practice tricks. The chance of success depends on how fed, happy and bonded your bird is. Mastered tricks can be performed for bonus XP.
- *Bedtime:* cover the cage to restore Energy.

**Level up.** Every action earns XP, and your bird's well-being (the average of its stats) multiplies it from ×0.5 to ×1.5. A thriving bird (well-being 75% or higher) also earns XP on its own. Each level from 2 to 10 unlocks something:

| Level | Unlocks |
|---|---|
| 2 | Carrot stick, Wave trick, Hibiscus |
| 3 | Foraging box, **Mimicry** (teach phrases) |
| 4 | Almond, Turn Around trick, Bow tie |
| 5 | Millet spray, **Dance Party**, Head-bob Dance trick |
| 6 | Mango, Whistle a Tune trick, Party hat |
| 7 | **Free Flight**, Fetch trick |
| 8 | Play Dead trick, Sunglasses |
| 9 | **Puzzle Solver** |
| 10 | Loop-de-loop trick, Crown |

## How it's built

```
index.html          Page shell: loads the fonts, the stylesheet and the scripts
css/style.css       Theme (light and dark), layout and every parrot animation
js/data.js          All tunable content: species, foods, activities, tricks, unlocks
js/engine.js        Game rules: stat drain, XP, levels, training, saves. No DOM code
js/art.js           Draws the 2D parrot as SVG (used when 3D is off or unsupported)
js/bird3d.js        The 3D parrot: a stand-in model, its animations and drag-to-turn
vendor/three.min.js Three.js r147 (MIT license), the 3D library, bundled so it works offline
js/sound.js         Chirps and jingles synthesized with the Web Audio API
js/store.js         Saving to localStorage (and to a Claude account when published there)
js/ui.js            Screens, game loop, input handling and visual feedback
tests/              Unit tests for the rules engine
```

A few design choices make it easy to extend:

- **Data is separate from rules.** To add a food, trick or accessory, add an entry to `js/data.js`. The engine, the panels and the Journey tab pick it up automatically.
- **The engine is pure logic.** `engine.js` never touches the page, so it runs under Node for tests. The UI calls functions like `E.feed(state, 'apple', now)` and gets back a result describing what happened (stat changes, XP, level-ups, which animation to play). It then turns that result into visuals.
- **The parrot is one SVG with named parts.** The head, wing, lower beak and eyes are separate groups, so CSS animations can make the bird peck, wave, dance, spin, play dead or fly a loop. Accessories are extra shapes layered on top.
- **Time is computed, not simulated.** Each tick advances stats by the time elapsed since the last tick. That makes offline progress and throttled background tabs work without special cases.

## 3D view

The bird is drawn in 3D with [Three.js](https://threejs.org) when the device supports WebGL, which almost every phone does. Drag sideways on the bird to turn it. The **3D on/off** button in the top bar switches back to the 2D artwork.

The current 3D bird is a stand-in built from simple shapes. It is put together like a rigged model: the body, neck, head, wings, tail, beak, jaw, eyes and feet each hang off a named pivot, and every animation (pecking, hopping, waving, dancing, playing dead, flying a loop and so on) moves only those pivots. A realistic model can replace it later without changing the game.

**Adding a real model.** Look for a parrot in **.glb** format (or .gltf) that is rigged with a skeleton, ideally with built-in animations such as idle, fly and walk, under a license that allows this use. Add it to a `models/` folder through GitHub (*Add file → Upload files*, on the game's branch). It can then be connected to the animation names in `js/bird3d.js`.

## Saving

Progress saves to your browser's `localStorage` after every action and every 10 seconds. When the game runs as a published Claude artifact, it also saves to your private space in that artifact's database, so your bird follows you across devices.

## Tests

```
npm test
```

This runs the engine tests with Node's built-in test runner (Node 18 or newer). They cover stat drain, away-time rules, feeding, cooldowns, XP multipliers, levelling, training, phrase teaching and save loading.
