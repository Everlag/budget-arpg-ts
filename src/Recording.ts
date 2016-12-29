import { State, Event } from './ARPGState';
import { CharacterState } from './CharacterState';

/** 
 * Types of records we support
 *
 * Prefix E means an explicit event retired on the queue
 * while prefix I is an implicit event as a side effect of the queue
 */
export enum RecordFlavor {
    ESkillUse = 0,
    ESkillPostEffect,
    EMovement,
    EStatusEffect,
    IDamage,
}

interface IRecord {
    /** Tick-time this record was recorded at */
    when: number;
    flavor: RecordFlavor | undefined;
}

interface IDamageRecord extends IRecord {
    target: string;
    source: string;
    /** Actual amount of damage the Target took post-mitigation */
    sum: number;
    isCrit: Boolean;
}

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
        if (duration < 0) throw Error('runTo cannot run to a when before now');

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
