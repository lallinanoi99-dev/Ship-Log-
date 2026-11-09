// Everything that talks to BOT Chain (or to the preview simulation).
// Live mode: reads go through the public RPC (no wallet needed); writes go through MetaMask.
// Preview mode (no contract address configured): the same rules run locally in localStorage, seeded with
// clearly-labelled sample builders so Explore and profiles can be tried before deploying.
import { CONFIG } from './config.js';
import { utcDay, weekOf, byteLength, TAGS, replayStreak, reposToString } from './logic.js';

const params = new URLSearchParams(location.search);
const netKey = params.get('net') === 'testnet' ? 'testnet' : 'mainnet';
const NET = { ...CONFIG.networks[netKey], key: netKey };
const SK = CONFIG.storageKey;

// localhost only: deploy.html remembers the address it just deployed; ?rpc=…&contract=… points at a dev chain.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  try {
    if (params.get('rpc') && params.get('contract')) sessionStorage.setItem(`${SK}.dev`, JSON.stringify({ rpc: params.get('rpc'), contract: params.get('contract') }));
    const dev = JSON.parse(sessionStorage.getItem(`${SK}.dev`) || 'null');
    if (dev) { NET.rpc = dev.rpc; NET.contract = dev.contract; }
    else if (!NET.contract) NET.contract = localStorage.getItem(`${SK}.contract.${NET.chainId}`) || '';
  } catch { /* ignore */ }
}

export const MODE = NET.contract && params.get('preview') === null ? 'live' : 'preview';
export { NET };
export const explorerAddress = (a) => `${NET.explorer}/address/${a}`;
export const explorerTx = (h) => `${NET.explorer}/tx/${h}`;
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

const ENTRY = 'tuple(uint32 day,string shipped,string blocked,string next,string link,uint8 tag,uint8 energy,uint16 commits,uint64 at)';
const PROFILE = 'tuple(address who,string handle,string bio,string repos,uint32 lastDay,uint32 streak,uint32 bestStreak,uint32 totalDays,uint32 totalCommits,uint32 freezeWeek,bool hidden)';
const FEED = `tuple(address who,string handle,uint32 index,uint32 streak,bool hidden,${ENTRY} entry)`;
const ABI = [
  'function claimHandle(string,string,string)',
  'function updateProfile(string,string)',
  'function logToday(string,string,string,string,uint8,uint8,uint16)',
  'function setHidden(address,bool)',
  'function curator() view returns (address)',
  'function currentDay() view returns (uint32)',
  'function stats() view returns (uint256,uint256)',
  'function addrOfHandle(string) view returns (address)',
  `function getProfile(address) view returns (${PROFILE})`,
  `function getEntries(address,uint256,uint256) view returns (${ENTRY}[])`,
  `function getBuilders(uint256,uint256) view returns (${PROFILE}[])`,
  `function getFeed(uint256,uint256) view returns (${FEED}[])`,
  'event HandleClaimed(address indexed who, string handle)',
  'event Logged(address indexed who, uint32 indexed day, uint8 tag, uint16 commits, uint32 streak)',
  'error BadHandle()', 'error HandleTaken()', 'error TooLong()', 'error NoHandle()', 'error EmptyShipped()',
  'error BadTag()', 'error BadEnergy()', 'error NotCurator()',
];

// ------------------------------------------------------------------ events
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => [...listeners].forEach((fn) => fn(what));

export const wallet = { account: '', chainOk: true, hasWallet: typeof window.ethereum !== 'undefined' };

export class ChainError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const MESSAGES = {
  BadHandle: 'Handles are 3–20 characters: a–z, 0–9 and _.',
  HandleTaken: 'That handle is taken — try another.',
  TooLong: 'Something is too long — shorten it and try again.',
  NoHandle: 'Pick a handle first.',
  EmptyShipped: 'Write one line about what you shipped.',
  BadTag: 'Pick a tag.',
  BadEnergy: 'Pick your energy.',
  NotCurator: 'Only the curator can do that.',
  rejected: 'Cancelled in MetaMask — nothing was sent. You can try again.',
  noWallet: 'Install MetaMask to start your log.',
  wrongNetwork: 'Switch to BOT Chain to continue.',
  failed: 'The transaction failed — try again.',
};
const fail = (code, extra) => { throw new ChainError(code, MESSAGES[code] || extra || 'Something went wrong.'); };

