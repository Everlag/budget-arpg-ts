import * as PriorityQueue from 'js-priority-queue';

export const TicksPerSecond: number = 100;

/*
    Maximum number of events we allow the State to retire every second.
 */
export const MaxEventsPerTick = 1000;

export class State {

    /** Current tick the simulaiton is at */
    public now: number = 0;

    private queue: PriorityQueue<Event>;

    constructor() {
        this.queue = new PriorityQueue<Event>({
            comparator: (a, b) => a.when - b.when,
        });
    }

    /**
     * Add an event to be executed in the future to the queue
     */
    public addEvent(e: Event) {
        // Refuse to add stale items to the queue
        if (e.when < this.now) {
            throw Error('provided event has when less than now');
        }
        this.queue.queue(e);
    }

    /**
     * Continue one tick in the simulation and return
     * number of events retired.
     */
    public step(): number {
        // Increment current time.
        this.now += 1;

        // Note number of events retired
        let completed = 0;

        // Nothing to do, leave
        if (this.queue.length === 0) return completed;

        let next = this.queue.peek();
        while (!(this.queue.length === 0) &&
            next.when <= this.now &&
            completed < MaxEventsPerTick) {

            // Remove lowest event from queue
            let e = this.queue.dequeue();

            // Apply event and handle any sheduled followups
            let followups = e.apply(this);
            followups.forEach((followup) => this.addEvent(followup));

            completed++;
            if (completed > MaxEventsPerTick) {
                throw Error(`more than ${MaxEventsPerTick} retired in tick`);
            }

            if (this.queue.length > 0) {
                next = this.queue.peek();
            }
        }

        return completed;
    }
}

/**
 * A function taking state and performing
 * an action based on stored context.
 *
 * It may return null to indicate no followup should be scheduled.
 */
export type GeneralEffect = (state: State) => Event;

export class Event {
    private used: Boolean = false;
    private cancelled: Boolean = false;
    private delayed: Boolean = false;

    private newWhen: number;

    constructor(public when: number,
        public action: GeneralEffect,
        public post: GeneralEffect) {

        if (!this.action) throw Error('invalid passed action');
        if (isNaN(this.when)) throw Error('invalid passed when: NaN');
    }

    /**
     * Perform the action and optional post associated with this Event
     */
    public apply(state: State): Array<Event> {
        // Prevent multiple uses of same event
        if (this.used) {
            throw Error('cannot apply already used event');
        }
        this.used = true;

        // NOP if we've been cancelled
        if (this.cancelled) {
            return [];
        }

        // Return a fresh copy of this event if we've been delayed
        if (this.delayed) {
            if (!this.newWhen) {
                throw Error('Event delayed but no newWhen present');
            }
            return [new Event(this.newWhen, this.action, this.post)];
        }

        // Execute actions 
        let followups: Array<Event> = [];

        // Perform initial action and followup, if it exists
        followups.push(this.action(state));
        if (this.post) followups.push(this.post(state));
        // Return only non-null followups
        return followups.filter((e) => e !== null);
    }

    /**
     * Cancel the exeuction of this event.
     *
     * This may be called multiple times.
     *
     * Note that this is handled by making apply a nop.
     */
    public cancel() {
        this.cancelled = true;
    }

    /**
     * Defer execution of this event to a later time
     *
     * This may be called multiple times.
     *
     * Note that this is handled in apply by returning a fresh,
     * equivalent Event instance with the newWhen
     */
    public delay(newWhen: number) {
        // Ensure the new execution time is after the initial time
        if (this.when < newWhen) {
            throw Error('cannot delay to less than initial when');
        }
        // Ensure we can only be delayed to a later time
        // when handling multiple delays
        if (this.delayed && this.newWhen < newWhen) {
            throw Error('cannot delay to less than previous delay');
        }

        // Set the delayed flag and note when we should execute
        this.delayed = true;
        this.newWhen = newWhen;
    }
}
