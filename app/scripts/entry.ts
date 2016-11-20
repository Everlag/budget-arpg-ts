import { State, TicksPerSecond, Event } from './ARPGState';
import {
    Character, CharacterState, LoadOut, Gear, GearSlot,
} from './Character';
import { Damage, DamageTag, Elements } from './Damage';
import { DamageModGroup, DamageModDirection } from './DamageMods';
import { Pack, PackInit } from './Pack';
import { Position } from './Movement';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';
import * as StatMods from './StatMods';
import * as Skills from './Skill';
import * as Behaviors from './BehaviorRegistry';

let start = performance.now();

export class Orange {
    public flavor: string;
    constructor(flavor: string) {
        this.flavor = flavor;
    }
}

const globalState = new State();

let nextEvent = new Event(0,
    (state: State) => null,
    (state: State) => null);
globalState.addEvent(nextEvent);

console.log('for fucks sake this works!');

/* tslint:disable */
(<any>window).globalState = globalState;
/* tslint:enable */

let d = new Damage(new Set([DamageTag.Melee]), 40, 10, 0, 10);

let group = new DamageModGroup();
group.add(new DamageMods.Armor(15), DamageModDirection.Taking);
group.add(new DamageMods.Armor(10), DamageModDirection.Taking);
group.add(new DamageMods.Armor(50), DamageModDirection.Taking);
group.add(new DamageMods.Armor(25), DamageModDirection.Taking);
group.add(new DamageMods.Resistance(0.4, Elements.Fire),
    DamageModDirection.Taking);
group.add(new DamageMods.Resistance(0.1, Elements.Fire),
    DamageModDirection.Taking);
group.add(new DamageMods.Resistance(0.75, Elements.Cold),
    DamageModDirection.Taking);

let newD = group.apply(d);
console.log(newD);
if (newD.phys !== 32) {
    throw Error('phys is not 32 wtf');
}
if (newD.fire !== 5) {
    throw Error('fire is not 5 wtf');
}

SeedRandom('testing!', { global: true });

let basicLoadout = new LoadOut([
    new Gear(GearSlot.Gloves, [
        new DamageMods.LocalPhysical(2, 3),
        new DamageMods.LocalPhysical(2, 7),
        new DamageMods.Armor(10),
        new DamageMods.Armor(10),
        new DamageMods.IncreasedCritChance(0.50),
    ],
        [
            new StatMods.FlatAddedHealth(120),
        ]),
    new Gear(GearSlot.Boots, [],
        [
            new StatMods.IncreasedMovespeed(0.25),
        ]),
]);

let trashLoadout = new LoadOut([
    new Gear(GearSlot.Gloves, [
        new DamageMods.LocalPhysical(1, 2),
        new DamageMods.LocalPhysical(2, 3),
        new DamageMods.Armor(4),
    ],
        [
            new StatMods.FlatAddedHealth(4),
        ]),
    new Gear(GearSlot.Boots, [],
        [
            new StatMods.IncreasedMovespeed(0.5),
        ]),
]);

let basex = new Character(basicLoadout, new Skills.TossedBlade(), 'worseness');

let baseTrash = new Character(trashLoadout,
    new Skills.TossedBlade(), 'worseness');

let xInit = [
    new PackInit(basex, new Position(-100), new Behaviors.AgressiveNaiveMelee()),
];
let yInit = [
    new PackInit(baseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
    new PackInit(baseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
    new PackInit(baseTrash,
        new Position(100), new Behaviors.AgressiveNaiveMelee()),
];

let x = new Pack(xInit, globalState);
let y = new Pack(yInit, globalState);

console.log(x);
x.engage(y);
y.engage(x);

/* tslint:disable */
(<any>window).x = x;
(<any>window).y = y;
/* tslint:enable */

// x.disengage();
console.log(x);

// Simulate 1 minute of combat
for (let i = 0; i < TicksPerSecond * 6 && !(x.isDead || y.isDead); i++) {
    let completed = globalState.step();
    if (completed > 0) {
        console.log('apples', x.states.map(c => c.Position.loc));
        console.log(`retired ${completed} events`);
    }
}

let end = performance.now();
console.log(`took ${(end - start).toFixed(2)}ms`);

console.log(x.states.map(c => c.Position.loc), y.states.map(c => c.Position.loc));
let healthDiff = (c: CharacterState) => c.context.baseStats.health - c.context.stats.health;
console.log(x.states.map(c => healthDiff(c)), y.states.map(c => healthDiff(c)));