// ------------------------------------------------------------------ decoding
// note: read by position — ethers results have a built-in .at() method that shadows a field called `at`
const num = Number;
const decodeEntry = (e) => ({ day: num(e[0]), shipped: e[1], blocked: e[2], next: e[3], link: e[4], tag: num(e[5]), energy: num(e[6]), commits: num(e[7]), at: num(e[8]) });
const decodeProfile = (p) => ({ who: p[0], handle: p[1], bio: p[2], repos: p[3], lastDay: num(p[4]), streak: num(p[5]), bestStreak: num(p[6]), totalDays: num(p[7]), totalCommits: num(p[8]), freezeWeek: num(p[9]), hidden: !!p[10] });
const decodeFeed = (f) => ({ who: f[0], handle: f[1], index: num(f[2]), streak: num(f[3]), hidden: !!f[4], entry: decodeEntry(f[5]) });

// ------------------------------------------------------------------ clock (preview can skip days)
const offsetDays = () => { try { return MODE === 'preview' ? Number(sessionStorage.getItem(`${SK}.offset`) || 0) : 0; } catch { return 0; } };
export const nowMs = () => Date.now() + offsetDays() * 86_400_000;
export const today = () => utcDay(nowMs());
export function skipPreviewDay() { try { sessionStorage.setItem(`${SK}.offset`, String(offsetDays() + 1)); } catch { /* ignore */ } emit('clock'); }
export function resetPreviewClock() { try { sessionStorage.removeItem(`${SK}.offset`); } catch { /* ignore */ } emit('clock'); }
export const previewOffset = offsetDays;

// ================================================================== LIVE
let ethersReady;
export function loadEthers() {
  if (window.ethers) return Promise.resolve(window.ethers);
  ethersReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.5/ethers.umd.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.ethers);
    s.onerror = () => { ethersReady = null; reject(new Error('Could not load ethers.js')); };
    document.head.append(s);
  });
  return ethersReady;
}

let reader;
async function readContract() {
  if (reader) return reader;
  const { JsonRpcProvider, Contract } = await loadEthers();
  reader = new Contract(NET.contract, ABI, new JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true }));
  return reader;
}

const live = {
  async stats() { const [b, e] = await (await readContract()).stats(); return { builders: num(b), entries: num(e) }; },
  async curator() { return (await readContract()).curator(); },
  async addrOfHandle(h) { const a = await (await readContract()).addrOfHandle(h); return /^0x0{40}$/i.test(a) ? '' : a; },
  async getProfile(a) { return decodeProfile(await (await readContract()).getProfile(a)); },
  async getEntries(a) {
    const c = await readContract(); const out = [];
    for (let from = 0; ; from += 200) {
      const page = (await c.getEntries(a, from, 200)).map(decodeEntry);
      out.push(...page);
      if (page.length < 200) return out;
    }
  },
  async getBuilders() {
    const c = await readContract(); const out = [];
    for (let from = 0; ; from += 200) {
      const page = (await c.getBuilders(from, 200)).map(decodeProfile);
      out.push(...page);
      if (page.length < 200) return out;
    }
  },
  async getFeed(skip, count) { return (await (await readContract()).getFeed(skip, count)).map(decodeFeed); },
  async send(method, args, onSent) {
    const signer = await signerFor();
    const c = new (window.ethers.Contract)(NET.contract, ABI, signer);
    try {
      const est = await c[method].estimateGas(...args); // surfaces custom errors before MetaMask opens
      // buffer: a log estimated just before 00:00 UTC (an update) may land after it (a new entry, which costs more)
      const tx = await c[method](...args, { gasLimit: (est * 3n) / 2n + 150_000n });
      onSent?.(tx.hash);
      const receipt = await tx.wait();
      if (receipt.status !== 1) fail('failed');
      const logs = receipt.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
      return { hash: tx.hash, logs };
    } catch (e) { throw liveError(e, c.interface); }
  },
};

function liveError(e, iface) {
  if (e instanceof ChainError) return e;
  if (e.code === 'ACTION_REJECTED' || e.code === 4001 || e.info?.error?.code === 4001) return new ChainError('rejected', MESSAGES.rejected);
  const name = e.revert?.name || (() => { try { return iface.parseError(e.data)?.name; } catch { return null; } })();
  if (name && MESSAGES[name]) return new ChainError(name, MESSAGES[name]);
  return new ChainError('failed', e.shortMessage || e.message || MESSAGES.failed);
}

