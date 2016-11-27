import * as math from 'mathjs';
import { intfromInterval } from './random';
import { TicksPerSecond } from './ARPGState';

/** Meta data governing engagement positions */
export const PositionBounds = {
    // Limits to valid combat positions
    Extrema: [-100, 100],
    // Where two opposing Packs would place their Characters initially
    Starts: [-50, 50],
    // How large a 'screen' is considered to be.
    ScreenSize: 100,
};

/** 
 * Possible direction a character could move as a result of a Behavior
 */
export const enum MovementDirection {
    /** Hold difference between current position and target */
    Hold = 0,
    /** Decrease difference between current position and target */
    Closer,
    /** Increase difference between current position and target */
    Farther,
}

/** Handles intelligent positioning  */
export class Position {
    constructor(public loc: number) { }

    /** Compute distance to a given Position */
    public distanceTo(other: Position): number {
        return Math.abs(this.loc - other.loc);
    }

    /**
     * Compute distance to a given position taking into account
     * evasion's impact as well as the current tick-time
     *
     * Note: evasion's angular effect is applied to the other position
     *
     * evasionDistance computes the distance between the two positions
     * as though they lie on the complex plane rather than the typical
     * linear path. Evasion adds an angle to the other position
     * around the origin. The result is a variably larger distance
     * than would be provided by distanceTo
     */
    public evasionDistanceTo(other: Position,
        evasion: number, now: number): number {

        // This position sits in R, convenient!
        let thisComplex = math.complex({ r: this.loc, phi: 0 });
        console.log('thisComplex', thisComplex)

        // Compute the angle for the other position
        // in 0..pi/2
        // 
        // Yes, we're using unfancy Math because reasons.
        let multFloor = (now / (TicksPerSecond * 0.5)) % 10;
        console.log(multFloor)
        let angleMult = intfromInterval(multFloor, 100) / 100;
        console.log(angleMult)
        let angle = Math.log(evasion) / Math.log(300);
        // Enforce that angle is between 0% and 100% effective
        // for the purposes of increasing the distance
        angle = Math.min(angle * angleMult, math.pi / 2);
        console.log(angle)
        let otherComplex = math.complex({ r: other.loc, phi: angle });
        console.log(otherComplex)

        // Determine distance between them
        let distance = math.chain(thisComplex)
            .subtract(otherComplex)
            .abs()
            .done();

        return distance;

    }

    /** 
     * Clamp the Position to within PositionBounds extrema
     *
     * This modifies the Position and returns it for easier chaining.
     */
    public clamp(): Position {
        let [lower, upper] = PositionBounds.Extrema;
        if (this.loc < lower) this.loc = lower;
        if (this.loc > upper) this.loc = upper;
        return this;
    }

    /**
     * Given direction to move relative to another Position and
     * how fast movement will occur at, determine a coefficient in {-1, 1}
     * to apply to the absolute position.
     *
     * This handles getting stuck between screen boundary and Position
     * when attempting to move away. In that case, it will move closer
     * to allow moving past to move away in a future move.
     */
    public coeffRelative(other: Position,
        movespeed: number, duration: number,
        direction: MovementDirection): number {

        // Determine where we end up hit if we either coefficient
        let positive = new Position(this.loc + movespeed * duration);
        let negative = new Position(this.loc - movespeed * duration);

        let posDistance: number;
        let negDistance: number;

        switch (direction) {
            case MovementDirection.Closer:
                // Determine total distance resulting from positive or negative
                posDistance = other.distanceTo(positive);
                negDistance = other.distanceTo(negative);
                if (posDistance < negDistance) {
                    return 1;
                }
                return -1;

            case MovementDirection.Farther:
                // We need to work with clamped distances for farther,
                // otherwise we'll just exit out bounds infinitely.
                posDistance = other.distanceTo(positive.clamp());
                negDistance = other.distanceTo(negative.clamp());
                if (posDistance > negDistance) {
                    return 1;
                }
                return -1;
            default:
                throw Error('fell through direction switch');
        }

    }

}
