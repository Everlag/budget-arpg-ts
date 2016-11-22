import { State } from './ARPGState';

/** 
 * A set of callbacks ConstantCalc calls when
 * it's value reaches specified extrema.
 *
 * If the callback returns a truthy value, ConstantCalc has its rate
 * set to zero.
 */
export interface IConstantCalcExtremaCallbacks {
    min: null | (() => boolean);
    max: null | (() => boolean);
}

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
        public min: number | null,
        public max: number | null,
        private callbacks: IConstantCalcExtremaCallbacks | null,
        public state: State, public name: string) {
        this._value = value;
        this._rate = rate;
        this.lastUpdate = state.now;

        // Sanity check the callbacks
        if (this.callbacks) {
            if (this.callbacks.min != null && this.min === null) {
                throw Error('min callback set when min is null');
            }
            if (this.callbacks.max != null && this.max === null) {
                throw Error('max callback set when max is null');
            }
        }
    }

    // Handle _value potentially exceeding the extrema
    private handleExtrema() {
        if (this.max != null && this._value >= this.max) {
            if (this.callbacks && this.callbacks.max) {
                if (this.callbacks.max()) this._rate = 0;
            }
            this._value = this.max;
        }
        if (this.min != null && this._value <= this.min) {
            if (this.callbacks && this.callbacks.min) {
                // Call the callback
                if (this.callbacks.min()) this._rate = 0;
            }
            this._value = this.min;
        }
    }

    // Interpolate and set _value for current state.now
    // 
    // Based on lastUpdate and _rate,
    private updateValue(): number {
        // Determine how much time has passed since last update
        let passed = this.state.now - this.lastUpdate;
        // Short-circuit if no time has passed
        if (passed === 0) return this._value;

        // Set the new value
        let delta = this.rate * passed;
        this._value = this._value + delta;
        // Take care of extrema on the way out
        this.handleExtrema();

        // Set the new lastUpdate
        this.lastUpdate = this.state.now;

        return this._value;
    }

    get value(): number {
        return this.updateValue();
    }

    set value(value: number) {
        this._value = value;
        // Cleanup the update and handle max/min
        this.updateValue();
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
