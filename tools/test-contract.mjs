// Runs the compiled ShipLog contract on an in-memory chain and checks every rule in the PRD (section 5),
// including day rollovers, streaks and the weekly freeze (time travel with evm_increaseTime).
// Usage (from the project root): node tools/compile.mjs && node tools/test-contract.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ganache from 'ganache';
import * as ethers from 'ethers';
import { replayStreak, liveStreak, weekOf, weekday } from '../assets/logic.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { abi, bytecode } = JSON.parse(readFileSync(join(root, 'build/ShipLog.json'), 'utf8'));
// Start on a Monday at 10:00 UTC so week boundaries are predictable: 2026-11-09 is a Monday.
const start = new Date('2026-11-09T10:00:00Z');
const chain = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'merge', chainId: 677, time: start }, wallet: { totalAccounts: 4 } });
const provider = new ethers.BrowserProvider(chain);
const [alice, bob, carol] = await Promise.all([0, 1, 2].map((i) => provider.getSigner(i)));
const c = await (await new ethers.ContractFactory(abi, bytecode, alice).deploy()).waitForDeployment();
const as = (s) => c.connect(s);
const reverts = (call, name) => assert.rejects(call, (e) => e.revert?.name === name || (e.message || '').includes(name), `expected ${name}`);
const days = async (n) => { await provider.send('evm_increaseTime', [n * 86400]); await provider.send('evm_mine', []); };
const today = async () => Number(await c.currentDay());
const log = (s, shipped = 'Shipped a thing', tag = 0, commits = 0) => as(s).logToday(shipped, '', '', '', tag, 1, commits, { gasLimit: 3_000_000 }).then((t) => t.wait());
let checks = 0;
const ok = (label) => { checks++; console.log(`  ✓ ${label}`); };

console.log('ShipLog contract');
assert.deepEqual([...(await c.stats())], [0n, 0n]);
assert.equal(await c.curator(), alice.address);
assert.equal(Number(await c.weekOf(await today())), weekOf(await today()));
assert.equal(weekday(await today()), 1); // the chain clock starts on a Monday
ok('deploys with empty stats; deployer is curator; weekOf matches the app');

// --- handles
await reverts(as(alice).claimHandle.staticCall('ab', '', ''), 'BadHandle');
await reverts(as(alice).claimHandle.staticCall('a'.repeat(21), '', ''), 'BadHandle');
await reverts(as(alice).claimHandle.staticCall('Alice', '', ''), 'BadHandle');
await reverts(as(alice).claimHandle.staticCall('al-ice', '', ''), 'BadHandle');
await reverts(as(alice).claimHandle.staticCall('alice', 'x'.repeat(401), ''), 'TooLong');
await reverts(as(alice).logToday.staticCall('hi', '', '', '', 0, 1, 0), 'NoHandle');
await reverts(as(alice).updateProfile.staticCall('bio', ''), 'NoHandle');
ok('handle must be 3–20 chars of a–z 0–9 _; logging and profile edits need a handle');

let rc = await (await as(alice).claimHandle('alice_01', 'I build things', 'alice/pixel-pals,alice/ship-log')).wait();
assert.equal(c.interface.parseLog(rc.logs[0]).name, 'HandleClaimed');
assert.equal(await c.addrOfHandle('alice_01'), alice.address);
assert.equal(await c.handleOf(alice.address), 'alice_01');
await reverts(as(bob).claimHandle.staticCall('alice_01', '', ''), 'HandleTaken');
await (await as(bob).claimHandle('bob', '', '')).wait();
await (await as(alice).claimHandle('alice', 'new bio', 'alice/pixel-pals')).wait(); // rename frees the old one
assert.equal(await c.addrOfHandle('alice_01'), ethers.ZeroAddress);
assert.equal(await c.addrOfHandle('alice'), alice.address);
await (await as(carol).claimHandle('alice_01', '', '')).wait();
await (await as(alice).claimHandle('alice', 'same handle again', '')).wait(); // re-claiming your own is fine
assert.equal(Number((await c.stats())[0]), 3);
await (await as(alice).updateProfile('final bio', 'alice/pixel-pals')).wait();
const pa = await c.getProfile(alice.address);
assert.equal(pa.handle, 'alice'); assert.equal(pa.bio, 'final bio'); assert.equal(pa.repos, 'alice/pixel-pals');
ok('handles are unique; renaming frees the old handle; builders counted once; bio + repos update');

// --- logging + validation
await reverts(as(alice).logToday.staticCall('', '', '', '', 0, 1, 0), 'EmptyShipped');
await reverts(as(alice).logToday.staticCall('x'.repeat(561), '', '', '', 0, 1, 0), 'TooLong');
await reverts(as(alice).logToday.staticCall('ok', '', '', 'h'.repeat(201), 0, 1, 0), 'TooLong');
await reverts(as(alice).logToday.staticCall('ok', '', '', '', 6, 1, 0), 'BadTag');
await reverts(as(alice).logToday.staticCall('ok', '', '', '', 0, 3, 0), 'BadEnergy');
ok('entry checks: shipped required, length caps, tag 0–5, energy 0–2');

