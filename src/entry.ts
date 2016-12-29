import { State, TicksPerSecond } from './ARPGState';
import {
    Character, LoadOut, Gear, GearSlot,
} from './Character';
import { CharacterState } from './CharacterState';
import { Elements } from './Damage';
import { Pack, PackInit } from './Pack';
import { Position } from './Movement';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';
import * as StatMods from './StatMods';
import * as Skills from './Skill';
import * as Behaviors from './BehaviorRegistry';

let start = performance.now();

const globalState = new State();

/* tslint:disable */
(<any>window).globalState = globalState;
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

let x = new Pack(xInit, globalState);
let y = new Pack(yInit, globalState);

x.engage(y);
y.engage(x);

// Keep track of the timings for interesting ticks
let tickTimes: Array<Number> = [];

/* tslint:disable */
(<any>window).x = x;
(<any>window).y = y;
(<any>window).tickTimes = tickTimes;
/* tslint:enable */

// x.disengage();
console.log(x);

let totalEvents = 0;

// Simulate 1 minute of combat
for (let i = 0; i < TicksPerSecond * 60 && !(x.isDead || y.isDead); i++) {
    let tickStart = performance.now();
    let completed = globalState.step();
    let tickEnd = performance.now();
    if (completed > 0) {
        console.log(`retired ${completed} events`);
        totalEvents += completed;
        tickTimes.push(tickEnd - tickStart);
    }
}

let end = performance.now();
console.log(`took ${(end - start).toFixed(2)}ms for ${globalState.now} ticks with ${totalEvents} events`);

console.log(x.states.map(c => c.Position.loc), y.states.map(c => c.Position.loc));
let healthDiff = (c: CharacterState) => c.context.baseStats.health - c.context.health;
console.log(x.states.map(c => healthDiff(c)), y.states.map(c => healthDiff(c)));
