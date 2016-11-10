import * as StateMachine from 'state-machine';
import { IDamageMod, DamageModGroup, DamageModDirection } from './DamageMods';
import { Stats, StatModGroup, baseStatsArg, IStatMod } from './StatMods';
import { Event, State } from './ARPGState';
import { ISkill, SkillTiming } from './Skill';
import { Pack, IBehavior } from './Pack';
import { Position } from './Movement';
import { entityCode } from './random';

export const enum GearSlot {
    Chest = 0,
    Boots,
    Gloves,
    Helmet,
    Weapon,
}

export class Gear {
    constructor(public slot: GearSlot,
        public damageMods: Array<IDamageMod>,
        public statMods: Array<IStatMod>) { }
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
            prev.push(...g.damageMods);
            return prev;
        }, (<Array<IDamageMod>>[]));
    }

    /**
     * Create an array of StatMods from this LoadOut
     *
     * This is typically used to seed the initial StatModGroup.
     */
    public getStatMods(): Array<IStatMod> {
        return this.gear.reduce((prev, g): Array<IStatMod> => {
            prev.push(...g.statMods);
            return prev;
        }, (<Array<IStatMod>>[]));
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

    /**
     * Return computed stats for this Character.
     */
    get stats(): Stats {
        // Fetch baseline from gear
        let base = this.loadout.getStatMods();
        // TODO: include passives and such
        // Factor in the skill's modifier to execution time
        base.push(this.skill.timeMod);

        // Create a new group
        let group = new StatModGroup();
        base.forEach(mod => group.add(mod));

        return group.apply(new Stats(baseStatsArg));
    }
}

class SkillContext {
    public skill: ISkill;
    public event: Event;

    public cancel() {
        this.event.cancel();
    }
}

// Possible contexts which a state can have.
export type StateContext = SkillContext;

class GlobalContext {
    /** Current stats */
    public stats: Stats;
    /** 
     * Baseline stats to check as necessary
     * ie, for maximum health
     */
    public baseStats: Stats;
    public skill: ISkill;
    public target: Pack;
    public behavior: IBehavior;
    public position: Position;

    constructor(base: Character,
        initPosition: Position, behavior: IBehavior) {
        // Calculate base stats once
        let baseStats: Stats;
        ({ stats: baseStats, skill: this.skill } = base);
        // Assign our base and freeze it to prevent modification
        this.baseStats = baseStats.clone();
        Object.freeze(this.baseStats);
        // Assign our temporary stats
        this.stats = baseStats.clone();
        // Assign our behavior
        this.behavior = behavior;
        // And our position
        this.position = initPosition;
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
    public engage: (target: Pack) => {};
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
    private scratch: StateContext | null;

    constructor(private character: Character,
        public state: State, initPosition: Position, behavior: IBehavior) {
        behavior.setState(this);
        this.context = new GlobalContext(character, initPosition, behavior);
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
        console.log('onenterengaged', this.current, this.scratch);
    }

    /** Perform actions using pre-prepared state. */
    private onengage(e: string, from: CharacterStates, to: CharacterStates,
        target: Pack) {

        // Set target 
        this.context.target = target;

        // Decide how to proceed
        this.decide();
    }

    private ondecide() {
        // Check if target dead yet
        if (this.target && this.target.isDead) {
            this.disengage();
            return;
        }
        console.log('ondecide', this.current);

        // Start using a skill to hit the target
        this.startskill();
    }

    private onenterskillwait() {
        console.log('onenterskillwait', this.current);
        this.scratch = new SkillContext();
    }

    private onstartskill() {
        console.log('onstartskill', this.current, this.scratch);
        if (!this.scratch) throw 'onstartskill without scratch';

        // Schedule skill for completion
        let waitTime: number;
        switch (this.context.skill.timingBy) {
            case SkillTiming.Attack:
                waitTime = this.context.stats.attackTime;
                break;
            case SkillTiming.Attack:
                waitTime = this.context.stats.castTime;
                break;
            default:
                throw Error('fell through timingBy switch');
        }
        console.log(this.state);
        let e = new Event(this.state.now + waitTime,
            (state: State): Event | null => {
                this.endskill();
                return null;
            }, null);

        this.scratch.event = e;
        this.scratch.skill = this.context.skill;

        this.state.addEvent(e);
    }

    /**
     * Actually perform the skill
     *
     * NOTE: this is a before handler rather than exact on
     *       as this preserves the scratch.
     */
    private onbeforeendskill() {
        console.log('onbeforeendskill', this.current, this.scratch);
        this.applySkill(this.target, this.state);
    }

    /**
     * Handle follow up for performing a skill.
     *
     * NOTE: skill was executed in onbefore handler for endskill.
     */
    private onendskill() {
        this.decide();
    }

    private onleaveskillwait() {
        console.log('oneleaveskillwait', this.current);
        if (!this.scratch) throw 'onleaveskillwait without scratch';
        // Cancel any event if not executed
        let {event} = this.scratch;
        if (!event.wasExecuted) event.cancel();
        // Zero scratch
        this.scratch = null;
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
        return this.context.behavior.getTarget(this.context.target);
    }

    // Return the current target this state has
    get isDead(): boolean {
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

        { name: 'disengage', from: ['deciding', 'engaged'], to: 'idle' },

        { name: 'die', from: '*', to: 'dead' },
    ],
});
