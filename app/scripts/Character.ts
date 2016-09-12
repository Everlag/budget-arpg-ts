import * as StateMachine from 'state-machine';
import {IDamageMod, DamageModGroup} from './DamageMods';
import {Event} from './ARPGState';
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

    get health(): number {
        // TODO: replace, base on stats and such.
        return 50;
    }
}

class SkillContext {
    constructor(public skill: string, public event: Event) { }

    public cancel() {
        this.event.cancel();
    }
}

// Possible contexts which a state can have.
export type StateContext = SkillContext;

class GlobalContext {
    public health: number;
    public target: CharacterState;

    constructor(base: Character) {
        ({ health: this.health } = base);
    }
}

export class CharacterState implements StateMachine {
    // This preamble has two parts.
    // First, we ensure that the StateMachine interface is implemented
    public current: CharacterStates;
    public is: StateMachineIs;
    public can: StateMachineCan;
    public cannot: StateMachineCan;
    public error: StateMachineErrorCallback;
    public isFinished: StateMachineIsFinished;
    public transition: StateMachineTransition;
    public transitions: StateMachineTransitions;
    // Second, we declare any transitions that are defined below
    // so that they can be called in a type safe manner.
    public engage: (target: CharacterState) => {};
    public disengage: () => {};

    // Context shared across states
    public context: GlobalContext;

    // Per-state context.
    // This is set and cleared when entering or leaving a given state.
    // 
    // This means that event handlers can expect their state to already
    // exist when entering. They need only perform a type assertion.
    private scratch: StateContext;

    constructor(private character: Character) {
        this.context = new GlobalContext(character);
    }

    /** Prepare state for anything happening in the engaged state */
    private onenterengaged() {
        console.log('onenterengaged', this.current);
    }

    /** ... */
    private onbeforeengage() {
        console.log('onbeforeengage', this.current);
    }

    /** Perform actions using pre-prepared state. */
    private onengage(e: string, from: CharacterStates, to: CharacterStates,
        target: CharacterState) {

        this.context.target = target;
    }

    /** Clear state that was prepared and mutated while in engaged */
    private onleaveengaged() {
        console.log('onleaveengaged', this.current);
    }

    private ondecide() {
        console.log('ondecide', this.current);
    }

    // Return the current target this state has
    get target(): CharacterState {
        return this.context.target;
    }
}

export type CharacterStates =
    'idle'
    | 'engaged'
    | 'deciding'

StateMachine.create({
    target: CharacterState.prototype,
    initial: 'idle',
    events: [
        { name: 'engage', from: 'idle', to: 'engaged' },

        { name: 'decide', from: 'engaged', to: 'deciding' },

        { name: 'disengage', from: 'engaged', to: 'idle' },
    ],
});

let basex = new Character(new LoadOut([]), 'badness', 'worseness');
let basey = new Character(new LoadOut([]), 'badness', 'worseness');
let x = new CharacterState(basex);
let y = new CharacterState(basey);
console.log(x);
x.engage(y);
y.engage(x);
// x.disengage();
console.log(x);

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
