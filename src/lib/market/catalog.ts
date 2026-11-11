export interface SeedGift {
  name: string;
  slug: string;
  supply: number;
  baseFloor: number;
  hue: number;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Baseline catalog of Telegram upgradable NFT gifts.
 * Used to seed the database; live floors are then maintained by the
 * monitoring engine via pluggable market providers.
 */
const RAW: Array<[string, number, number, number]> = [
  // [name, supply, baseline floor (TON), accent hue]
  ["Precious Peach", 2882, 61.4, 18],
  ["Durov's Cap", 3202, 34.1, 215],
  ["Astral Shard", 6434, 23.2, 266],
  ["Toy Bear", 9666, 27.1, 26],
  ["Perfume Bottle", 3766, 40.6, 318],
  ["Eternal Rose", 5640, 10.66, 348],
  ["Swiss Watch", 5459, 9.17, 205],
  ["Loot Bag", 7556, 9.88, 262],
  ["Delicious Cake", 62400, 5.12, 24],
  ["Genie Lamp", 4493, 10.8, 152],
  ["Vintage Cigar", 3906, 13.1, 28],
  ["Signet Ring", 7804, 5.65, 222],
  ["Voodoo Doll", 6407, 6.44, 282],
  ["Hypno Lollipop", 5602, 7.05, 301],
  ["Mini Oscar", 4330, 11.83, 38],
  ["Happy Brownie", 9002, 4.67, 20],
  ["Party Sparkler", 11001, 4.48, 46],
  ["Ice Cream", 13004, 4.34, 196],
  ["Top Hat", 5203, 12.87, 264],
  ["Cookie Heart", 8401, 5.58, 332],
  ["Lol Pop", 7300, 6.42, 14],
  ["Desk Calendar", 6802, 5.92, 26],
  ["Love Candle", 4901, 9.69, 352],
  ["Kissing Frog", 4703, 10.92, 132],
  ["Heart Locket", 4502, 12.09, 334],
  ["Ginger Cookie", 10101, 5.27, 22],
  ["Eternal Candle", 6604, 6.89, 42],
  ["Bunny Muffin", 9603, 5.06, 27],
  ["Crystal Ball", 5901, 8.45, 232],
  ["Loving Heart", 8802, 6.0, 350],
  ["Star Notepad", 7400, 6.57, 190],
  ["Ionic Dryer", 4050, 11.9, 202],
  ["Record Player", 5201, 10.34, 100],
  ["Jingle Bells", 11200, 5.88, 200],
  ["Easter Egg", 9402, 6.6, 42],
  ["Santa Hat", 14001, 6.72, 352],
  ["Flying Broom", 5804, 7.93, 264],
  ["Skull Flower", 6101, 7.28, 302],
  ["Winter Wreath", 12002, 5.5, 142],
  ["Spy Agaric", 5370, 8.84, 162],
  ["Snow Globe", 9601, 5.49, 222],
  ["Snow Mittens", 8801, 4.94, 194],
  ["Spiced Wine", 7003, 7.54, 22],
  ["Sleigh Bell", 8102, 6.22, 214],
  ["Heavenly Butter", 3600, 15.2, 46],
  ["Crimson Kicks", 4100, 12.4, 355],
  ["Nebula Helmet", 4400, 10.2, 240],
];

export const SEED_GIFTS: SeedGift[] = RAW.map(([name, supply, baseFloor, hue]) => ({
  name,
  slug: slugify(name),
  supply,
  baseFloor,
  hue,
}));

export const STARS_PER_TON = 235;
