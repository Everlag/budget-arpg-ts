import { State } from './ARPGState';

/**
 * Continuous calculation of a value by a fixed rate
 *
 * The rate may be changed arbitrarily.
 *
 * The cap can either be a ceiling of what the value can take
 * or null
 */
export class ConstantCalc {

    // Last tick-time we updated the internal _value 
    private lastUpdate: number;
    // Stored value
    private _value: number; // tslint:disable-line:variable-name
    // Rate of value increase per-tick
    private _rate: number; // tslint:disable-line:variable-name

    constructor(value: number, rate: number,
        public cap: number | null,
        public state: State, public name: string) {
        this._value = value;
        this._rate = rate;
        this.lastUpdate = state.now;
    }

    // Interpolate and set _value for current state.now
    // 
    // Based on lastUpdate and _rate,
    protected updateValue(): number {
        // Determine how much time has passed since last update
        let passed = this.state.now - this.lastUpdate;
        // Short-circuit if no time has passed
        if (passed === 0) return this._value;

        // Set the new value
        let delta = this.rate * passed;
        this._value = this._value + delta;
        // Apply cap if it exists
        if (this.cap != null) this._value = Math.min(this._value, this.cap);

        // Set the new lastUpdate
        this.lastUpdate = this.state.now;

        return this._value;
    }

    get value(): number {
        return this.updateValue();
    }

    set value(value: number) {
        this._value = value;
    }

    get rate(): number {
        return this._rate;
    }

    set rate(rate: number) {
        // Perform any interopolation required for the old rate
        // that was being used up to this point
        this.updateValue();
        // Set the new rate
        this._rate = rate;
    }

}

export interface IAugment {
    /**
     * Get the delta for the value given now.
     */
    query(now: number): number;
}

/**
 * Continuous calculation of a value by a fixed rate
 *
 * This operates equivalently to ConstantCalc except it
 * is extended to update
 *
 * An augment satisfies the IAugment interface and is queried
 * when the value is updated
 */
export class AugConstantCalc extends ConstantCalc {

    constructor(value: number, rate: number,
        public cap: number | null,
        public state: State, public name: string,
        private augments: Array<IAugment>) {

        super(value, rate, cap, state, name);
    }

    // Include augments in the calculation of an update
    protected updateValue(): number {
        // Have the super handle their portion of the update
        // 
        // This is explicit
        super.updateValue();

        // Sum the delta of all augments
        let delta = this.augments.reduce((prev, aug) => {
            return prev + aug.query(this.state.now);
        }, 0);

        // Apply the delta
        super.value += delta;

        return super.value;
    }

    get value(): number {
        return this.updateValue();
    }

    set value(value: number) {
        super.value = value;
    }

    get rate(): number {
        return super.rate;
    }

    set rate(rate: number) {
        // Perform any interpolation required for the old rate
        // that was being used up to this point
        this.updateValue();
        // Set the new rate        
        super.rate = rate;
    }

}

export class Burning {
    // When the instance was last check for accumulated damage
    public lastAccumulate: number;

    constructor(now: number, public end: number,
        public rate: number) {
        this.lastAccumulate = now;
    }

    /** 
     * Determine how much damage has accumulated from this instance
     *
     * This updates the lastCheck to be now if update is truthy
     * This allows comparison via accumulated as well as updating state.
     */
    public accumulated(now: number, update: boolean): number {
        let duration = now - this.lastAccumulate;
        if (now > this.end) {
            duration = this.end - this.lastAccumulate;
        }

        let accumulated = duration * this.rate;
        if (update) this.lastAccumulate = now;
        return accumulated;
    }
}

/**
 * A lazy manager for handling multiple active instances of Burning
 * being applied to the same character
 *
 * NOTE: this is broken in the case of overlapping instances
 *       while one has a higher rate but the other has a longer
 *       duration. Good enough for now.
 */
export class BurningManager implements IAugment {
    public instances: Array<Burning> = [];

    public query(now: number): number {

        // Short circuit on no calculations to make
        if (this.instances.length === 0) return 0;

        let sum = 0;
        while (true) {
            // Find the highest instance
            let highest = this.getHighestActive(now);
            // End summing if we've run out of instances 
            if (highest === null) break;
            // Determine total accumulated from this instance
            // while updating the instance for it's relative now-ness
            let accumulated = highest.accumulated(now, true);
            sum += accumulated;
            // End summing if this instance covers us for the remainder
            if (highest.end >= now) break;
            // Update now to be where the highest took us
            now = highest.end;
        }

        // Remove any instances which are left to clean up
        // 
        // NOTE: this is done following the calculation of summed damage
        //       as filtering before will remove valid damage calculated
        this.cleanExpired(now);

        return sum;
    }

    /** Push a Burning instance onto the manager */
    public push(b: Burning) {
        this.instances.push(b);
    }

    /** Remove all instances which have expired */
    private cleanExpired(now: number) {
        this.instances = this.instances.filter(b => b.end > now);
    }

    // Find the instance contained within that deals the highest
    // amount of damage and isn't expired
    private getHighestActive(now: number): Burning | null {
        // Sort as descending by accumulated damage then filter
        // for non-zero instances.
        // 
        // NOTE: we don't update the accumulated damage here
        let sorted = this.instances
            .sort((a, b) => {
                return a.accumulated(now, false) - b.accumulated(now, false);
            })
            .filter(a => a.accumulated(now, false) > 0)
            .reverse();

        if (sorted.length === 0) return null;

        return sorted[0];
    }
}

/**
 * Simple test for regressions, this is complicated enough that I
 * want a test but not complicated enough for me to bother setting up
 * a giant framework, so onload we go :|
 */
function BurningManagerTest() {
    // Simple test with two, non-overlapping instances
    let manager = new BurningManager();
    manager.push(new Burning(0, 10, 1));
    manager.push(new Burning(10, 20, 1));
    if (manager.query(30) !== 20) throw Error('BurningManager non-overlapping fail');

    // Test with overlapping, should still be 20 
    manager = new BurningManager();
    manager.push(new Burning(0, 10, 1));
    manager.push(new Burning(10, 20, 1));
    manager.push(new Burning(15, 20, 1));
    if (manager.query(30) !== 20) throw Error('BurningManager overlapping fail');

    // Test with overlapping, should be 40
    manager = new BurningManager();
    manager.push(new Burning(0, 10, 1));
    manager.push(new Burning(10, 20, 1));
    manager.push(new Burning(15, 25, 2));
    let sum = manager.query(30);
    if (sum !== 40) throw Error('BurningManager complex overlapping fail');
}

BurningManagerTest();
