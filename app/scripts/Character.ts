// import * as StateMachine from 'state-machine';
import {IDamageMod} from './DamageMods';

export class Character {
    public identity: string;
    public gear: string;
    public skill: string;
    public baseStats: string;
}

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
