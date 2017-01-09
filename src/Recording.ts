import { State, Event, TicksPerSecond } from './ARPGState';
import { CharacterState } from './CharacterState';
import {
    RecordFlavor, IRecord,
    IDamageRecord,
    IMoveStartRecord, IMoveEndRecord,
    ISkillStart, ISkillApply, IDeathRecord,
} from './Records';

/** Record a DamageRecord */
export function recordDamage(target: CharacterState, source: CharacterState,
    sum: number, isCrit: Boolean) {

    let event: IDamageRecord = {
        flavor: RecordFlavor.IDamage,
        when: record.now,
        target: target.EntityCode, source: source.EntityCode,
        sum, isCrit,
    };

    record.pushImplicitEvent(event);
}

export function recordMovementStart(source: CharacterState,
    target: CharacterState,
    duration: number, moveCoeff: number, endPos: number) {

    let event: IMoveStartRecord = {
        flavor: RecordFlavor.IMoveStart,
        when: record.now,
        source: source.EntityCode, target: target.EntityCode,
        duration, moveCoeff, endPos,
    };

    record.pushImplicitEvent(event);
}

export function recordMovementEnd(source: CharacterState, endPos: number) {

    let event: IMoveEndRecord = {
        flavor: RecordFlavor.IMoveEnd,
        when: record.now,
        source: source.EntityCode,
        endPos,
    };

    record.pushImplicitEvent(event);
}

export function recordSkillStart(source: CharacterState, target: CharacterState,
    duration: number, skillName: string) {

    let event: ISkillStart = {
        flavor: RecordFlavor.ISkillStart,
        when: record.now,
        source: source.EntityCode, target: target.EntityCode,
        duration, skillName,
    };

    record.pushImplicitEvent(event);
}

export function recordSkillApply(source: CharacterState, target: CharacterState,
    skillName: string) {

    let event: ISkillApply = {
        flavor: RecordFlavor.ISkillApply,
        when: record.now,
        source: source.EntityCode, target: target.EntityCode,
        skillName,
    };

    record.pushImplicitEvent(event);
}

export function recordDeath(source: CharacterState) {
    let event: IDeathRecord = {
        flavor: RecordFlavor.IDeath,
        when: record.now,
        source: source.EntityCode,
    };

    record.pushImplicitEvent(event);
}

/** 
 * Recording is a wrapper over State that allows
 * for both explicit Events as well Event side effects
 * to be recorded for playback.
 */
export class Recording {

    /**
     * All non-purged records we have
     *
     * NOTE: the ordering of strictly increasing when is always assumed.
     *       as such, this is effectively append-only
     */
    private retired: Array<IRecord> = [];

    constructor(public state: State) { }

    /** 
     * Run the Recording until the given tick-time is hit
     *
     * Returns the number of explicit events retired
     */
    public runTo(when: number): number {
        // Determine how many ticks we run for
        let start = this.state.now;
        let duration = when - start;
        if (duration < 0) throw Error(`runTo cannot run to a when before now, duration=${duration}`);

        let retired = 0;

        // Run
        for (let i = 0; i < duration; i++) {
            let completed = this.state.step();
            // Record events as necessary.
            if (completed.length > 0) {
                this.pushExplicitEvents(completed);
                retired += completed.length;
            }
        }

        return retired;
    }

    /** 
     * Run the Recording for a given number of realtime seconds
     * with an optional speedup multiplier.
     *
     * Returns the tick-time reached
     */
    public runForDuration(seconds: number, speedup: number = 1): number {
        // Determine how long we run for and what that gives us
        // in rounded-down tick-time
        let duration = seconds * TicksPerSecond * speedup;
        let when = Math.floor(this.now + duration);

        // Run
        this.runTo(when);

        return when;
    }

    /**
     * Return and remove Records up to and including
     * the specific tick time
     */
    public popEventsTill(when: number): Array<IRecord> {
        // Collect the records
        let popped = this.retired.filter(rec => rec.when <= when);
        // Remove them
        this.retired = this.retired.filter(rec => rec.when > when);
        return popped;
    }

    /**
     * Return and remove all implicit Records up to and including
     * the specific tick time. Explicit events up to that time
     * are discarded
     */
    public popImplicitEventsTill(when: number): Array<IRecord> {
        return this.popEventsTill(when).filter(e => !(e instanceof Event));
    }

    /**
     * Push a single implicit event that is a side effect of an explicit event
     */
    public pushImplicitEvent(event: IRecord) {
        this.retired.push(event);
    }

    /** The current tick-time being processed */
    public get now(): number {
        return this.state.now;
    }

    /** Push an array of Events that retired on State */
    private pushExplicitEvents(events: Array<Event>) {
        this.retired = this.retired.concat(events);
    }
}

/** State associated with the record */
export let state = new State();
/** Globally shared record */
export let record = new Recording(state);
