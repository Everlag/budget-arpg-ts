import { MoveTime } from './ARPGState';

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
        return Math.max(this.loc, other.loc) - Math.min(other.loc, this.loc);
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
    public coeffRelative(other: Position, movespeed: number,
        direction: MovementDirection): number {

        let distance = this.distanceTo(other);

        // Determine where we end up hit if we either coefficient
        let positive = new Position(distance + movespeed * MoveTime).clamp();
        let negative = new Position(distance - movespeed * MoveTime).clamp();

        // Determine total distance resulting from positive or negative
        let positiveDistance = positive.distanceTo(other);
        let negativeDistance = negative.distanceTo(other);

        switch (direction) {
            case MovementDirection.Closer:
                if (positiveDistance < negativeDistance) {
                    return 1;
                }
                return -1;

            case MovementDirection.Farther:
                if (positiveDistance > negativeDistance) {
                    return 1;
                }
                return -1;
            default:
                throw Error('fell through direction switch');
        }

    }
}
