import * as StateMachine from 'state-machine';
import {IDamageMod, DamageModGroup, DamageModDirection} from './DamageMods';
import {Event, State} from './ARPGState';
import {ISkill} from './Skill';
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
     * Create an array of DamageMods from this LoadOut
     *
     * This is typically used to seed the initial DamageModGroup for a hit.
     */
    public getMods(): Array<IDamageMod> {
        return this.gear.reduce((prev, g): Array<IDamageMod> => {
            prev.push(...g.mods);
            return prev;
        }, []);
    }

    /** Get the gear in the provided slot or null if none exist */
    public getSlot(slot: GearSlot): Gear {
        let filtered = this.gear.filter(g => g.slot === slot);
        if (filtered.length === 1) {
            return filtered[0];
        }
        return null;
    }
}

export class Character {
    public identity: string;
    constructor(public loadout: LoadOut,
        public skill: ISkill,
        public baseStats: string) {

        this.identity = entityCode();
    }

    /** 
     * Return a DamageModGroup representing the entire
     * set of Damage modifiers that this Character can have.
     */
    public getMods(): Array<IDamageMod> {
        // TODO: include passives and such
        return this.loadout.getMods();
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
    public decide: () => {};
    public startskill: () => {};
    public endskill: () => {};
    public die: () => {};

    // Context shared across states
    public context: GlobalContext;

    // Per-state context.
    // This is set and cleared when entering or leaving a given state.
    // 
    // This means that event handlers can expect their state to already
    // exist when entering. They need only perform a type assertion.
    private scratch: StateContext;

    constructor(private character: Character, public state: State) {
        this.context = new GlobalContext(character);
    }

    public applySkill(target: CharacterState, state: State) {
        // Create a DamageModGroup to hold our actions
        let mods = new DamageModGroup();
        // Add our mods as the damage Dealer
        this.character.getMods().forEach(mod => {
            mods.add(mod, DamageModDirection.Dealing);
        });
        // Add our target's mods as the damage Taker
        target.character.getMods().forEach(mod => {
            mods.add(mod, DamageModDirection.Taking);
        });

        // Pass the DamageModGroup off to the skill for execution
        // and execute the results.
        this.character.skill.execute(target, this, mods)
            .forEach(result => result.execute(target, state));
    }

    /** Prepare state for anything happening in the engaged state */
    private onenterengaged() {
        console.log('onenterengaged', this.current);
    }

    /** Perform actions using pre-prepared state. */
    private onengage(e: string, from: CharacterStates, to: CharacterStates,
        target: CharacterState) {

        // Set target 
        this.context.target = target;

        // Decide how to proceed
        this.decide();
    }

    private ondecide() {
        // Check if target dead yet
        if (this.target.isDead) {
            this.disengage();
        }

        // Use the skill on the target
        // TODO: schedule skill...

        console.log('ondecide', this.current);
    }

    /**
     * This CharacterState goes into the unrecoverable state of 'dead'
     *
     * NOTE: it is expected that 'oneleaveSTATE' handlers will take care
     * of canceling any events which need to be canceled and similar.
     */
    private ondie() {
        console.log('ondie', this.current);
    }

    // Return the current target this state has
    get target(): CharacterState {
        return this.context.target;
    }

    // Return the current target this state has
    get isDead(): Boolean {
        return this.is('dead');
    }
}

export type CharacterStates =
    'idle'
    | 'engaged'
    | 'deciding'
    | 'skillwait'
    | 'dead'

StateMachine.create({
    target: CharacterState.prototype,
    initial: 'idle',
    events: [
        { name: 'engage', from: 'idle', to: 'engaged' },

        { name: 'decide', from: 'engaged', to: 'deciding' },

        { name: 'startskill', from: 'deciding', to: 'skillwait' },
        { name: 'endskill', from: 'skillwait', to: 'engaged' },

        { name: 'disengage', from: 'engaged', to: 'idle' },

        { name: 'die', from: '*', to: 'dead' },
    ],
});
