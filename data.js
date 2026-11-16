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

const ALL_WELL = [
  'Accident reports are way down.',
  'The leak in the roof has been fixed.',
  'No vermin infestations to report.',
  'You-Know-Who lost their spectacles again.',
  'One of your hirelings adopted a stray dog.',
  'You received a lovely letter from a friend.',
  'Some practical joker has been putting rotten eggs in people\'s boots.',
  'Someone thought they saw a ghost.',
];

const GUEST_TABLE = [
  'An individual of renown stays for 7 days and speaks well of you.',
  'A foreign dignitary visits seeking shelter or a favor.',
  'A traveling expert lodges here and can share knowledge with you.',
  'A mercenary signs on as a Bastion Defender.',
];