const d0 = await today();
rc = await (await as(alice).logToday('Added wallet connect', 'RPC timeouts', 'Deploy to mainnet', 'https://x.com/a/1', 0, 2, 3)).wait();
const ev = c.interface.parseLog(rc.logs[0]);
assert.equal(ev.name, 'Logged');
assert.deepEqual([...ev.args].map(String), [alice.address, String(d0), '0', '3', '1']);
// same day again → update, no new entry
await (await as(alice).logToday('Added wallet connect + switch network', '', 'Deploy', '', 4, 1, 5)).wait();
assert.equal(Number(await c.entryCountOf(alice.address)), 1);
let p = await c.getProfile(alice.address);
assert.equal(Number(p.totalDays), 1); assert.equal(Number(p.totalCommits), 5); assert.equal(Number(p.streak), 1); assert.equal(Number(p.lastDay), d0);
let e = (await c.getEntries(alice.address, 0, 10))[0];
assert.equal(e.shipped, 'Added wallet connect + switch network'); assert.equal(Number(e.tag), 4); assert.equal(Number(e.commits), 5); assert.equal(Number(e.day), d0);
assert.equal(Number((await c.stats())[1]), 1);
ok('first log → day 1; a second log the same day updates it (commits total adjusted, no new entry)');

// --- streaks
await days(1); await log(alice); // Tue → 2
await days(1); await log(alice); // Wed → 3
p = await c.getProfile(alice.address);
assert.equal(Number(p.streak), 3); assert.equal(Number(p.bestStreak), 3);
await days(2); await log(alice); // skip Thu, log Fri → freeze → 4
p = await c.getProfile(alice.address);
assert.equal(Number(p.streak), 4); assert.equal(Number(p.freezeWeek), weekOf((await today()) - 1) + 1);
await days(2); await log(alice); // skip Sat, log Sun — same week, freeze used → reset
p = await c.getProfile(alice.address);
assert.equal(Number(p.streak), 1); assert.equal(Number(p.bestStreak), 4);
ok('consecutive days +1; one missed day a week is bridged by a freeze; a second miss that week resets');

await days(2); await log(alice, 'new week', 5); // skip Mon (new week), log Tue → freeze again → 2
p = await c.getProfile(alice.address);
assert.equal(Number(p.streak), 2);
await days(3); await log(alice); // two missed days → reset
p = await c.getProfile(alice.address);
assert.equal(Number(p.streak), 1); assert.equal(Number(p.totalDays), 7);
ok('freeze resets weekly (Monday UTC); two missed days always reset; Resting days count');

// replay in JS matches the chain
const list = await c.getEntries(alice.address, 0, 50);
const r = replayStreak(list.map((x) => Number(x.day)));
p = await c.getProfile(alice.address);
assert.equal(r.streak, Number(p.streak)); assert.equal(r.best, Number(p.bestStreak)); assert.equal(r.freezeWeek, Number(p.freezeWeek));
const now = await today();
assert.equal(liveStreak({ lastDay: Number(p.lastDay), streak: 1, freezeWeek: Number(p.freezeWeek) }, now).state, 'today');
ok('the app’s replayStreak gives the same streak, best and freeze as the contract');

// --- feed, builders, pagination
await log(bob, 'bob day 1', 4, 2);
const feed = await c.getFeed(0, 3);
assert.equal(feed.length, 3);
assert.equal(feed[0].who, bob.address); assert.equal(feed[0].handle, 'bob'); assert.equal(feed[0].entry.shipped, 'bob day 1'); assert.equal(Number(feed[0].streak), 1);
assert.equal(feed[1].who, alice.address); assert.equal(Number(feed[1].index), 6);
assert.equal((await c.getFeed(100, 5)).length, 0);
assert.equal((await c.getFeed(7, 5)).length, 1); // 8 entries total
assert.deepEqual([...(await c.stats())].map(Number), [3, 8]);
const b = await c.getBuilders(0, 10);
assert.deepEqual(b.map((x) => x.handle), ['alice', 'bob', 'alice_01']);
assert.equal((await c.getEntries(alice.address, 5, 10)).length, 2);
assert.equal((await c.getEntries(alice.address, 50, 10)).length, 0);
ok('feed is newest first with handle + streak; builders list; entries and feed paginate');

// --- curator
await reverts(as(bob).setHidden.staticCall(bob.address, true), 'NotCurator');
await (await as(alice).setHidden(bob.address, true)).wait();
assert.equal((await c.getFeed(0, 1))[0].hidden, true);
assert.equal((await c.getProfile(bob.address)).hidden, true);
await reverts(as(bob).setCurator.staticCall(bob.address), 'NotCurator');
await (await as(alice).setCurator(carol.address)).wait();
await (await as(carol).setHidden(bob.address, false)).wait();
assert.equal(await c.hidden(bob.address), false);
ok('only the curator hides builders (Explore only — entries stay); curator can hand over');

// --- gas
const g1 = await as(carol).logToday.estimateGas('x'.repeat(140), 'y'.repeat(100), 'z'.repeat(100), 'https://example.com/' + 'a'.repeat(60), 0, 1, 12);
console.log(`\n${checks} checks passed · logToday (full entry) ≈ ${Number(g1).toLocaleString()} gas`);
