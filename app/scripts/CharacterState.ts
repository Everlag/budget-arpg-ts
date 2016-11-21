import {
    CharacterMachine, CharacterStates,
    MoveContext, SkillContext,
} from './CharacterMachine';
import { DamageModGroup, DamageModDirection } from './DamageMods';
import { Event, State, TicksPerSecond } from './ARPGState';
import { Character } from './Character';
import { Stats } from './StatMods';
import { Pack, Action, IBehavior } from './Pack';
import { ISkill, SkillTiming } from './Skill';
import { Position } from './Movement';
import { ConstantCalc } from './ConstantCalc';

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

    private manaCalc: ConstantCalc;
    private healthCalc: ConstantCalc;

    constructor(base: Character, state: State,
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

        // And our emulated continuous mana calculation
        // with a rate of 2% per second and a cap of maximum mana.
        this.manaCalc = new ConstantCalc(this.stats.mana,
            this.stats.mana * (0.02 / TicksPerSecond),
            0, this.stats.mana,
            state, 'manaCalculation');

        // And our emulated continuous health calculation
        // the rate is 1% per second.
        // 
        // This also introduces the augments from the StatusEffects
        this.healthCalc = new ConstantCalc(this.stats.health,
            this.stats.health * (0.01 / TicksPerSecond),
            0, this.stats.health,
            state, 'healthCalculation');
    }

    get health(): number {
        return this.healthCalc.value;
    }

    set health(value: number) {
        this.healthCalc.value = value;
    }

    get mana(): number {
        return this.manaCalc.value;
    }

    set mana(value: number) {
        this.manaCalc.value = value;
    }
}

/**
 * CharacterState implements all actions the character takes
 * in response to changing state.
 *
 * We extend CharacterMachine to allow removal of the StateMachine
 * boilerplate.
 *
 * Per-state scratch can only be mutated, it can not be replaced.
 */
export class CharacterState extends CharacterMachine {

    // Context shared across states
    public context: GlobalContext;

    constructor(private character: Character,
        public state: State, initPosition: Position, behavior: IBehavior) {
        super();

        behavior.setState(this);
        this.context = new GlobalContext(character, state,
            initPosition, behavior);
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
            .forEach(result => result.execute(target, this, state));
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
        console.log(`${this.EntityCode} ondecide`, this.current);

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

    private onstartskill() {
        console.log(`${this.EntityCode} onstartskill`, this.current, this.scratch);
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
        console.log(`${this.EntityCode} onbeforeendskill`, this.current, this.scratch);
        this.applySkill(this.scratch.target, this.scratch.skill, this.state);
    }

    private onstartmove() {
        console.log(`${this.EntityCode} onstartmove`,
            this.current, this.scratch);
        if (!(this.scratch instanceof MoveContext)) {
            throw 'onstartmove without scratch';
        }

        // Query behavior for best target and direction to
        // travel in order to reach that target.
        let { behavior } = this.context;
        let target = behavior.getTarget(this.context.target);
        if (!target) throw Error('null target in onstartmove');
        let { direction, duration } = behavior.getMoveOrder(target);
        // Move in 300ms increments but allow fine granularity
        // once we're below that bulk.
        // 
        // This, roughly simulates corrections to new state while moving.
        if (duration > TicksPerSecond / 3) duration = TicksPerSecond / 3;

        // Determine Coefficient we move with on the
        // line that is our reality
        let moveCoeff = this.Position.coeffRelative(target.Position,
            this.context.stats.movespeed, duration, direction);
        console.log(`${this.EntityCode} moving ${moveCoeff} abs, for ${duration}`);
        this.scratch.direction = direction;
        this.scratch.moveCoeff = moveCoeff;

        // Schedule an event to complete the move
        let e = new Event(this.state.now + duration,
            (state: State): Event | null => {
                this.endmove();
                return null;
            }, null);

        this.scratch.target = target;
        this.scratch.start = this.state.now;
        this.scratch.event = e;

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
        console.log(`${this.EntityCode} onbeforeendmove`, this.current, this.scratch);
        let prev = this.context.position;
        // Set new position to resolved position
        this.context.position = this.interpolatePosition();
        let delta = prev.distanceTo(this.context.position);
        console.log(`${this.EntityCode} moved distance is`, delta);
    }

    /**
     * Return a chosen target to attack
     */
    get targetCharacter(): CharacterState | null {
        return this.context.behavior.getTarget(this.context.target);
    }

    get EntityCode(): string {
        return `ST${this.character.identity}`;
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

        return this.interpolatePosition();
    }

    /** 
     * Interpolate the position based on scratch state
     *
     * Required state is 'moving'
     */
    private interpolatePosition(): Position {
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
}