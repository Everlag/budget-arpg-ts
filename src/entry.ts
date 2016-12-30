import { record, state } from './Recording';
import {
    Character, LoadOut, Gear, GearSlot,
} from './Character';
import { CharacterState } from './CharacterState';
import { Elements } from './Damage';
import { Pack, PackInit } from './Pack';
import { Position } from './Movement';
import { snapshot } from './Snapshot';
import { renderVue } from './visualize';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';
import * as StatMods from './StatMods';
import * as Skills from './Skill';
import * as Behaviors from './BehaviorRegistry';

let start = performance.now();

/* tslint:disable */
(<any>window).globalState = state;
(<any>window).record = record;
/* tslint:enable */

SeedRandom('testing!', { global: true });

let basicLoadout = new LoadOut([
    new Gear(GearSlot.Gloves, [
        new DamageMods.LocalElement(2, 3, Elements.Fire),
        new DamageMods.LocalPhysical(3, 4),
        new DamageMods.LocalPhysical(2, 7),
        new DamageMods.Armor(10),
        new DamageMods.Armor(10),
        new DamageMods.Resistance(0.75, Elements.Fire),
        new DamageMods.IncreasedCritChance(0.50),
        new DamageMods.IncreasedMeleeElement(0.90, Elements.Fire),
    ],
        [
            new StatMods.FlatAddedHealth(120),
        ]),
    new Gear(GearSlot.Boots, [],
        [
            new StatMods.IncreasedMovespeed(0.25),
        ]),
    new Gear(GearSlot.Helmet, [
        new DamageMods.Resolve(0.15),
        new DamageMods.AllLeechedAsLife(0.03),
    ],
        [
            new StatMods.FlatAddedMana(20),
        ]),
]);

let trashLoadout = new LoadOut([
    new Gear(GearSlot.Gloves, [
        // new DamageMods.LocalFire(1, 3),
        new DamageMods.LocalElement(3, 4, Elements.Cold),
        new DamageMods.LocalElement(1, 1, Elements.Fire),
        new DamageMods.LocalElement(0, 2, Elements.Fire),
        new DamageMods.LocalPhysical(2, 3),
        new DamageMods.Armor(4),
        new DamageMods.ReducedBurnDuration(0.8),
        new DamageMods.Reflexes(30),
        // These should have no effect 
        new DamageMods.IncreasedMeleePhysical(1.0),
        new DamageMods.ElementLeechedAsLife(0.9, Elements.Light),
    ],
        [
            new StatMods.FlatAddedHealth(4),
        ]),
    new Gear(GearSlot.Boots, [],
        [
            new StatMods.IncreasedMovespeed(0.5),
        ]),
]);

let coldTrashLoadout = new LoadOut([
    new Gear(GearSlot.Gloves, [
        new DamageMods.LocalElement(4, 7, Elements.Cold),
        new DamageMods.IncreasedMeleeElement(0.45, Elements.Cold),
        new DamageMods.Armor(10),
    ],
        [
            new StatMods.FlatAddedHealth(4),
        ]),
]);

let basex = new Character(basicLoadout, new Skills.GroundSmash(), 'worseness');

let baseTrash = new Character(trashLoadout,
    new Skills.TossedBlade(), 'worseness');
let coldBaseTrash = new Character(coldTrashLoadout,
    new Skills.BasicAttack(), 'worseness');

let xInit = [
    new PackInit(basex, new Position(-100), new Behaviors.GreedyNaiveAoE()),
];
let yInit = [
    new PackInit(baseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
    new PackInit(baseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
    new PackInit(coldBaseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
];

let x = new Pack(xInit, state);
let y = new Pack(yInit, state);

x.engage(y);
y.engage(x);

// Keep track of the timings for interesting ticks
let tickTimes: Array<Number> = [];

/* tslint:disable */
(<any>window).x = x;
(<any>window).y = y;
(<any>window).tickTimes = tickTimes;
/* tslint:enable */

/** 16ms between snapshots ~ 1 frame at 60fps */
let snapshotTime = 16 / 1000;
/** Work faster than realtime */
let speedup = 5;

/** Simulate up to a total of 60 seconds */
let duration = 60;

/** How many snapshots we take for a given amount of time */
let snapshotCount = duration / snapshotTime;

/** Register all actie Packs */
let packs = [x, y];

/** Serialized snapshots */
let snapshots: Array<string> = [];

// Simulate 1 minute of combat taking a snapshot every frameTime
// with a speedup.
// 
// We also exit if any of the packs involved are dead yet
// TODO: this only handle two confronting Packs, handle more?
for (let i = 0; i < snapshotCount && !packs.some(p => p.isDead); i++) {
    // Run for a duration and get back tick-time we managed to reach
    let when = record.runForDuration(snapshotTime, speedup);
    // Pop all the implicit events we care about
    let events = record.popImplicitEventsTill(when);
    // Take a snapshot
    let snap = snapshot(record.now, events, packs);
    // Record the snapshot
    snapshots.push(snap);
}

let end = performance.now();
console.log(`took ${(end - start).toFixed(2)}ms for ${state.now} ticks`);

(<any>window).snapshots = snapshots;

console.log(x.states.map(c => c.Position.loc), y.states.map(c => c.Position.loc));
let healthDiff = (c: CharacterState) => c.context.baseStats.health - c.context.health;
console.log(x.states.map(c => healthDiff(c)), y.states.map(c => healthDiff(c)));

renderVue();
