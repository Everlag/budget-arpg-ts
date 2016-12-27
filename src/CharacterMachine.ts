import { StateMachine } from 'javascript-state-machine';
import { CharacterState } from './CharacterState';
import { Event } from './ARPGState';
import { ISkill } from './Skill';
import { Pack } from './Pack';
import { MovementDirection } from './Movement';
import registerClass from './Snapshot';

/** Interface all CharacterState contexts must satisfy */
interface IContext {
    /** Event associated with this context */
    event: Event;
    /** Cancel current event */
    cancel(): void;
}

@registerClass
export class SkillContext implements IContext {
    public skill: ISkill;
    public target: CharacterState;
    public event: Event;

    public cancel() {
        this.event.cancel();
    }
}

@registerClass
export class MoveContext implements IContext {
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

/**
 * CharacterMachine implements the boilerplate necessary
 * for StateMachine as well as handling the setting and nulling
 * of scratch for a given state.
 *
 * This class explicitly carries no state except from what
 * the StateMachine requires. 
 */
export class CharacterMachine implements StateMachine {
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

    // Per-state context.
    // This is set and cleared when entering or leaving a given state.
    // 
    // This means that event handlers can expect their state to already
    // exist when entering. They need only perform a type assertion.
    protected scratch: StateContext | null;

    /** Prepare state for anything happening in the engaged state */
    private onenterengaged() {
        console.log(`${this.EntityCode} onenterengaged`,
            this.current, this.scratch);
    }

    private onenterskillwait() {
        console.log(`${this.EntityCode} onenterskillwait`, this.current);
        this.scratch = new SkillContext();
    }

    private onleaveskillwait() {
        console.log(`${this.EntityCode} oneleaveskillwait`, this.current);
        if (!this.scratch) throw 'onleaveskillwait without scratch';
        // Cancel any event if not executed
        let {event} = this.scratch;
        if (!event.wasExecuted) event.cancel();
        // Zero scratch
        this.scratch = null;
    }

    /**
     * Handle follow up for performing a skill.
     *
     * NOTE: skill was executed in onbefore handler for endskill.
     */
    private onendskill() {
        this.decide();
    }

    private onentermoving() {
        console.log(`${this.EntityCode} onentermoving`, this.current);
        this.scratch = new MoveContext();
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
        console.log(`${this.EntityCode} onleavemoving`, this.current);
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
        console.log(`${this.EntityCode} ondie`, this.current);
    }

    // Boilerplate EntityCode, inheritors must override
    get EntityCode(): string {
        throw Error('EntityCode called on CharacterMachine');
    }
}

export type CharacterStates =
    'idle'
    | 'engaged'
    | 'deciding'
    | 'skillwait'
    | 'moving'
    | 'dead';

StateMachine.create({
    target: CharacterMachine.prototype,
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
