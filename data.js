// Bastion rules data (D&D 2024 Dungeon Master's Guide, chapter 8).
// Descriptions are short paraphrased summaries for play at the table —
// the DMG has the full wording. Entries marked `verify: true` are summarized
// from memory rather than from the reference pages and may need a check.

const SPACES = {
  Cramped: { squares: 4 },
  Roomy: { squares: 16 },
  Vast: { squares: 36 },
};

const BASIC_TYPES = ['Bedroom', 'Dining Room', 'Parlor', 'Courtyard', 'Kitchen', 'Storage'];

const BASIC_ADD = {
  Cramped: { cost: 500, days: 20 },
  Roomy: { cost: 1000, days: 45 },
  Vast: { cost: 3000, days: 125 },
};

const BASIC_ENLARGE = {
  Cramped: { to: 'Roomy', cost: 500, days: 25 },
  Roomy: { to: 'Vast', cost: 2000, days: 80 },
};

// Special facilities enlarge for 2,000 GP. The time isn't on the reference
// pages, so we use the Roomy-to-Vast basic time (80 days).
const SPECIAL_ENLARGE_DAYS = 80;

const WALL = { costPerSquare: 250, daysPerSquare: 10, height: 20 };

// [level, total special facilities]
const SLOT_TABLE = [[5, 2], [9, 4], [13, 5], [17, 6]];

const PREREQS = {
  arcane: 'Can use an Arcane Focus or a tool as a Spellcasting Focus',
  divine: 'Can use a Holy Symbol or Druidic Focus as a Spellcasting Focus',
  focus: 'Can use a Spellcasting Focus (any kind)',
  expertise: 'Has Expertise in a skill',
  fighting: 'Has the Fighting Style or Unarmored Defense feature',
};

const ORDER_INFO = {
  Craft: 'Hirelings craft an item the facility can make. The facility can\'t craft anything else until it\'s done.',
  Empower: 'The facility grants a temporary empowerment to you or someone else.',
  Harvest: 'Hirelings gather a resource the facility produces. Nothing else can be harvested until it\'s done.',
  Maintain: 'All hirelings maintain the whole Bastion. No other orders this turn, and the DM rolls a Bastion event.',
  Recruit: 'Hirelings recruit creatures to the Bastion, which can include Bastion Defenders.',
  Research: 'Hirelings gather information.',
  Trade: 'Hirelings buy and sell goods or services stored or produced in the facility.',
};

const GARDEN_TYPES = {
  Decorative: 'Ten floral bouquets (5 GP each), ten vials of Perfume, or ten Candles',
  Food: '100 days of Rations',
  Herb: 'Herbs for ten Healer\'s Kits or one Potion of Healing',
  Poison: 'Plants for two vials of Antitoxin or one vial of Basic Poison',
};

const ARCHIVE_BOOKS = [
  'Bigby\'s Handy Arcana Codex — Advantage on Arcana checks when you Study (spells, magic items, planes)',
  'The Chronepsis Chronicles — Advantage on History checks when you Study',
  'Investigations of the Inquisitive — Advantage on Investigation checks when you Study',
  'Material Musings on the Nature of the World — Advantage on Nature checks when you Study',
  'The Old Faith and Other Religions — Advantage on Religion checks when you Study',
];

const GUILDS = {
  Adventurers: { symbol: 'Lit torch', text: 'Adventurers slay or capture a Beast of CR 2 or lower that lairs within 50 miles, in 1d6 + 1 days. Trophies can go to a Trophy Room; captures to a Menagerie with room.' },
  Bakers: { symbol: 'Pastry', text: 'Bakers supply a prestigious event in the next 7 days. Take 500 GP or a favor owed by the host.' },
  Brewers: { symbol: 'Foaming mug', text: 'Brewers deliver fifty 40-gallon barrels of ale (10 GP each) to your Bastion in 7 days.' },
  Masons: { symbol: 'Stone mask', text: 'Masons build defensive wall at no cost, 1 day per 5-foot square instead of 10. Can be for another Bastion within 1 mile.' },
  Shipbuilders: { symbol: 'Crossed oars', text: 'Shipbuilders build an airborne or waterborne vehicle (PHB). You pay full cost; it takes 1 day per 1,000 GP of cost.' },
  Thieves: { symbol: 'White key', text: 'Thieves steal a nonmagical object (≤ 5 ft) from a location within 50 miles. Delivered in 1d6 + 1 days. Risk of retaliation.' },
};

const MENAGERIE_CREATURES = [
  { name: 'Ape', size: 'Medium', cost: 500 },
  { name: 'Black Bear', size: 'Medium', cost: 500 },
  { name: 'Brown Bear', size: 'Large', cost: 1000 },
  { name: 'Constrictor Snake', size: 'Large', cost: 250 },
  { name: 'Crocodile', size: 'Large', cost: 500 },
  { name: 'Dire Wolf', size: 'Large', cost: 1000 },
  { name: 'Giant Vulture', size: 'Large', cost: 1000 },
  { name: 'Hyena', size: 'Medium', cost: 50 },
  { name: 'Jackal', size: 'Small', cost: 50 },
  { name: 'Lion', size: 'Large', cost: 1000 },
  { name: 'Owlbear', size: 'Large', cost: 3500 },
  { name: 'Panther', size: 'Medium', cost: 250 },
  { name: 'Tiger', size: 'Large', cost: 1000 },
];
const CR_COSTS = [['0 or 1/8', 50], ['1/4', 250], ['1/2', 500], ['1', 1000], ['2', 2000], ['3', 3500]];

const GAMING_HALL_TABLE = [
  { max: 50, dice: 1, label: '1d6 × 10 GP' },
  { max: 85, dice: 2, label: '2d6 × 10 GP' },
  { max: 95, dice: 4, label: '4d6 × 10 GP' },
  { max: 100, dice: 10, label: '10d6 × 10 GP' },
];

