import {Startup} from './helloWorld';
import {State, Event, GeneralEffect} from './ARPGState';
import {Character, LoadOut} from './Character';
import {Damage, DamageTag, Elements} from './Damage';
import {DamageModGroup, DamageModDirection} from './DamageMods';
import * as DamageMods from './DamageModRegistry';
import * as SeedRandom from 'seedrandom';

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

let group = new DamageModGroup([]);
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
console.log(Math.random());

console.log(new Startup());

console.log(new Character(new LoadOut([]), 'basic attack', 'bad stats'));

let end = performance.now();
console.log(`took ${(end - start).toFixed(2)}ms`);