async function switchChain() {
  const chainId = '0x' + NET.chainId.toString(16);
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (e) {
    const unknown = e.code === 4902 || e?.data?.originalError?.code === 4902 || /unrecognized chain/i.test(e.message || '');
    if (!unknown) throw e;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId, chainName: NET.name, nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 }, rpcUrls: [NET.rpc], blockExplorerUrls: [NET.explorer] }],
    });
  }
}
export async function switchNetwork() {
  if (MODE === 'preview') return;
  try { await switchChain(); } catch (e) { if (e.code === 4001) fail('rejected'); fail('wrongNetwork'); }
  await refreshChain();
  emit('wallet');
}
async function refreshChain() {
  if (!window.ethereum) return;
  const id = await ethereum.request({ method: 'eth_chainId' });
  wallet.chainOk = parseInt(id, 16) === NET.chainId;
}
async function signerFor() {
  if (!window.ethereum) fail('noWallet');
  const { BrowserProvider } = await loadEthers();
  if (!wallet.account) await connect();
  if (!wallet.chainOk) { await switchNetwork(); if (!wallet.chainOk) fail('wrongNetwork'); }
  return new BrowserProvider(window.ethereum).getSigner();
}

// ================================================================== PREVIEW
const PKEY = `${SK}.preview.v1`;
export const PREVIEW_WALLET = '0x' + 'b0b'.padEnd(39, '0') + '1';
const fakeHash = () => '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const blankProfile = (who) => ({ who, handle: '', bio: '', repos: '', lastDay: 0, streak: 0, bestStreak: 0, totalDays: 0, totalCommits: 0, freezeWeek: 0, hidden: false });

// Sample builders (preview only — the yellow bar says so). Deterministic so reloads look the same.
function seed() {
  const t = utcDay();
  let r = 7;
  const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const samples = [
    { handle: 'mika_builds', bio: 'Indie hacker. Shipping a habit app in public.', repos: 'mika/habitly', streakDays: 23, density: 0.85, lines: ['Onboarding flow v2 with a progress bar', 'Fixed the streak reset bug at midnight', 'Push reminders behind a feature flag', 'Landing page copy rewrite', 'Stripe test checkout working'] },
    { handle: 'priya_ships', bio: 'Designer who codes. Building a font pairing tool.', repos: 'priya/pairfont', streakDays: 11, density: 0.7, lines: ['Type scale preview with live sliders', 'Exported pairs as CSS variables', 'Dark mode for the playground', 'Wrote docs for the API', 'Figma plugin prototype'] },
    { handle: 'devon', bio: 'Learning Solidity one contract at a time.', repos: 'devon/solidity-days', streakDays: 6, density: 0.5, lines: ['Wrote my first ERC-20 tests', 'Read about storage layout and packed my structs', 'Deployed a counter to testnet', 'Learned how events are indexed', 'Gas golfed a loop'] },
    { handle: 'lena_codes', bio: 'Building a recipe scaler for home bakers.', repos: 'lena/scaler', streakDays: 2, density: 0.6, lines: ['Unit conversions for grams and cups', 'Shareable recipe links', 'Fixed rounding on tiny amounts', 'Print layout for recipes', 'Launched on Product Hunt'] },
    { handle: 'tomas_dev', bio: 'Weekend game dev. Pixel art + tiny engines.', repos: 'tomas/pixel-engine,tomas/sprites', streakDays: 0, density: 0.4, lines: ['Tilemap collisions', 'Sprite sheet packer', 'Sound effects for jumping', 'Save slots', 'Screen shake (tasteful)'] },
  ];
  const s = { profiles: {}, order: [], entries: {}, feed: [] };
  samples.forEach((b, bi) => {
    const who = '0x' + (bi + 1).toString(16).padStart(4, '0').padEnd(40, 'a');
    const days = [];
    const lastLogged = b.streakDays ? t - 1 + (bi === 3 ? 1 : 0) : t - 5;
    for (let d = t - 200; d <= lastLogged; d++) {
      const inStreak = b.streakDays && d > lastLogged - b.streakDays;
      if (inStreak || rand() < b.density * 0.6) days.push(d);
    }
    const entries = days.map((d, i) => {
      const tag = d === t && bi === 3 ? 4 : rand() < 0.08 ? 5 : Math.floor(rand() * 4);
      return { day: d, shipped: tag === 5 ? 'Rest day — went for a long walk' : b.lines[i % b.lines.length], blocked: rand() < 0.3 ? 'Flaky CI on the test runner' : '', next: b.lines[(i + 1) % b.lines.length], link: '', tag, energy: Math.floor(rand() * 3), commits: tag === 5 ? 0 : Math.floor(rand() * rand() * 14), at: d * 86400 + 60 * 60 * (9 + Math.floor(rand() * 12)) };
    });
    const st = replayStreak(days);
    s.profiles[who] = { ...blankProfile(who), handle: b.handle, bio: b.bio, repos: b.repos, lastDay: st.lastDay, streak: st.streak, bestStreak: st.best, freezeWeek: st.freezeWeek, totalDays: entries.length, totalCommits: entries.reduce((n, e) => n + e.commits, 0) };
    s.order.push(who);
    s.entries[who] = entries;
  });
  // feed: every entry in time order, with the streak at the time
  const all = [];
  for (const who of s.order) {
    const days = [];
    s.entries[who].forEach((e, index) => { days.push(e.day); all.push({ who, index, at: e.at, streak: replayStreak(days).streak }); });
  }
  all.sort((a, b) => a.at - b.at);
  s.feed = all.map(({ who, index, streak }) => ({ who, index, streak }));
  s.curator = PREVIEW_WALLET;
  return s;
}
const pload = () => { try { return JSON.parse(localStorage.getItem(PKEY) || 'null') || seed(); } catch { return seed(); } };
const psave = (s) => { try { localStorage.setItem(PKEY, JSON.stringify(s)); } catch { /* ignore */ } };
export function resetPreview() { try { localStorage.removeItem(PKEY); sessionStorage.removeItem(`${SK}.offset`); } catch { /* ignore */ } emit('clock'); }