// Free enclosures carved out of a facility's existing squares (never adds area)
const NOOK_KINDS = ['Closet', 'Washroom', 'Privy', 'Bath', 'Wardrobe', 'Pantry', 'Linen cupboard', 'Alcove', 'Storage nook'];
const NOOK_ABBR = { Closet: 'Cl', Washroom: 'WC', Privy: 'Pv', Bath: 'Ba', Wardrobe: 'Wd', Pantry: 'Pn', 'Linen cupboard': 'Ln', Alcove: 'Al', 'Storage nook': 'St' };
const CAMPAIGNS = ['Cobalt Storm', 'Scarlet Storm', 'Storm of the Endless Night', 'Wild Storm'];
const SAVES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];

const TRAINERS = {
  'Battle Expert': 'when hit by an Unarmed Strike or weapon attack, use a Reaction to reduce the damage by 1d4',
  'Skills Expert': 'proficiency in Acrobatics, Athletics, Performance, Sleight of Hand, or Stealth (your choice)',
  'Tools Expert': 'proficiency with one tool of your choice',
  'Unarmed Combat Expert': 'Unarmed Strike hits deal an extra 1d4 Bludgeoning damage',
  'Weapon Expert': 'proficiency with a chosen Simple or Martial weapon, or its mastery property if already proficient',
};

const PUB_BEVERAGES = {
  "Bigby's Burden": 'the "enlarge" effect of Enlarge/Reduce for 24 hours (no save)',
  'Kiss of the Spider Queen': 'the effect of Spider Climb for 24 hours',
  'Moonlight Serenade': 'Darkvision 60 ft for 24 hours (or +60 ft if you have it)',
  'Positive Reinforcement': 'Resistance to Necrotic damage for 24 hours',
  'Sterner Stuff': 'auto-succeed on saves to avoid or end Frightened for 24 hours',
};

