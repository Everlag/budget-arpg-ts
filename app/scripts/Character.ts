// import * as StateMachine from 'state-machine';
import {IDamageMod, DamageModGroup} from './DamageMods';
import {entityCode} from './random';


export const enum GearSlot {
    Chest = 0,
    Boots,
    Gloves,
    Helmet,
    Weapon,
}

export class Gear {
    constructor(public slot: GearSlot,
        public mods: Array<IDamageMod>) { }
}

export class LoadOut {
    constructor(public gear: Array<Gear>) {
        // Ensure each piece of gear is sitting in a different slot
        let usedSlots = new Set<GearSlot>();
        let overlaps = gear.some(g => {
            if (usedSlots.has(g.slot)) return true;
            usedSlots.add(g.slot);
            return false;
        });

        if (overlaps) throw Error('multiple gear items in same slot');
    }

    /**
     * Create a DamageModGroup from this LoadOut
     *
     * This is typically used to seed the initial DamageModGroup for a hit.
     */
    public getMods(): DamageModGroup {
        let mods = this.gear.reduce((prev, g): Array<IDamageMod> => {
            prev.push(...g.mods);
            return prev;
        }, []);
        return new DamageModGroup(mods);
    }
}

export class Character {
    public identity: string;
    constructor(public loadout: LoadOut,
        public skill: string,
        public baseStats: string) {

        this.identity = entityCode();
    }
}

export class CharacterState {
    constructor() {
        throw Error('badness not impleented');
    }
}
// export class Orange implements StateMachine {
//     public flavor: string;
//     public current: string;
//     constructor(flavor: string) {
//         this.flavor = flavor;
//     }
// }

// interface IApples extends StateMachine {
//     warn?: StateMachineEvent;
//     panic?: StateMachineEvent;
//     calm?: StateMachineEvent;
//     clear?: StateMachineEvent;
// }

// let fsm: IApples = StateMachine.create({
//     initial: 'green',
//     events: [
//         { name: 'warn', from: 'green', to: 'yellow' },
//         { name: 'panic', from: 'yellow', to: 'red' },
//         { name: 'calm', from: 'red', to: 'yellow' },
//         { name: 'clear', from: 'yellow', to: 'green' },
//     ],
//     callbacks: {
//         onpanic: function(event?, from?, to?, msg?) { console.log('apples'); },
//         onclear: function(event?, from?, to?, msg?) { console.log('cleared'); },
//         ongreen: function(event?, from?, to?) { document.body.className = 'green'; },
//         onyellow: function(event?, from?, to?) { document.body.className = 'yellow'; },
//         onred: function(event?, from?, to?) { document.body.className = 'red'; },
//     },
// });

// fsm.warn();
// fsm.panic();

// console.log('we were executed!');

// export = fsm;

console.log('Character.ts was executed completely!');
