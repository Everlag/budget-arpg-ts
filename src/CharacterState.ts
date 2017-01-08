import {
    CharacterMachine, CharacterStates,
    MoveContext, SkillContext,
} from './CharacterMachine';
import { DamageModGroup, DamageModDirection } from './DamageMods';
import { Event, State, TicksPerSecond } from './ARPGState';
import {
    recordMovementStart, recordMovementEnd,
    recordSkillApply, recordDeath
} from './Recording';
import { RecordFlavor } from './Records';
import { Character } from './Character';
import { Stats } from './StatMods';
import { Pack, Action, IBehavior } from './Pack';
import { ISkill, SkillTiming } from './Skill';
import { Position } from './Movement';
import { ConstantCalc } from './ConstantCalc';
import { StatusEffects } from './StatusEffects';
import { SkillTarget } from './Targeting';
import { entityCode } from './random';
import { CharacterStateSerial } from './serial';

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

    // We store a copy of the CharacterState using this solely
    // for the purpose of being able to die.
    // private selfState: CharacterState;

    private manaCalc: ConstantCalc;
    private healthCalc: ConstantCalc;

    constructor(base: Character,
        state: State, public selfState: CharacterState,
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
        // And a reference to our selfState
        this.selfState = selfState;

        // And our emulated continuous mana calculation
        // with a rate of 2% per second and a cap of maximum mana.
        this.manaCalc = new ConstantCalc(this.stats.mana,
            this.stats.manaRegen,
            0, this.stats.mana, null,
            state, 'manaCalculation');

        // And our emulated continuous health calculation
        // the rate is 1% per second.
        // 
        // This also handles dying when we reach the minimum extrema of
        // health, aka reaching 0 health kill you
        this.healthCalc = new ConstantCalc(this.stats.health,
            this.stats.healthRegen,
            0, this.stats.health, { min: () => this.dieCB(), max: null },
            state, 'healthCalculation');
    }

    /**
     * Force a refresh of facets of stats into
     *
     * This needs to be called when the following change:
     *     - healthRegen
     *     - manaRegen
     * In order for the changes to have an effect.
     *
     * We could use Proxy but that's more than we need for now.
     */
    public reflectStatChange() {
        this.healthCalc.rate = this.stats.healthRegen;
        this.manaCalc.rate = this.stats.manaRegen;
    }

    /** 
     * Choose a target from the Pack
     */
    public chooseTargetCharacter(): CharacterState | null {
        return this.behavior.getTarget(this.target);
    }

    private dieCB(): boolean {
        if (this.selfState.isDead) return true;
        this.selfState.die();
        return true;
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
    public statuses: StatusEffects;

    // Private identity used to uniquely identify in EntityCode
    private identity = entityCode();

    constructor(private character: Character,
        public state: State, initPosition: Position, behavior: IBehavior) {
        super();

        behavior.setState(this);
        this.context = new GlobalContext(character, state, this,
            initPosition, behavior);

        this.statuses = new StatusEffects(this);
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

        // Record
        recordSkillApply(this, target, skill.name);

        // Create a new SkillTarget and apply it using our calculated mods
        let targets = new SkillTarget(this.context.target, this, skill);
        targets.apply(this.Position, target, mods, state);
    }

    public toJSON(): CharacterStateSerial {
        let { health, mana } = this.context;
        let { health: maxHealth, mana: maxMana } = this.context.baseStats;

        return {
            EntityCode: this.EntityCode,
            Position: this.Position.loc,
            health, mana,
            maxHealth, maxMana,
            isDead: this.isDead,
        };
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
        // Check if we have any health left, the act of checking
        // should kill us if we have none left :)
        if (this.context.health <= 0) return;

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
        let target = this.context.chooseTargetCharacter();
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
        let e = new Event(RecordFlavor.ESkillUse,
            this.state.now + waitTime,
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
        let e = new Event(RecordFlavor.EMovement,
            this.state.now + duration,
            (state: State): Event | null => {
                this.endmove();
                return null;
            }, null);

        this.scratch.target = target;
        this.scratch.start = this.state.now;
        this.scratch.event = e;

        // Record this
        let deltaPos = (duration * moveCoeff * this.context.stats.movespeed);
        let endPos = this.Position.loc + deltaPos;
        recordMovementStart(this, target, duration, moveCoeff, endPos);

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
        recordMovementEnd(this, this.Position.loc);
        let delta = prev.distanceTo(this.context.position);
        console.log(`${this.EntityCode} moved distance is`, delta);
    }

    /**
     * This CharacterState goes into the unrecoverable state of 'dead'
     *
     * NOTE: it is expected that 'oneleaveSTATE' handlers will take care
     * of canceling any events which need to be canceled and similar.
     */
    private ondie() {
        console.log(`${this.EntityCode} ondie`, this.current);
        // Record event
        recordDeath(this);
    }

    get EntityCode(): string {
        return `CH${this.character.identity}ST${this.identity}`;
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

    /**
     * Check if this character has died
     */
    get isDead(): boolean {
        // NOTE: checking the state BEFORE health is important
        // as the health will call a getter than ultimately calls
        // a callback calling isDead. So yeah, don't change the
        // ordering or many things break in horrible ways.
        if (this.is('dead')) {
            // If we're dead, we have to be sure our health is zero
            // because sometimes bugs find a way.
            this.context.health = 0;
            return true;
        }

        if (this.context.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

}