const ARTISAN_TOOLS = ["Carpenter's Tools", "Cobbler's Tools", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools"];

// ---- Special facilities -------------------------------------------------
// order option fields:
//   id, label, days (number | fn(b,f,d) evaluated when issued), cost (number | fn(b,f,d)),
//   minLevel, choices [{value,label,cost?}], custom (item/days/cost inputs), qty {label,max,each},
//   effect, result (string | fn(b,f,d)), avail fn(b,f) -> reason string if unavailable
const FACILITIES = [
  {
    key: 'arcane-study', name: 'Arcane Study', level: 5, prereq: 'arcane', space: 'Roomy', hirelings: 1, order: 'Craft',
    desc: 'A quiet study with desks and bookshelves.',
    passive: 'Arcane Study Charm: after a Long Rest in your Bastion, gain a Charm (7 days or until used) to cast Identify without a spell slot or Material components.',
    orders: [
      { id: 'focus', label: 'Arcane Focus', days: 7, cost: 0, effect: 'stash', result: 'Arcane Focus' },
      { id: 'book', label: 'Blank Book', days: 7, cost: 10, effect: 'stash', result: 'Blank book' },
      { id: 'magic', label: 'Magic Item (Arcana)', minLevel: 9, custom: true, effect: 'stash', note: 'Common or Uncommon from the Arcana tables. Time & cost per "Crafting Magic Items" (DMG ch. 7). Items that cast spells need you to craft it yourself with those spells prepared.' },
    ],
  },
  {
    key: 'archive', name: 'Archive', level: 13, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research',
    desc: 'A repository of valuable books, maps, and scrolls — often behind a locked or secret door off a Library.',
    passive: 'Reference Book: while you and the book are in your Bastion, it grants Advantage on one kind of Study check (choose below).',
    options: { books: true },
    enlarge: { cost: 2000, note: 'Vast: gain two additional reference books.' },
    orders: [
      { id: 'lore', label: 'Helpful Lore', days: 7, cost: 0, effect: 'stash', result: 'Helpful lore (as Legend Lore) — hireling shares it next time you speak', topic: true },
    ],
  },
  {
    key: 'armory', name: 'Armory', level: 5, prereq: null, space: 'Roomy', hirelings: 1, order: 'Trade',
    desc: 'Mannequins for armor, hooks for Shields, weapon racks, and ammunition chests.',
    passive: 'While stocked, roll 1d8 instead of each d6 when an event makes you roll for defender losses. Stock is expended after that event.',
    orders: [
      {
        id: 'stock', label: 'Stock Armory', days: 7, effect: 'armory',
        cost: (b) => { const c = 100 + 100 * totalDefenders(b); return hasFacility(b, 'smithy') ? Math.floor(c / 2) : c; },
        note: '100 GP + 100 GP per Bastion Defender; halved if you have a Smithy.',
        avail: (b) => b.armoryStocked ? 'Armory is already stocked' : '',
      },
    ],
  },
  {
    key: 'barrack', name: 'Barrack', level: 5, prereq: null, space: 'Roomy', hirelings: 1, order: 'Recruit', multiple: true,
    desc: 'Sleeping quarters for up to 12 Bastion Defenders (25 if Vast).',
    passive: 'Track the defenders housed here. Name them as you like.',
    enlarge: { cost: 2000, note: 'Vast: houses up to 25 Bastion Defenders.' },
    orders: [
      {
        id: 'recruit', label: 'Recruit Bastion Defenders (up to 4)', days: 7, cost: 0, effect: 'defenders',
        avail: (b, f) => (f.defenders || 0) >= barrackCap(f) ? 'Barrack is full' : '',
      },
    ],
  },
  {
    key: 'demiplane', name: 'Demiplane', level: 17, prereq: 'arcane', space: 'Vast', hirelings: 1, order: 'Empower',
    desc: 'A door (5 × 10 ft) in one of your facilities leads to an extradimensional stone room only you and your hirelings can open. Can\'t be dispelled.',
    passive: 'Fabrication: as a Magic action in the Demiplane, create a nonmagical object (≤ 5 ft, ≤ 5 GP, simple materials). Once per Long Rest.',
    orders: [
      { id: 'runes', label: 'Arcane Resilience', days: 7, cost: 0, effect: 'note', result: (b) => `Runes active for 7 days: gain ${5 * b.level} Temporary Hit Points after a full Long Rest in the Demiplane` },
    ],
  },
  {
    key: 'gaming-hall', name: 'Gaming Hall', level: 9, prereq: null, space: 'Vast', hirelings: 4, order: 'Trade',
    desc: 'Chess, darts, cards, and dice.',
    passive: '',
    orders: [
      { id: 'gamble', label: 'Gambling Hall', days: 7, cost: 0, effect: 'gaming', note: 'At the end of day 7, roll 1d100 for your share of the house winnings.' },
    ],
  },
  {
    key: 'garden', name: 'Garden', level: 5, prereq: null, space: 'Roomy', hirelings: 1, order: 'Harvest', multiple: true,
    desc: 'Choose a garden type. Changing type takes 21 days with the facility otherwise idle.',
    passive: '',
    options: { garden: true },
    enlarge: { cost: 2000, hirelings: 1, note: 'Vast: counts as two Roomy Gardens (same or different types), each harvesting separately. +1 hireling.' },
    orders: [
      { id: 'growth', label: 'Garden Growth', days: 7, cost: 0, effect: 'garden' },
      {
        id: 'retype', label: 'Change Garden Type', days: 21, cost: 0, effect: 'retype',
        choices: Object.keys(GARDEN_TYPES).map(v => ({ value: v, label: v })),
        note: 'Requires you to be in your Bastion. No other activity here for 21 days. (On a Vast Garden this changes Garden 1.)',
      },
    ],
  },
  {
    key: 'greenhouse', name: 'Greenhouse', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Harvest',
    desc: 'A climate-controlled enclosure for rare plants and fungi.',
    passive: 'Fruit of Restoration: one plant bears three magic fruits (each = Lesser Restoration). Picked fruit loses magic after 24 hours; regrows daily at dawn.',
    orders: [
      { id: 'herbs', label: 'Healing Herbs', days: 7, cost: 0, effect: 'stash', result: 'Potion of Healing (greater)' },
      {
        id: 'poison', label: 'Poison', days: 7, cost: 0, effect: 'stash',
        choices: ['Assassin\'s Blood', 'Malice', 'Pale Tincture', 'Truth Serum'].map(v => ({ value: v, label: v })),
        result: (b, f, d) => `Poison: ${d.choice} (one application, in a vial)`,
      },
    ],
  },
  {
    key: 'guildhall', name: 'Guildhall', level: 17, prereq: 'expertise', space: 'Vast', hirelings: 1, order: 'Recruit',
    desc: 'You are guild master of a guild of ~50 skilled folk living in nearby settlements. The hall is their meeting room.',
    passive: '',
    options: { guild: true },
    orders: [
      { id: 'adventurers', label: 'Assignment: Hunt a Beast', guild: 'Adventurers', days: () => roll(6) + 1, cost: 0, effect: 'stash', topic: 'Target Beast', result: (b, f, d) => `Beast slain or captured${d.topic ? ': ' + d.topic : ''}` },
      {
        id: 'bakers', label: 'Assignment: Prestigious Event', guild: 'Bakers', days: 7, cost: 0, effect: 'bakers',
        choices: [{ value: 'coin', label: '500 GP' }, { value: 'favor', label: 'A favor from the host' }],
      },
      { id: 'brewers', label: 'Assignment: Ale Delivery', guild: 'Brewers', days: 7, cost: 0, effect: 'stash', result: 'Fifty 40-gallon barrels of ale (10 GP each, 500 GP total)' },
      { id: 'masons', label: 'Assignment: Build Defensive Wall', guild: 'Masons', qty: { label: 'Squares', max: 400, each: 0 }, days: (b, f, d) => Math.max(1, d.qty || 1), cost: 0, effect: 'walls' },
      { id: 'shipbuilders', label: 'Assignment: Build Vehicle', guild: 'Shipbuilders', custom: true, customDays: (cost) => Math.max(1, Math.ceil(cost / 1000)), effect: 'stash', note: 'Pay the vehicle\'s full cost. 1 day per 1,000 GP.' },
      { id: 'thieves', label: 'Assignment: Heist', guild: 'Thieves', days: () => roll(6) + 1, cost: 0, effect: 'stash', topic: 'Target object & location', result: (b, f, d) => `Stolen object${d.topic ? ': ' + d.topic : ''} — beware retaliation` },
    ],
  },
  {
    key: 'laboratory', name: 'Laboratory', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Craft',
    desc: 'Storage for alchemical supplies and workspaces for concoctions.',
    passive: '',
    orders: [
      { id: 'alchemy', label: 'Alchemist\'s Supplies item', custom: true, effect: 'stash', note: 'Anything made with Alchemist\'s Supplies per the PHB and DMG ch. 7.' },
      {
        id: 'poison', label: 'Poison (half cost)', days: 7, effect: 'stash',
        choices: [
          { value: 'Burnt Othur Fumes', label: 'Burnt Othur Fumes', cost: 250 },
          { value: 'Essence of Ether', label: 'Essence of Ether', cost: 150 },
          { value: 'Torpor', label: 'Torpor', cost: 300 },
        ],
        cost: (b, f, d) => (d && d.choiceCost) || 0,
        result: (b, f, d) => `Poison: ${d.choice} (one application, in a vial)`,
        note: 'You pay half the poison\'s listed cost.', verify: true,
      },
    ],
  },
  {
    key: 'library', name: 'Library', level: 5, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research',
    desc: 'A book collection with desks and reading chairs.',
    passive: '',
    orders: [
      { id: 'topical', label: 'Topical Lore', days: 7, cost: 0, effect: 'stash', topic: 'Topic (legend, event, place, person, creature, object)', result: (b, f, d) => `Up to 3 new facts about: ${d.topic || 'chosen topic'} (DM decides)` },
    ],
  },
  {
    key: 'meditation', name: 'Meditation Chamber', level: 13, prereq: null, space: 'Cramped', hirelings: 1, order: 'Empower',
    desc: 'A relaxing space that aligns mind, body, and spirit.',
    passive: 'Fortify Self: meditate here for 7 days without leaving to gain Advantage on two random saving throw types for 7 days.',
    fortify: true,
    orders: [
      { id: 'peace', label: 'Inner Peace', days: 7, cost: 0, effect: 'innerPeace', note: 'Next time you roll a Bastion event, roll twice and choose.' },
    ],
  },
  {
    key: 'menagerie', name: 'Menagerie', level: 13, prereq: null, space: 'Vast', hirelings: 2, order: 'Recruit',
    desc: 'Enclosures for up to four Large creatures (four Small/Medium share one Large space).',
    passive: 'Creatures here count as Bastion Defenders unless you exclude them.',
    orders: [
      {
        id: 'creature', label: 'Add Creature', days: 7, effect: 'creature',
        choices: MENAGERIE_CREATURES.map(c => ({ value: c.name, label: `${c.name} (${c.size}, ${c.cost} GP)`, cost: c.cost })),
        cost: (b, f, d) => (d && d.choiceCost) || 0,
        avail: (b, f) => menagerieUsed(f) >= 4 ? 'Menagerie is full' : '',
        note: 'Other Beasts allowed with DM consent — CR 0–1/8: 50, 1/4: 250, 1/2: 500, 1: 1,000, 2: 2,000, 3: 3,500 GP.',
      },
    ],
  },
  {
    key: 'observatory', name: 'Observatory', level: 13, prereq: 'focus', space: 'Roomy', hirelings: 1, order: 'Empower',
    desc: 'A telescope atop your Bastion aimed at Wildspace and the Astral Plane.',
    passive: 'Observatory Charm: after a Long Rest here, gain a Charm (7 days or until used) to cast Contact Other Plane without a spell slot.',
    orders: [
      { id: 'eldritch', label: 'Eldritch Discovery', days: 7, cost: 0, effect: 'observatory', note: '7 nights of stargazing, then roll a die: odd = Charm of Darkvision, Heroism, or Vitality.' },
    ],
  },
  {
    key: 'pub', name: 'Pub', level: 13, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research',
    desc: 'A bar, coffee shop, or tea room. The bartender runs a network of spies in nearby communities who frequent the place incognito.',
    passive: 'Pub Special: one magical beverage on tap (two if Vast). You can switch at the start of a Bastion turn. A pint loses its magic 24 hours after pouring.',
    options: { beverage: true },
    enlarge: { cost: 2000, hirelings: 3, note: 'Vast: two Pub Special beverages on tap; +3 hirelings (servers), for a total of four.' },
    orders: [
      { id: 'info', label: 'Information Gathering', days: 7, cost: 0, effect: 'stash', topic: 'Creature to locate (optional)',
        result: (b, f, d) => `Spy report: important events within 10 miles over the 7 days${d.topic ? `; whereabouts of ${d.topic} (if within 50 miles and not magically hidden) plus where they were the previous 7 days` : ''}`,
        note: 'Spies can also locate a creature familiar to you within 50 miles, unless hidden by magic or out of the network\'s reach.' },
    ],
  },
  {
    key: 'reliquary', name: 'Reliquary', level: 13, prereq: 'divine', space: 'Cramped', hirelings: 1, order: 'Harvest',
    desc: 'A vault of sacred objects.',
    passive: 'Reliquary Charm: after a Long Rest in your Bastion, gain a Charm (7 days or until used) to cast Greater Restoration once without a spell slot or Material components.',
    orders: [
      { id: 'talisman', label: 'Talisman', days: 7, cost: 0, effect: 'stash', result: 'Sacred talisman — replaces one spell\'s Material components costing ≤ 1,000 GP (not consumed); recharge with another Harvest order' },
    ],
  },
  {
    key: 'sacristy', name: 'Sacristy', level: 9, prereq: 'divine', space: 'Roomy', hirelings: 1, order: 'Craft',
    desc: 'A preparation and storage room for sacred items and religious vestments.',
    passive: 'Spell Refreshment: after an entire Short Rest in your Bastion, regain one expended spell slot of level 5 or lower. Once per Long Rest.',
    orders: [
      { id: 'water', label: 'Holy Water', days: 7, qty: { label: 'Extra GP (100s, max 500)', max: 500, step: 100 },
        cost: (b, f, d) => Math.min(500, Math.floor(((d && d.qty) || 0) / 100) * 100), effect: 'stash',
        result: (b, f, d) => { const x = Math.min(5, Math.floor(((d && d.qty) || 0) / 100)); return `Flask of Holy Water${x ? ` (+${x}d8 damage)` : ''}`; },
        note: 'Free; each 100 GP spent (up to 500) adds 1d8 to its damage.' },
      { id: 'relic', label: 'Magic Item (Relic)', minLevel: 9, custom: true, effect: 'stash', note: 'Common or Uncommon from the Relics tables. Time & cost per "Crafting Magic Items" (DMG ch. 7). Spell-casting items: craft it yourself with the spells prepared.' },
    ],
  },
  {
    key: 'sanctuary', name: 'Sanctuary', level: 5, prereq: 'divine', space: 'Roomy', hirelings: 1, order: 'Craft',
    desc: 'Icons of your religion and a quiet place for worship.',
    passive: 'Sanctuary Charm: after a Long Rest in your Bastion, gain a Charm (7 days or until used) to cast Healing Word once without a spell slot.',
    orders: [
      {
        id: 'focus', label: 'Sacred Focus', days: 7, cost: 0, effect: 'stash',
        choices: [{ value: 'Druidic Focus (wooden staff)', label: 'Druidic Focus (wooden staff)' }, { value: 'Holy Symbol', label: 'Holy Symbol' }],
        result: (b, f, d) => d.choice,
      },
    ],
  },
  {
    key: 'sanctum', name: 'Sanctum', level: 17, prereq: 'divine', space: 'Roomy', hirelings: 4, order: 'Empower',
    desc: 'A place of solace and healing.',
    passive: 'Sanctum Charm: after a Long Rest in your Bastion, a Charm (7 days or until used) to cast Heal once without a slot. Sanctum Recall: Word of Recall is always prepared and can target the Sanctum; one arriving creature gains the benefit of Heal.',
    orders: [
      { id: 'rites', label: 'Fortifying Rites', days: 7, cost: 0, effect: 'note', topic: 'Beneficiary', result: (b, f, d) => `Fortifying Rites for ${d.topic || 'you'}: Temporary HP equal to ${b.level} after each Long Rest for 7 days (needn't be in the Bastion)` },
    ],
  },
  {
    key: 'scriptorium', name: 'Scriptorium', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Craft',
    desc: 'Desks and writing supplies.',
    passive: '',
    orders: [
      { id: 'replica', label: 'Book Replica', days: 7, cost: 0, effect: 'stash', topic: 'Nonmagical book to copy', result: (b, f, d) => `Replica of ${d.topic || 'a book'}`, note: 'Requires a blank book.' },
      { id: 'scroll', label: 'Spell Scroll', custom: true, effect: 'stash', verify: true, note: 'Summarized from memory — check the DMG for requirements, time & cost.' },
      { id: 'paper', label: 'Paperwork (broadsheets, pamphlets…)', verify: true, days: 7, qty: { label: 'Copies', max: 50, step: 1 }, cost: (b, f, d) => (d && d.qty) || 0, effect: 'stash', result: (b, f, d) => `${d.qty || 0} printed copies`, note: 'Summarized from memory (≈1 GP per copy, up to 50) — check the DMG.' },
    ],
  },
  {
    key: 'smithy', name: 'Smithy', level: 5, prereq: null, space: 'Roomy', hirelings: 2, order: 'Craft',
    desc: 'A forge, an anvil, and the tools for weapons, armor, and other equipment. Halves the cost of stocking an Armory.',
    passive: '',
    orders: [
      { id: 'smith', label: 'Smith\'s Tools item', custom: true, effect: 'stash', note: 'Anything made with Smith\'s Tools, using the PHB rules.' },
      { id: 'armament', label: 'Magic Item (Armament)', minLevel: 9, custom: true, effect: 'stash', note: 'Common or Uncommon from the Armaments tables. Time & cost per "Crafting Magic Items" (DMG ch. 7). Spell-casting items: craft it yourself with the spells prepared.' },
    ],
  },
  {
    key: 'stable', name: 'Stable', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Trade', multiple: true,
    desc: 'Comes with one Riding Horse or Camel and two Ponies or Mules. Houses three Large animals (two Medium = one Large).',
    passive: 'A mount Beast that spends 14+ days here grants Advantage on Wisdom (Animal Handling) checks made with respect to it.',
    enlarge: { cost: 2000, note: 'Vast: houses six Large animals.' },
    orders: [
      { id: 'animals', label: 'Trade Animals', days: 7, effect: 'trade',
        note: (b) => `Buy or sell mounts at normal cost (PHB Mounts and Other Animals; DM sets availability). Sales earn +${b.level >= 17 ? 100 : b.level >= 13 ? 50 : 20}% over standard price. Enter net GP (negative = spent).` },
    ],
  },
  {
    key: 'storehouse', name: 'Storehouse', level: 5, prereq: null, space: 'Roomy', hirelings: 1, order: 'Trade',
    desc: 'A cool, dark space for trade goods (DMG ch. 7 Trade Goods, PHB ch. 6).',
    passive: '',
    orders: [
      { id: 'goods', label: 'Trade Goods', days: 7, effect: 'trade',
        note: (b) => `Either buy nonmagical goods worth up to ${b.level >= 13 ? '5,000' : b.level >= 9 ? '2,000' : '500'} GP, or sell stored goods at +${b.level >= 17 ? 100 : b.level >= 13 ? 50 : b.level >= 9 ? 20 : 10}% over standard price. Enter net GP (negative = spent).` },
    ],
  },
  {
    key: 'teleport', name: 'Teleportation Circle', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Recruit',
    desc: 'A permanent teleportation circle (as the Teleportation Circle spell) is inscribed on the floor.',
    passive: '',
    orders: [
      { id: 'caster', label: 'Recruit Spellcaster', days: 7, cost: 0, effect: 'teleport',
        note: (b) => `Roll any die: even = a Friendly NPC spellcaster arrives and stays 14 days or until they cast one Wizard spell of level ${b.level >= 17 ? 8 : 4} or lower for you (you pay costly Material components). Won't defend; leaves if the Bastion is attacked.` },
    ],
  },
  {
    key: 'theater', name: 'Theater', level: 9, prereq: null, space: 'Vast', hirelings: 4, order: 'Empower',
    desc: 'A stage, a backstage for props and sets, and seating for a small audience.',
    passive: 'Contribute as Composer/Writer (14 days, before rehearsals), Conductor/Director (stay for the whole production), or Performer (stay for all rehearsals).',
    orders: [
      { id: 'production', label: 'Theatrical Event', days: 14, cost: 0, effect: 'theater', topic: 'Production title',
        note: (b) => `14 days of rehearsal, then 7+ days of performances. Contributors each make a DC 15 Charisma (Performance) check; if more succeed than fail, every contributor gains a Theater die (d${b.level >= 17 ? 10 : b.level >= 13 ? 8 : 6}) to add to one D20 Test. A new die replaces an unspent one.` },
    ],
  },
  {
    key: 'training', name: 'Training Area', level: 9, prereq: null, space: 'Vast', hirelings: 4, order: 'Empower', multiple: true,
    desc: 'A courtyard, gymnasium, dance hall, or gauntlet of traps. One hireling is an expert trainer; the rest are training partners.',
    passive: 'Choose a trainer when added; you can swap trainers each Bastion turn.',
    options: { trainer: true },
    orders: [
      { id: 'train', label: 'Training', days: 7, cost: 0, effect: 'note',
        result: (b, f) => `Training with the ${f.options.trainer || 'trainer'} complete — characters who trained 8 hours each day gain: ${TRAINERS[f.options.trainer] || 'the trainer\'s benefit'} (lasts 7 days)`,
        note: 'Characters must train here 8 hours on each of the 7 days.' },
    ],
  },
  {
    key: 'trophy', name: 'Trophy Room', level: 9, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research',
    desc: 'Mementos: weapons from old battles, mounted heads, dungeon trinkets, and ancestral trophies.',
    passive: '',
    orders: [
      { id: 'lore', label: 'Lore', days: 7, cost: 0, effect: 'stash', topic: 'Topic (legend, creature, famous object)', result: (b, f, d) => `Up to 3 new facts about ${d.topic || 'a topic'} (DM decides)` },
      { id: 'trinket', label: 'Trinket Trophy', days: 7, cost: 0, effect: 'trinket', note: 'Roll any die: even = a magic item from the Implements—Common table (DMG ch. 7).' },
    ],
  },
  {
    key: 'war-room', name: 'War Room', level: 17, prereq: 'fighting', space: 'Vast', hirelings: 2, order: 'Recruit', verify: true,
    desc: 'Where you plan military actions with an inner circle of loyal lieutenants. Hirelings: 2+ (lieutenants add more).',
    passive: 'Lieutenants count as hirelings and can raise soldiers (see DMG).',
    orders: [
      { id: 'lt', label: 'Recruit Lieutenant', days: 7, cost: 0, effect: 'lieutenant', avail: (b, f) => (f.lieutenants || 0) >= 10 ? 'Already 10 lieutenants' : '' },
      { id: 'soldiers', label: 'Raise Soldiers', days: 7, cost: 0, effect: 'note', result: 'Soldiers raised by your lieutenants (see DMG for numbers & upkeep)' },
    ],
  },
  {
    key: 'workshop', name: 'Workshop', level: 5, prereq: null, space: 'Roomy', hirelings: 3, order: 'Craft',
    desc: 'Benches and artisan\'s tools — six kinds chosen when added (nine if Vast).',
    passive: 'Source of Inspiration: after an entire Short Rest in your Workshop, gain Heroic Inspiration. Once per Long Rest.',
    options: { tools: true },
    enlarge: { cost: 2000, hirelings: 2, note: 'Vast: +2 hirelings and three more kinds of Artisan\'s Tools.' },
    orders: [
      { id: 'gear', label: 'Adventuring Gear', custom: true, effect: 'stash', note: 'Anything made with the Workshop\'s chosen tools, using the PHB rules.' },
      { id: 'implement', label: 'Magic Item (Implement)', minLevel: 9, custom: true, effect: 'stash', note: 'Common or Uncommon from the Implements tables. Time & cost per "Crafting Magic Items" (DMG ch. 7). Spell-casting items: craft it yourself with the spells prepared.' },
    ],
  },
];

// ---- Bastion events (d100) ----------------------------------------------
const EVENTS = [
  { max: 50, key: 'allwell', name: 'All Is Well' },
  { max: 55, key: 'attack', name: 'Attack' },
  { max: 58, key: 'criminal', name: 'Criminal Hireling' },
  { max: 63, key: 'opportunity', name: 'Extraordinary Opportunity' },
  { max: 72, key: 'visitors', name: 'Friendly Visitors' },
  { max: 76, key: 'guest', name: 'Guest' },
  { max: 79, key: 'lost', name: 'Lost Hirelings' },
  { max: 83, key: 'magic', name: 'Magical Discovery' },
  { max: 91, key: 'refugees', name: 'Refugees' },
  { max: 98, key: 'aid', name: 'Request for Aid' },
  { max: 100, key: 'treasure', name: 'Treasure' },
];

// Rules text is paraphrased (this repo is public); see the DMG's Bastion events for the full wording.
const ALL_WELL = [
  'Hardly anyone has been hurt on the job lately.',
  'The roof finally stopped leaking.',
  'Not a single rat or roach reported.',
  'A certain someone has misplaced their spectacles yet again.',
  'A hireling has taken in a stray dog.',
  'A friend sent you a warm letter.',
  "A prankster keeps hiding rotten eggs in people's boots.",
  'Somebody swears they saw a ghost.',
];

// Guest (d4). effect: what the app tracks for you.
const GUEST_TABLE = [
  { text: 'A guest of great renown stays 7 days, then leaves you a letter of recommendation (a Mark of Prestige).', effect: 'letter' },
  { text: 'A guest seeking sanctuary from persecution for their beliefs or crimes stays 7 days, and gives you 1d6 × 100 GP before leaving.', effect: 'gift' },
  { text: 'A mercenary guest joins as one extra Bastion Defender. They need no facility, and stay until you send them away or they are killed.', effect: 'mercenary' },
  { text: 'A Friendly monster (a brass dragon or a treant, say) stays as a guest. If the Bastion is attacked meanwhile, it defends it and you lose no Bastion Defenders. It leaves after defending once, or when you send it away.', effect: 'monster' },
];

// Treasure (d100): which DMG chapter 7 table to roll on.
const TREASURE_TABLE = [
  { max: 40, text: 'an art object worth 25 GP (roll on the 25 GP Art Objects table)' },
  { max: 63, text: 'an art object worth 250 GP (roll on the 250 GP Art Objects table)' },
  { max: 73, text: 'an art object worth 750 GP (roll on the 750 GP Art Objects table)' },
  { max: 75, text: 'an art object worth 2,500 GP (roll on the 2,500 GP Art Objects table)' },
  { max: 90, text: 'a Common magic item (roll on a Common Arcana, Armaments, Implements or Relics table of your choice)' },
  { max: 98, text: 'an Uncommon magic item (roll on an Uncommon Arcana, Armaments, Implements or Relics table of your choice)' },
  { max: 100, text: 'a Rare magic item (roll on a Rare Arcana, Armaments, Implements or Relics table of your choice)' },
];

// ---- Eberron: Forge of the Artificer (optional, per Bastion: b.eberron) ------------------
// Off by default. Paraphrased summaries; the book has the full wording. Facilities below carry
// `eberron: true` and only show up once a Bastion turns the Eberron option on.
const EBERRON_SOURCE = 'Eberron: Forge of the Artificer';

const EBERRON_PREREQS = {
  toolsFocus: 'Can use Artisan\'s Tools as a Spellcasting Focus',
  renownHouse10: 'Renown 10+ with a dragonmarked house',
  renownKundarak15: 'Renown 15+ with House Kundarak',
  renownOrien15: 'Renown 15+ with House Orien',
  renownLyrandar25: 'Renown 25+ with House Lyrandar',
};
Object.assign(PREREQS, EBERRON_PREREQS);

const DRAGONMARKED_HOUSES = ['Cannith', 'Deneith', 'Ghallanda', 'Jorasco', 'Kundarak', 'Lyrandar', 'Medani', 'Orien', 'Phiarlan', 'Sivis', 'Tharashk', 'Thuranni', 'Vadalis'];

// Manifest Zone: what the Manifest Charm does, by linked plane (expend the Charm, no action unless noted).
const MANIFEST_PLANES = {
  'Daanvi, the Perfect Order': 'end the Blinded, Deafened, Paralyzed or Poisoned condition on yourself',
  'Dolurrh, the Realm of the Dead': 'cast a Necromancy spell with a spell slot as if the slot were 1 level higher',
  'Fernia, the Sea of Fire': 'cast a spell that deals Fire damage as if its slot were 1 level higher',
  'Irian, the Eternal Dawn': 'cast a healing or Radiant-damage spell as if its slot were 1 level higher',
  'Lamannia, the Twilight Forest': 'cast a spell that conjures or summons a Beast, Elemental or Fey (Conjure Animals, Find Steed, Summon Fey and the like) as if its slot were 1 level higher',
  'Mabar, the Endless Night': 'cast a spell that animates or summons Undead (Animate Dead, Create Undead, Summon Undead) as if its slot were 1 level higher',
  'Risia, the Plain of Ice': 'cast a spell that deals Cold damage as if its slot were 1 level higher',
  'Shavarath, the Battleground': 'on a Critical Hit, deal 10 extra damage of one of the attack\'s damage types',
  'Syrania, the Azure Sky': 'as a Bonus Action, gain a Fly Speed equal to your Speed for 1 minute',
  'Thelanis, the Faerie Court': 'give one target of your Enchantment or Illusion spell Disadvantage on its save against it',
  'Xoriat, the Realm of Delirium': 'when you cast a spell with a spell slot, roll on the Wild Magic Surge table (PHB)',
};

// Museum: Secrets of the Past charms, by the origin of the treasure on display.
const MUSEUM_ORIGINS = {
  Argonnessen: 'you know Draconic; expend it to cast Dragon\'s Breath (level 4 version) on yourself only',
  Ashtakala: 'you know Abyssal and Infernal; expend it to cast Ray of Sickness (level 4 version)',
  Dhakaan: 'you know Goblin; expend it to cast Staggering Smite',
  Khyber: 'you have Darkvision 120 ft.; expend it for Truesight 60 ft. for 1 minute',
  'Xen\'drik': 'you know Giant; expend it as a Bonus Action to make your Strength 25 for 1 hour',
};

const FORGE_CONSTRUCTS = [
  { name: 'Animated Broom', days: 7, cost: 250 },
  { name: 'Animated Flying Sword', days: 7, cost: 250 },
  { name: 'Animated Armor', days: 14, cost: 1000 },
  { name: 'Scarecrow', days: 14, cost: 1000 },
  { name: 'Animated Rug of Smothering', days: 21, cost: 2000 },
  { name: 'Helmed Horror', days: 42, cost: 5000 },
  { name: 'Shield Guardian', days: 63, cost: 25000 },
  { name: 'Warforged Titan', days: 250, cost: 200000, note: 'Stat block in Eberron: Rising from the Last War. Making new ones breaks the Treaty of Thronehold and risks reigniting war across Khorvaire.' },
];

// Helms make a mobile Bastion move. Issuing Travel also makes the DM roll a Bastion event, as if Maintain.
const travelOrder = (how) => ({
  id: 'travel', label: 'Travel', days: (b) => b.turnLength || 7, cost: 0, effect: 'travel', topic: 'Destination',
  note: `The hireling pilots the Bastion toward your destination ${how}, 8 hours a day for the whole Bastion turn, stopping early on arrival or if something stops you. Issuing this order also makes the DM roll a Bastion event, as if you'd issued Maintain.`,
  avail: (b) => (!b.mobile ? 'Only a mobile Bastion can travel' : ''),
});

const EBERRON_FACILITIES = [
  {
    key: 'dragonmark-outpost', name: 'Dragonmark Outpost', level: 5, prereq: 'renownHouse10', space: 'Roomy', hirelings: 1, order: 'Empower', eberron: true,
    desc: 'Space set aside for your dragonmarked house. The hireling is a house agent who liaises with your superiors.',
    passive: 'Adding this facility raises your Renown with your house by 1. Dragonmark Empowerment (needs a Dragonmark feat): after a Long Rest in your Bastion, gain one extra level 2 spell slot, usable only for spells you have prepared from your Dragonmark feat.',
    options: { house: true },
    orders: [
      { id: 'favor', label: 'House Favor', days: 7, cost: 0, effect: 'favor',
        note: 'Call in one benefit your Renown with the house allows (Eberron ch. 5); it doesn\'t count against your usual number of favors. Can\'t be used again until your Renown with the house goes up. (Time isn\'t stated; 7 days assumed.)',
        avail: (b, f) => (f.favorUsed ? 'Already used; available again once your Renown with the house goes up' : '') },
    ],
  },
  {
    key: 'kundarak-vault', name: 'Kundarak Vault', level: 9, prereq: 'renownKundarak15', space: 'Cramped', hirelings: 1, order: 'Trade', eberron: true,
    desc: 'An extradimensional vault for trade goods and treasure. Only you and your hirelings can open its door.',
    passive: 'Kundarak Access: you (and only you) can reach the vault\'s contents from any Kundarak bank, in cities across Khorvaire and in Stormreach.',
    orders: [
      { id: 'goods', label: 'Goods', days: 7, effect: 'trade',
        note: (b) => `Either buy nonmagical items worth up to ${b.level >= 13 ? '5,000' : '2,000'} GP (you pay) and store them in the vault, or sell goods from the vault at +${b.level >= 17 ? 100 : b.level >= 13 ? 50 : 20}% over standard price. Enter net GP (negative = spent).` },
    ],
  },
  {
    key: 'navigators-helm', name: 'Navigator\'s Helm', level: 9, prereq: null, space: 'Cramped', hirelings: 1, order: 'Empower', eberron: true, mobileOnly: true,
    desc: 'Lets a mobile Bastion built in a mundane waterborne vehicle sail.',
    passive: '',
    orders: [travelOrder('at the vessel\'s speed')],
  },
  {
    key: 'orien-helm', name: 'Orien Helm', level: 9, prereq: 'renownOrien15', space: 'Cramped', hirelings: 1, order: 'Empower', eberron: true, mobileOnly: true,
    desc: 'Lets a mobile Bastion built in a Lightning Rail cart travel. The hireling is a dragonmarked heir of House Orien.',
    passive: '',
    orders: [travelOrder('at 30 miles per hour along an existing line of conductor stones')],
  },
  {
    key: 'artificers-forge', name: 'Artificer\'s Forge', level: 13, prereq: 'toolsFocus', space: 'Roomy', hirelings: 2, order: 'Craft', eberron: true,
    desc: 'Two magewright hirelings skilled at making magic items.',
    passive: 'Crafting Assistants: when you craft a magic item in your Bastion (DMG rules), one or both hirelings can help, cutting the time. Charge Refreshment: whenever a magic item in your Bastion regains charges, it regains 1 extra.',
    orders: [
      { id: 'magic', label: 'Magic Item', custom: true, effect: 'stash',
        note: 'A Common or Uncommon magic item of your choice from the DMG. The forge has the tools and the hirelings are proficient with them and with Arcana; the two help each other, so it takes less time than usual. They have any spells the item casts prepared.' },
    ],
  },
  {
    key: 'inquisitive-agency', name: 'Inquisitive Agency', level: 13, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research', eberron: true,
    desc: 'The office of an inquisitive agency (your own, or a branch of one like Information Acquisition or Karr\'Aashta\'s Investigations). The hireling is a secretary with a directory of contacts and agents.',
    passive: 'Mobile Bastion: can\'t Research while traveling; after arriving, the first Research order is 7 days setting up a new network.',
    orders: [
      { id: 'network', label: 'Establish a new network', days: 7, cost: 0, effect: 'network', note: 'After the Bastion has moved, the secretary spends 7 days building contacts in the new place.',
        avail: (b, f) => (!f.needsNetwork ? 'The network here is already set up' : b.travelling ? 'Not while the Bastion is traveling' : '') },
      { id: 'gather', label: 'Information Gathering', days: 7, cost: 0, effect: 'stash', topic: 'Person to investigate',
        result: (b, f, d) => `Report on ${d.topic || 'the person'} (previous 7 days and next 7, within 10 miles): where they stay, what they spend money on, whom they meet, where they showed identification papers. DM may hold back what the agents couldn't learn.`,
        avail: (b, f) => (b.travelling ? 'Not while the Bastion is traveling' : f.needsNetwork ? 'Establish a new network here first' : '') },
    ],
  },
  {
    key: 'lyrandar-helm', name: 'Lyrandar Helm', level: 13, prereq: 'renownLyrandar25', space: 'Cramped', hirelings: 1, order: 'Empower', eberron: true, mobileOnly: true,
    desc: 'Lets a mobile Bastion built in an elemental airship or elemental galleon travel. The hireling is a dragonmarked heir of House Lyrandar; on an airship, the Helm crew station is part of this facility.',
    passive: '',
    orders: [travelOrder('at the vehicle\'s speed')],
  },
  {
    key: 'manifest-zone', name: 'Manifest Zone', level: 13, prereq: 'focus', space: 'Vast', hirelings: 1, order: 'Empower', eberron: true,
    desc: 'Your Bastion is steeped in the energy of one of Eberron\'s planes, chosen when you build it.',
    passive: 'Mobile Bastion: the planar link is suspended while moving. After arriving, the next Empower order spends 7 days making a new link (same plane or another).',
    options: { plane: true },
    orders: [
      { id: 'relink', label: 'Re-establish planar link', days: 7, cost: 0, effect: 'relink', note: 'After the Bastion has moved: 7 days to link to the plane chosen above (you can switch planes first).',
        avail: (b, f) => (!f.needsNetwork ? 'The planar link is intact' : b.travelling ? 'Not while the Bastion is traveling' : '') },
      { id: 'charm', label: 'Manifest Charm', days: 7, cost: 0, effect: 'stash',
        result: (b, f) => `Manifest Charm (${f.options.plane}): ${MANIFEST_PLANES[f.options.plane] || ''}. Lasts until used.`,
        note: '7 days of rites, then you gain a Manifest Charm (a Supernatural Gift) that lasts until you use it. You needn\'t be in the Bastion.',
        avail: (b, f) => (b.travelling ? 'Not while the Bastion is traveling' : f.needsNetwork ? 'Re-establish the planar link first' : '') },
    ],
  },
  {
    key: 'museum', name: 'Museum', level: 13, prereq: null, space: 'Roomy', hirelings: 1, order: 'Research', eberron: true,
    desc: 'Relics and treasures from expeditions you joined or sponsored, catalogued and on display.',
    passive: 'Secrets of the Past: study a treasure here for 7 days, then finish a Long Rest in your Bastion to gain its Charm (7 days or until used). You can\'t gain another while you still have one.',
    options: { origins: true },
    enlarge: { cost: 2000, hirelings: 2, note: 'Vast: display two treasures of different origins; +2 hirelings, for three in total.' },
    orders: [
      { id: 'lore', label: 'Specialized Lore', days: 7, cost: 0, effect: 'stash', topic: 'Question of ancient history',
        result: (b, f, d) => `Specialized lore (as Legend Lore) about ${d.topic || 'a question of ancient history'}; the hireling shares it next time you speak` },
    ],
  },
  {
    key: 'construct-forge', name: 'Construct Forge', level: 17, prereq: 'toolsFocus', space: 'Vast', hirelings: 2, order: 'Recruit', eberron: true,
    desc: 'A forge for building Constructs.',
    passive: 'Constructs made here count as Bastion Defenders (untick one to let it act by its own nature instead; it then can\'t defend).',
    orders: [
      { id: 'construct', label: 'Construct', effect: 'construct',
        choices: FORGE_CONSTRUCTS.map(c => ({ value: c.name, label: `${c.name} (${c.days} days, ${c.cost.toLocaleString()} GP)`, cost: c.cost })),
        cost: (b, f, d) => (d && d.choiceCost) || 0,
        days: (b, f, d) => (FORGE_CONSTRUCTS.find(c => c.name === d?.choice) || { days: 7 }).days,
        note: (b) => 'Warforged Titan: building new ones is illegal under the Treaty of Thronehold.' },
    ],
  },
];
FACILITIES.push(...EBERRON_FACILITIES);