const preview = {
  async stats() { const s = pload(); return { builders: s.order.length, entries: s.feed.length }; },
  async curator() { return pload().curator; },
  async addrOfHandle(h) { const s = pload(); return s.order.find((a) => s.profiles[a].handle === h) || ''; },
  async getProfile(a) { const s = pload(); const key = Object.keys(s.profiles).find((k) => sameAddr(k, a)); return key ? { ...s.profiles[key] } : blankProfile(a); },
  async getEntries(a) { const s = pload(); const key = Object.keys(s.entries).find((k) => sameAddr(k, a)); return key ? s.entries[key].map((e) => ({ ...e })) : []; },
  async getBuilders() { const s = pload(); return s.order.map((a) => ({ ...s.profiles[a] })); },
  async getFeed(skip, count) {
    const s = pload();
    return s.feed.slice().reverse().slice(skip, skip + count).map((f) => ({ who: f.who, handle: s.profiles[f.who].handle, index: f.index, streak: f.streak, hidden: s.profiles[f.who].hidden, entry: { ...s.entries[f.who][f.index] } }));
  },
  async send(method, args, onSent) {
    if (!wallet.account) await connect();
    const s = pload(); const me = wallet.account;
    const now = Math.floor(nowMs() / 1000); const d = utcDay(nowMs());
    const p = s.profiles[me] || blankProfile(me);
    let log;
    if (method === 'claimHandle') {
      const [h, bio, repos] = args;
      if (!/^[a-z0-9_]{3,20}$/.test(h)) fail('BadHandle');
      const owner = s.order.find((a) => s.profiles[a].handle === h);
      if (owner && !sameAddr(owner, me)) fail('HandleTaken');
      if (byteLength(bio) > 400 || byteLength(repos) > 300) fail('TooLong');
      if (!p.handle) s.order.push(me);
      Object.assign(p, { handle: h, bio, repos });
      s.profiles[me] = p;
      log = { name: 'HandleClaimed', args: { handle: h } };
    } else if (method === 'updateProfile') {
      if (!p.handle) fail('NoHandle');
      const [bio, repos] = args;
      if (byteLength(bio) > 400 || byteLength(repos) > 300) fail('TooLong');
      Object.assign(p, { bio, repos });
    } else if (method === 'logToday') {
      const [shipped, blocked, next, link, tag, energy, commits] = args;
      if (!p.handle) fail('NoHandle');
      if (!shipped) fail('EmptyShipped');
      if (byteLength(shipped) > 560 || byteLength(blocked) > 400 || byteLength(next) > 400 || byteLength(link) > 200) fail('TooLong');
      if (!(tag >= 0 && tag < TAGS.length)) fail('BadTag');
      if (!(energy >= 0 && energy < 3)) fail('BadEnergy');
      const list = (s.entries[me] ||= []);
      const entry = { day: d, shipped, blocked, next, link, tag, energy, commits, at: now };
      if (p.lastDay === d) {
        p.totalCommits += commits - list[list.length - 1].commits;
        list[list.length - 1] = entry;
      } else {
        let st = 1;
        if (p.lastDay && p.lastDay + 1 === d) st = p.streak + 1;
        else if (p.lastDay && p.lastDay + 2 === d) {
          const w = weekOf(d - 1) + 1;
          if (p.freezeWeek !== w) { p.freezeWeek = w; st = p.streak + 1; }
        }
        p.streak = st; p.bestStreak = Math.max(p.bestStreak, st); p.lastDay = d; p.totalDays += 1; p.totalCommits += commits;
        list.push(entry);
        s.feed.push({ who: me, index: list.length - 1, streak: st });
      }
      log = { name: 'Logged', args: { streak: p.streak, day: d } };
    } else if (method === 'setHidden') {
      if (!sameAddr(me, s.curator)) fail('NotCurator');
      const [who, value] = args;
      const key = Object.keys(s.profiles).find((k) => sameAddr(k, who));
      if (key) s.profiles[key].hidden = value;
    }
    const hash = fakeHash();
    onSent?.(hash);
    await pause(900);
    psave(s);
    return { hash, logs: log ? [log] : [] };
  },
};

