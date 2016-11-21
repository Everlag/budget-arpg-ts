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
    protected updateValueAug(): number {
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
        return this.updateValueAug();
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
        this.updateValueAug();
        // Set the new rate        
        super.rate = rate;
    }

}
