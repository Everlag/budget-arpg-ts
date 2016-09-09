import {Startup} from './helloWorld';
import {State, Event, GeneralEffect} from './ARPGState';
import {Character,
    Damage, DamageTag, Elements,
    DamageModGroup, ArmorDamageMod, ResistsDamageMod} from './Character';

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

let d = new Damage(new Set([DamageTag.Melee]), 40, 10);

let group = new DamageModGroup([]);
group.add(new ArmorDamageMod(15));
group.add(new ArmorDamageMod(10));
group.add(new ArmorDamageMod(50));
group.add(new ArmorDamageMod(25));
group.add(new ResistsDamageMod(0.4, Elements.Fire));
group.add(new ResistsDamageMod(0.1, Elements.Fire));

let newD = group.apply(d);
console.log(newD);
if (newD.phys !== 32) {
    throw Error('phys is not 32 wtf');
}
if (newD.fire !== 5) {
    throw Error('fire is not 5 wtf');
}

console.log(new Startup());

console.log(new Character());
