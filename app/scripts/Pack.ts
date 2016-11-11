import { State } from './ARPGState';
import { MovementDirection, Position } from './Movement';
import { Character, CharacterState } from './Character';

/**
 * An argument to Pack that bundles initial Character information
 * along with necessary behavior.
 */
export class PackInit {
    constructor(public character: Character,
        public position: Position, public behavior: IBehavior) { }
}

export class Pack {
    public states: Array<CharacterState> = [];

    constructor(inits: Array<PackInit>, state: State) {
        inits.forEach(c => {
            this.states.push(new CharacterState(c.character,
                state, c.position, c.behavior));
        });
    }

    /** Engage every member of this pack with the opposing Pack */
    public engage(target: Pack) {
        this.states.forEach((c) => c.engage(target));
    }

    /** Determine if all states report as dead */
    public get isDead(): boolean {
        return this.states.every((c) => c.isDead);
    }

    /** Return all non-dead states */
    public get Living(): Array<CharacterState> {
        return this.states.filter(c => !c.isDead);
    }
}

/** Possible actions a Behavior can determine to do */
export const enum Action {
    NOP = 0,
    Skill,
    Move,
}

/** Any behavior affecting the positioning of a Character in combat */
export interface IBehavior {
    /** Set the character state this behavior will have */
    setState(c: CharacterState): void;
    /** 
     * Determine action to take given current state
     * and a target set in the following Pack
     */
    getAction(p: Pack): Action;
    /** Target choice, null indicates no valid choice to be made */
    getTarget(p: Pack): CharacterState | null;
    /** Direction to move relative to the provided CharacterState */
    getDirection(c: CharacterState): MovementDirection;
}
