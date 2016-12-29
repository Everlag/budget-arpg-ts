import { State, Event, TicksPerSecond } from './ARPGState';

interface IRecord {
    /** Tick-time this record was recorded at */
    when: number;
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

    /** Run the Recording until the given tick-time is hit */
    public runTo(when: number) {
        // Determine how many ticks we run for
        let start = this.state.now;
        let duration = when - start;
        if (duration < 0) throw Error('runTo cannot run to a when before now');

        // Run
        for (let i = 0; i < duration; i++) {
            let completed = this.state.step();
            // Record events as necessary.
            if (completed.length > 0) this.pushExplicitEvents(completed);
        }
    }

    /** Push an array of Events that retired on State */
    private pushExplicitEvents(events: Array<Event>) {
        this.retired.concat(events);
    }

    /** Remove Records until those at a certain time */
    private purgeUntil(when: number) {
        this.retired = this.retired.filter(rec => rec.when >= when);
    }
}

/** State associated with the record */
let state = new State();
/** Globally shared record */
let record = new Recording(state);

/** Expose global record to allow for recording implicit events */
export default record;