const impl = () => (MODE === 'live' ? live : preview);

// ================================================================== public API
export async function connect() {
  if (MODE === 'preview') {
    wallet.account = PREVIEW_WALLET;
    wallet.chainOk = true;
    try { sessionStorage.setItem(`${SK}.pw`, '1'); } catch { /* ignore */ }
    emit('wallet');
    return wallet.account;
  }
  if (!window.ethereum) fail('noWallet');
  let accounts;
  try { accounts = await ethereum.request({ method: 'eth_requestAccounts' }); } catch (e) { if (e.code === 4001) fail('rejected'); throw e; }
  wallet.account = accounts[0] || '';
  await refreshChain();
  if (!wallet.chainOk) { try { await switchNetwork(); } catch { /* the UI offers "Switch to BOT Chain" */ } }
  emit('wallet');
  return wallet.account;
}
export function disconnectPreview() {
  try { sessionStorage.removeItem(`${SK}.pw`); } catch { /* ignore */ }
  wallet.account = '';
  emit('wallet');
}
export async function initWallet() {
  if (MODE === 'preview') {
    try { if (sessionStorage.getItem(`${SK}.pw`)) await connect(); } catch { /* ignore */ }
    return;
  }
  if (!window.ethereum) return;
  try {
    const accounts = await ethereum.request({ method: 'eth_accounts' });
    wallet.account = accounts[0] || '';
    await refreshChain();
  } catch { /* ignore */ }
  ethereum.on?.('accountsChanged', (a) => { wallet.account = a[0] || ''; emit('wallet'); });
  ethereum.on?.('chainChanged', async () => { await refreshChain(); emit('wallet'); });
  emit('wallet');
}

export const stats = () => impl().stats();
export const curator = () => impl().curator();
export const getProfile = (a) => impl().getProfile(a);
export const getEntries = (a) => impl().getEntries(a);
export const getBuilders = () => impl().getBuilders();
export const getFeed = (skip = 0, count = 60) => impl().getFeed(skip, count);
export async function profileByHandle(h) {
  const a = await impl().addrOfHandle(h);
  return a ? impl().getProfile(a) : null;
}

export async function claimHandle(handle, bio, repos, onSent) {
  const r = await impl().send('claimHandle', [handle, bio, reposToString(repos)], onSent); emit('data'); return r;
}
export async function updateProfile(bio, repos, onSent) {
  const r = await impl().send('updateProfile', [bio, reposToString(repos)], onSent); emit('data'); return r;
}
export async function logToday(e, onSent) {
  const r = await impl().send('logToday', [e.shipped, e.blocked, e.next, e.link, e.tag, e.energy, e.commits], onSent);
  emit('data');
  return r;
}
export async function setHidden(who, value, onSent) { const r = await impl().send('setHidden', [who, value], onSent); emit('data'); return r; }
