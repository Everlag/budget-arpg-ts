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
}
