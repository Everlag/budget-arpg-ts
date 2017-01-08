import { record, state } from './Recording';
import { TicksPerSecond } from './ARPGState';
import {
    Character, LoadOut, Gear, GearSlot,
} from './Character';
import { CharacterState } from './CharacterState';
import { Elements } from './Damage';
import { Pack, PackInit } from './Pack';
import { Position } from './Movement';
import { StateSerial } from './Serial';
import { snapshot } from './Snapshot';
import { renderVue } from './visualize';
import { prep, bootstrapState, update } from './fancyvis';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';
import * as StatMods from './StatMods';
import * as Skills from './Skill';
import * as Behaviors from './BehaviorRegistry';

import { interval } from 'd3-timer';

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
    new Gear(GearSlot.Boots, [], []),
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
        new Position(75), new Behaviors.StrafingRanged()),
    new PackInit(baseTrash,
        new Position(90), new Behaviors.AgressiveNaiveMelee()),
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

/** Register all actie Packs */
let packs = [x, y];

// record.runForDuration(TicksPerSecond * 0.5);
let events = record.popImplicitEventsTill(record.now);
let snap = snapshot(record.now, events, packs);

let lossy = JSON.parse(snap);
console.log('lossy', lossy);

let graphConf = prep();
bootstrapState(graphConf, lossy);
update(graphConf, lossy);

// let mount = renderVue();

let finish = () => {
    let end = performance.now();
    let delta = end - start;
    console.log(`took ${delta.toFixed(2)}ms for ${state.now} ticks`);
    let effSpeedup = (state.now / TicksPerSecond) / (delta / 1000);
    console.log(`effective speedup=${(effSpeedup).toFixed(2)} vs desired=${speedup}`);

    console.log(x.states.map(c => c.Position.loc), y.states.map(c => c.Position.loc));
    let healthDiff = (c: CharacterState) => c.context.baseStats.health - c.context.health;
    console.log(x.states.map(c => healthDiff(c)), y.states.map(c => healthDiff(c)));

    timer.stop();
};

let log = console.log;
console.log = ()=>{};

let frameRunning = false;

function runFrame() {

    if(frameRunning) {
        log('frame already in progress on call to runFrame');
        return;
    }
    frameRunning = true;

    let start = performance.now();

    // Run for a duration and get back tick-time we managed to reach
    let when = record.runForDuration(snapshotTime, speedup);
    // Pop all the implicit events we care about
    let events = record.popImplicitEventsTill(when);
    // Take a snapshot
    let snap = snapshot(record.now, events, packs);

    // Update the model
    // 
    // Yes, I know we don't need to serialize then deserialize but
    // this is preparing for later when we will need to.
    // mount.$data.state = JSON.parse(snap);

    // Update the d3 visualization only if there are events to display
    // 
    // At some point, this will be handled by vue...
    let parsed:StateSerial = JSON.parse(snap);
    if(parsed.events.length !== 0) {
        console.log('handling event count=', parsed.events.length);
        update(graphConf, parsed);
        // If a pack is dead, we're done
        if (packs.some(p => p.isDead)) {
            finish();
            return;
        }
    }

    let end = performance.now();
    let delta = end - start;
    if(delta > 10) {
        log('all updates took', delta);
    }

    frameRunning = false;

    // Run the next frame
    // requestAnimationFrame(runFrame);
}

// runFrame();

let timer = interval(runFrame, 16);
