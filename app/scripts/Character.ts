import * as StateMachine from 'state-machine';
import { IDamageMod, DamageModGroup, DamageModDirection } from './DamageMods';
import { Stats, StatModGroup, baseStatsArg, IStatMod } from './StatMods';
import { Event, State, MoveTime } from './ARPGState';
import { ISkill, SkillTiming } from './Skill';
import { Pack, Action, IBehavior } from './Pack';
import { Position, MovementDirection } from './Movement';
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

/** Interface all CharacterState contexts must satisfy */
interface IContext {
    /** Event associated with this context */
    event: Event;
    /** Cancel current event */
    cancel(): void;
}

class SkillContext implements IContext {
    public skill: ISkill;
    public target: CharacterState;
    public event: Event;

    public cancel() {
        this.event.cancel();
    }
}

class MoveContext implements IContext {
    /** Target the move is resolving relative to */
    public target: CharacterState;
    /** Event resolving upon the completion of the move */
    public event: Event;
    /** Direction moved relative to the target */
    public direction: MovementDirection;

    /** Multiplier in {-1, 1} applied to movement */
    public moveCoeff: number;
    /** When the movement started */
    public start: number;

    public cancel() {
        // TODO: interpolate to position reached.
        this.event.cancel();
    }
}

// Possible contexts which a state can have.
export type StateContext = IContext;

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
    public startmove: () => {};
    public endmove: () => {};
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

    public applySkill(target: CharacterState, skill: ISkill, state: State) {
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

        // Add a copy of the skill's RangeMod with appropriate distance set
        let rangeBy = skill.rangeBy.clone();
        rangeBy.distance = target.Position.distanceTo(this.Position);
        mods.add(rangeBy, DamageModDirection.Dealing);

        // Pass the DamageModGroup off to the skill for execution
        // and execute the results.
        skill.execute(target, this, mods)
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
        // Check if target entirely dead yet
        if (this.context.target && this.context.target.isDead) {
            this.disengage();
            return;
        }
        console.log('ondecide', this.current);

        let {behavior} = this.context;
        switch (behavior.getAction(this.context.target)) {
            case Action.NOP:
                // This should never be the case after the check
                // for the target pack.
                throw Error('behavior desires NOP in decide');
            case Action.Skill:
                this.startskill();
                break;
            case Action.Move:
                this.startmove();
                break;
            default:
                throw Error('fell through behavior switch');

        }
    }

    private onenterskillwait() {
        console.log('onenterskillwait', this.current);
        this.scratch = new SkillContext();
    }

    private onstartskill() {
        console.log('onstartskill', this.current, this.scratch);
        if (!(this.scratch instanceof SkillContext)) {
            throw 'onstartskill without scratch';
        }

        // Choose a target
        let target = this.targetCharacter;
        if (target === null) {
            // Decide again if we can't get a target
            this.decide();
            return;
        }
        this.scratch.target = target;

        // Schedule skill for completion
        let waitTime: number;
        switch (this.context.skill.timingBy) {
            case SkillTiming.Attack:
                waitTime = this.context.stats.attackTime;
                break;
            case SkillTiming.Spell:
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
        if (!(this.scratch instanceof SkillContext)) {
            throw 'onstartskill without scratch';
        }
        console.log('onbeforeendskill', this.current, this.scratch);
        this.applySkill(this.scratch.target, this.scratch.skill, this.state);
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

    private onentermoving() {
        console.log('onentermoving', this.current);
        this.scratch = new MoveContext();
    }

    private onstartmove() {
        console.log('onstartmove', this.current, this.scratch);
        if (!(this.scratch instanceof MoveContext)) {
            throw 'onstartmove without scratch';
        }

        // Query behavior for best target and direction to
        // travel in order to reach that target.
        let { behavior } = this.context;
        let target = behavior.getTarget(this.context.target);
        if (!target) throw Error('null target in onstartmove');
        let { direction, duration } = behavior.getMoveOrder(target);

        // Determine Coefficient we move with on the
        // line that is our reality
        let moveCoeff = this.Position.coeffRelative(target.Position,
            this.context.stats.movespeed, direction);
        this.scratch.direction = direction;
        this.scratch.moveCoeff = moveCoeff;

        // Schedule an event to complete the move
        let e = new Event(this.state.now + duration,
            (state: State): Event | null => {
                this.endmove();
                return null;
            }, null);

        this.scratch.start = this.state.now;
        this.scratch.event = e;

        console.log(this.scratch);

        this.state.addEvent(e);
    }

    /**
     * Actually apply the movement
     *
     * NOTE: this is a before handler rather than exact on
     *       as this preserves the scratch.
     */
    private onbeforeendmove() {
        if (!(this.scratch instanceof MoveContext)) {
            throw 'onbeforeendmove without scratch';
        }
        console.log('onbeforeendmove', this.current, this.scratch);
        // Set new position to resolved position
        this.context.position = this.Position;
    }

    /**
     * Handle follow up for applying a move permanently.
     *
     * NOTE: move was applied in onbefore handler for endmove.
     */
    private onendmove() {
        this.decide();
    }

    private onleavemoving() {
        console.log('onleavemoving', this.current);
        if (!this.scratch) throw 'onleavemoving without scratch';
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

    /**
     * Return a chosen target to attack
     */
    get targetCharacter(): CharacterState | null {
        return this.context.behavior.getTarget(this.context.target);
    }

    /**
     * Return the current position of the Character
     *
     * When moving, this handles interpolating current position
     * based on movement speed.
     */
    get Position(): Position {
        // Handle easy case of not moving
        if (!this.is('moving')) return this.context.position;

        // We need to interpolate based on current position
        if (!(this.scratch instanceof MoveContext)) {
            throw Error('interpolating Position without scratch');
        }

        let { moveCoeff, start } = this.scratch;
        let { movespeed } = this.context.stats;
        let { now } = this.state;
        // There is the possibility that this is called when constructing
        // the initial MoveContext, so we handle that.
        if (moveCoeff == null || start == null) return this.context.position;
        // Calculate distance travelled
        let travelled = moveCoeff * movespeed * (now - start);
        // Apply as an offset to the starting position.
        if (isNaN(travelled)) throw Error('interpolated position NaN');
        // Return a new position while ensuring that it cannot exit
        // the allowed bounds.
        return new Position(this.context.position.loc + travelled).clamp();
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
    | 'moving'
    | 'dead'

StateMachine.create({
    target: CharacterState.prototype,
    initial: 'idle',
    events: [
        { name: 'engage', from: 'idle', to: 'engaged' },

        { name: 'decide', from: 'engaged', to: 'deciding' },

        { name: 'startskill', from: 'deciding', to: 'skillwait' },
        { name: 'endskill', from: 'skillwait', to: 'engaged' },

        { name: 'startmove', from: 'deciding', to: 'moving' },
        { name: 'endmove', from: 'moving', to: 'engaged' },

        { name: 'disengage', from: ['deciding', 'engaged'], to: 'idle' },

        { name: 'die', from: '*', to: 'dead' },
    ],
});
