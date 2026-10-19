/*
 * Pocket Parrot game data: stats, looks, foods, activities, tricks and unlocks.
 * Everything tunable lives here so the rules in engine.js stay generic.
 */
(function (root) {
  'use strict';

  const STAT_IDS = ['fullness', 'happiness', 'bond', 'energy', 'plumage'];

  const STATS = {
    fullness:  { label: 'Fullness',  low: 'Hungry',    need: '🍎' },
    happiness: { label: 'Happiness', low: 'Bored',     need: '🔔' },
    bond:      { label: 'Bond',      low: 'Lonely',    need: '💬' },
    energy:    { label: 'Energy',    low: 'Exhausted', need: '💤' },
    plumage:   { label: 'Plumage',   low: 'Scruffy',   need: '💧' },
  };

  // Points lost per minute. A negative number means the stat recovers.
  const DECAY = {
    awake:  { fullness: 3,   happiness: 2.5, bond: 1.2, energy: 1.5, plumage: 1 },
    asleep: { fullness: 1.5, happiness: 0.4, bond: 0.3, energy: -15, plumage: 0.5 },
  };

  const PALETTE = [
    { hex: '#D7262E', name: 'Scarlet' },
    { hex: '#F28C28', name: 'Tangerine' },
    { hex: '#F6C945', name: 'Sunflower' },
    { hex: '#9BD33A', name: 'Lime' },
    { hex: '#2E9E4F', name: 'Leaf' },
    { hex: '#1FA59A', name: 'Teal' },
    { hex: '#4FB3E8', name: 'Sky' },
    { hex: '#1E5BB8', name: 'Cobalt' },
    { hex: '#7B4FC9', name: 'Violet' },
    { hex: '#F07AAE', name: 'Rose' },
    { hex: '#F5F3EE', name: 'Snow' },
    { hex: '#C9CDD2', name: 'Ash' },
    { hex: '#8A9099', name: 'Slate' },
    { hex: '#6E747C', name: 'Pewter' },
    { hex: '#3B3F45', name: 'Charcoal' },
    { hex: '#E8D9B5', name: 'Ivory' },
    { hex: '#F7B58A', name: 'Peach' },
  ];

  // Feather regions the player can recolor. `optional` parts accept "none".
  const PARTS = [
    { id: 'head',    label: 'Head' },
    { id: 'body',    label: 'Body' },
    { id: 'wing',    label: 'Wings' },
    { id: 'wingTip', label: 'Wing tips' },
    { id: 'tail',    label: 'Tail' },
    { id: 'beak',    label: 'Beak' },
    { id: 'crest',   label: 'Crest' },
    { id: 'cheek',   label: 'Cheeks', optional: true },
  ];

  const CREST_STYLES = [
    { id: 'none', label: 'None' },
    { id: 'tuft', label: 'Tuft' },
    { id: 'tall', label: 'Tall crest' },
  ];

  const SPECIES = [
    {
      id: 'scarletMacaw', name: 'Scarlet Macaw', latin: 'Ara macao',
      colors: { head: '#D7262E', body: '#D7262E', wing: '#F6C945', wingTip: '#1E5BB8', tail: '#D7262E', beak: '#E8D9B5', crest: '#D7262E', cheek: null },
      crest: 'none', facePatch: true,
    },
    {
      id: 'blueGold', name: 'Blue-and-gold Macaw', latin: 'Ara ararauna',
      colors: { head: '#1E5BB8', body: '#F6C945', wing: '#1E5BB8', wingTip: '#1FA59A', tail: '#1E5BB8', beak: '#3B3F45', crest: '#2E9E4F', cheek: null },
      crest: 'none', facePatch: true,
    },
    {
      id: 'africanGrey', name: 'African Grey', latin: 'Psittacus erithacus',
      colors: { head: '#8A9099', body: '#8A9099', wing: '#6E747C', wingTip: '#3B3F45', tail: '#D7262E', beak: '#3B3F45', crest: '#8A9099', cheek: null },
      crest: 'none', facePatch: true,
    },
    {
      id: 'cockatoo', name: 'Sulphur-crested Cockatoo', latin: 'Cacatua galerita',
      colors: { head: '#F5F3EE', body: '#F5F3EE', wing: '#F5F3EE', wingTip: '#F5F3EE', tail: '#F5F3EE', beak: '#3B3F45', crest: '#F6C945', cheek: null },
      crest: 'tall', facePatch: false,
    },
    {
      id: 'budgie', name: 'Budgerigar', latin: 'Melopsittacus undulatus',
      colors: { head: '#F6C945', body: '#9BD33A', wing: '#9BD33A', wingTip: '#3B3F45', tail: '#1E5BB8', beak: '#F7B58A', crest: '#F6C945', cheek: '#7B4FC9' },
      crest: 'none', facePatch: false,
    },
    {
      id: 'cockatiel', name: 'Cockatiel', latin: 'Nymphicus hollandicus',
      colors: { head: '#F6C945', body: '#8A9099', wing: '#8A9099', wingTip: '#F5F3EE', tail: '#6E747C', beak: '#C9CDD2', crest: '#F6C945', cheek: '#F28C28' },
      crest: 'tall', facePatch: false,
    },
  ];

  // Personality changes how stats move. Multipliers apply to positive gains
  // (statGain, tagGain) or to drain rates (decay).
  const PERSONALITIES = [
    { id: 'chatty',  name: 'Chatty',  blurb: 'Learns phrases in 2 lessons instead of 3. Chatting gives 50% more.', tagGain: { talk: 1.5 }, phraseReps: 2 },
    { id: 'playful', name: 'Playful', blurb: 'Happiness drains 30% slower. Toys give 25% more.', decay: { happiness: 0.7 }, tagGain: { toy: 1.25 } },
    { id: 'cuddly',  name: 'Cuddly',  blurb: 'Bond grows 50% faster from every activity.', statGain: { bond: 1.5 } },
    { id: 'clever',  name: 'Clever',  blurb: 'Training succeeds more often and tricks are mastered faster.', trainBonus: 0.12, masteryMult: 1.25 },
    { id: 'chill',   name: 'Chill',   blurb: 'Energy and plumage drain 30% slower.', decay: { energy: 0.7, plumage: 0.7 } },
  ];

  const NAMES = ['Kiwi', 'Mango', 'Pickles', 'Captain', 'Biscuit', 'Rio', 'Pepper', 'Coco', 'Sunny', 'Ziggy', 'Waffles', 'Jet', 'Nugget', 'Marley', 'Polly'];

  const FOODS = [
    { id: 'seeds',   name: 'Sunflower seeds', icon: '🌻', level: 1, cooldown: 4,  xp: 4, effects: { fullness: 18, happiness: 2 }, note: 'A classic. Tasty but fatty.' },
    { id: 'pellets', name: 'Pellet mix',      icon: '🥣', level: 1, cooldown: 6,  xp: 5, effects: { fullness: 26 }, note: 'Balanced everyday diet.' },
    { id: 'apple',   name: 'Apple slice',     icon: '🍎', level: 1, cooldown: 5,  xp: 5, effects: { fullness: 12, happiness: 6 }, note: 'Seeds removed. They are toxic to birds.' },
    { id: 'carrot',  name: 'Carrot stick',    icon: '🥕', level: 2, cooldown: 5,  xp: 6, effects: { fullness: 14, plumage: 5 }, note: 'Vitamin A keeps feathers glossy.' },
    { id: 'almond',  name: 'Almond',          icon: '🌰', level: 4, cooldown: 8,  xp: 6, effects: { fullness: 8, happiness: 10, bond: 3 }, note: 'Favorite treat. Great for bonding.' },
    { id: 'millet',  name: 'Millet spray',    icon: '🌾', level: 5, cooldown: 10, xp: 7, effects: { fullness: 10, happiness: 14 }, note: 'Pure joy on a stalk.' },
    { id: 'mango',   name: 'Mango',           icon: '🥭', level: 6, cooldown: 8,  xp: 8, effects: { fullness: 16, happiness: 10, plumage: 3 }, note: 'Messy, sweet and worth it.' },
  ];

  const ABILITIES = [
    { id: 'mimicry', name: 'Mimicry',       level: 3, blurb: 'Teach phrases while you chat. Learned phrases show up in conversation.' },
    { id: 'dance',   name: 'Dance Party',   level: 5, blurb: 'Unlocks music time in Play.' },
    { id: 'flight',  name: 'Free Flight',   level: 7, blurb: 'Unlocks supervised flights around the room.' },
    { id: 'puzzle',  name: 'Puzzle Solver', level: 9, blurb: 'Unlocks the puzzle feeder, the richest XP in the game.' },
  ];

  // `msg` is logged after the activity; {name} is replaced with the bird's name.
  const PLAY = [
    { id: 'scratch', name: 'Head scratch',  icon: '✋', level: 1, cooldown: 4,  xp: 5,  effects: { bond: 10, happiness: 4 }, tags: ['touch'], anim: 'nuzzle', fx: '❤️', msg: '{name} leans into the scratch and fluffs up.' },
    { id: 'talk',    name: 'Chat',          icon: '💬', level: 1, cooldown: 5,  xp: 5,  effects: { bond: 6, happiness: 6 }, tags: ['talk'], anim: 'talk', fx: '💬', msg: 'You chat with {name} for a while.' },
    { id: 'bell',    name: 'Bell toy',      icon: '🔔', level: 1, cooldown: 6,  xp: 6,  effects: { happiness: 14, energy: -6 }, tags: ['toy'], anim: 'hop', fx: '✨', msg: '{name} rings the bell over and over.' },
    { id: 'bath',    name: 'Misting bath',  icon: '💧', level: 1, cooldown: 20, xp: 6,  effects: { plumage: 30, happiness: 3, energy: -3 }, tags: [], anim: 'shake', fx: '💧', msg: '{name} gets a fine misting and shakes off.' },
    { id: 'forage',  name: 'Foraging box',  icon: '📦', level: 3, cooldown: 10, xp: 8,  effects: { happiness: 16, fullness: 4, energy: -6 }, tags: ['toy'], anim: 'eat', fx: '✨', msg: '{name} shreds the box to find the treats inside.' },
    { id: 'music',   name: 'Music time',    icon: '🎵', level: 5, ability: 'dance', cooldown: 12, xp: 10, effects: { happiness: 16, bond: 4, energy: -8 }, tags: ['toy'], anim: 'dance', fx: '🎵', msg: '{name} bobs along to the music.' },
    { id: 'flight',  name: 'Free flight',   icon: '🕊️', level: 7, ability: 'flight', cooldown: 25, xp: 14, effects: { happiness: 22, plumage: 3, energy: -16 }, tags: [], anim: 'loop', fx: '✨', msg: '{name} takes a lap of the room and lands back on the perch.' },
    { id: 'puzzle',  name: 'Puzzle feeder', icon: '🧩', level: 9, ability: 'puzzle', cooldown: 15, xp: 18, effects: { happiness: 12, fullness: 6, energy: -8 }, tags: ['toy'], anim: 'eat', fx: '💡', msg: '{name} cracks the puzzle feeder open.' },
  ];

  const TRICKS = [
    { id: 'stepup',   name: 'Step Up',        level: 1,  difficulty: 1,   anim: 'stepup',   note: 'Steps onto your hand on cue. Every parrot learns this first.' },
    { id: 'wave',     name: 'Wave',           level: 2,  difficulty: 1.2, anim: 'wave',     note: 'Lifts a wing to say hello.' },
    { id: 'turn',     name: 'Turn Around',    level: 4,  difficulty: 1.4, anim: 'spin',     note: 'Spins in place when you circle a finger.' },
    { id: 'dance',    name: 'Head-bob Dance', level: 5,  difficulty: 1.5, anim: 'dance',    note: 'Bobs and sways to the beat.' },
    { id: 'whistle',  name: 'Whistle a Tune', level: 6,  difficulty: 1.7, anim: 'whistle',  note: 'Whistles the first bars of a song.' },
    { id: 'fetch',    name: 'Fetch',          level: 7,  difficulty: 1.9, anim: 'fetch',    note: 'Brings back a small ball.' },
    { id: 'playdead', name: 'Play Dead',      level: 8,  difficulty: 2.1, anim: 'playdead', note: 'Flops over on "bang!" and waits for applause.' },
    { id: 'loop',     name: 'Loop-de-loop',   level: 10, difficulty: 2.5, anim: 'loop',     note: 'A full aerial loop on cue. The showstopper.' },
  ];

  const ACCESSORY_SLOTS = [
    { id: 'head', label: 'Head' },
    { id: 'face', label: 'Face' },
    { id: 'neck', label: 'Neck' },
  ];

  const ACCESSORIES = [
    { id: 'hibiscus', name: 'Hibiscus',   slot: 'head', level: 2 },
    { id: 'bowtie',   name: 'Bow tie',    slot: 'neck', level: 4 },
    { id: 'partyhat', name: 'Party hat',  slot: 'head', level: 6 },
    { id: 'shades',   name: 'Sunglasses', slot: 'face', level: 8 },
    { id: 'crown',    name: 'Crown',      slot: 'head', level: 10 },
  ];

  const SQUAWKS = ['Squawk!', 'Chirp chirp!', '*whistles*', 'Rrraaw!', '*beak clicks*', 'Peep?'];

  const MAX_LEVEL_WITH_UNLOCKS = 10;

  const api = {
    STAT_IDS, STATS, DECAY, PALETTE, PARTS, CREST_STYLES, SPECIES, PERSONALITIES, NAMES,
    FOODS, ABILITIES, PLAY, TRICKS, ACCESSORY_SLOTS, ACCESSORIES, SQUAWKS, MAX_LEVEL_WITH_UNLOCKS,
  };

  root.ParrotData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
