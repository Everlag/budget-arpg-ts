import {State, Event} from './ARPGState';
import {Character, CharacterState, LoadOut, Gear, GearSlot} from './Character';
import {Damage, DamageTag, Elements} from './Damage';
import {DamageModGroup, DamageModDirection} from './DamageMods';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';
import * as StatMods from './StatMods';
import * as Skills from './Skill';

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
(<any>window).namespace = globalState;
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
    ],
        [
            new StatMods.FlatAddedHealth(10),
        ]),
]);

let basex = new Character(basicLoadout, new Skills.BasicAttack(), 'worseness');
let basey = new Character(basicLoadout, new Skills.TossedBlade(), 'worseness');
let x = new CharacterState(basex, globalState);
let y = new CharacterState(basey, globalState);
console.log(x);
x.engage(y);
y.engage(x);

x.applySkill(y, globalState);
console.log(y.context);

/* tslint:disable */
(<any>window).x = x;
(<any>window).y = y;
/* tslint:enable */

// x.disengage();
console.log(x);

let end = performance.now();
console.log(`took ${(end - start).toFixed(2)}ms`);
