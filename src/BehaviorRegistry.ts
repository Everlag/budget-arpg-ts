import { CharacterState } from './CharacterState';
import { MovementDirection } from './Movement';
import { Pack, Action, MoveTime, MoveDistance, IBehavior } from './Pack';

/**
 * Choose the nearest possible target,
 * require at least 50% of Damage to hit.
 *
 * This works best with skills that are all-or-nothing affairs
 * with how their damage suffers over distances.
 */
export class AgressiveNaiveMelee implements IBehavior {

    public state: CharacterState;

    public setState(c: CharacterState) {
        this.state = c;
    }

    public getAction(p: Pack): Action {
        // Fetch best target in current situation
        let target = this.getTarget(p);
        // No possible target means no action
        if (target === null) return Action.NOP;
        let distance = target.Position.distanceTo(this.state.Position);
        // Ask the skill what it wants
        let { targeting } = this.state.context.skill;
        let distanceToOptimal = targeting.movement(distance, 0.5);
        // Use a skill if we're allowed to hold, otherwise we need to move.
        if (distanceToOptimal.direction === MovementDirection.Hold) {
            return Action.Skill;
        }
        return Action.Move;
    }

    public getTarget(p: Pack): CharacterState | null {
        if (!this.state) throw 'State of IBehavior not set';

        let living = p.Living;
        if (living.length === 0) return null;

        // Find the closest target, a single reduce does the job
        return p.Living.reduce((prev, current) => {

            let currentDist = this.state.Position.distanceTo(current.Position);

            let prevDistance = this.state.Position.distanceTo(prev.Position);

            if (currentDist < prevDistance) {
                return current;
            }
            return prev;
        });
    }

    public getMoveOrder(c: CharacterState): MoveTime {
        if (!this.state) throw 'State of IBehavior not set';
        // Ask the skill how far we need to move
        let { targeting } = this.state.context.skill;
        let distance = c.Position.distanceTo(this.state.Position);
        let distanceToOptimal = targeting.movement(distance, 0.5);

        // Translate from a distance to an amount of time
        let { movespeed } = this.state.context.stats;
        return distanceToOptimal.toMoveTime(movespeed);
    }

}

export class GreedyNaiveAoE implements IBehavior {

    public state: CharacterState;

    public setState(c: CharacterState) {
        this.state = c;
    }

    public getAction(p: Pack): Action {
        // Fetch best target in current situation
        let target = this.getTarget(p);
        // No possible target means no action
        if (target === null) return Action.NOP;
        let distance = target.Position.distanceTo(this.state.Position);
        // Ask the skill what it wants
        let { targeting } = this.state.context.skill;
        let distanceToOptimal = targeting.movement(distance, 0.5);
        // Use a skill if we're allowed to hold, otherwise we need to move.
        if (distanceToOptimal.direction === MovementDirection.Hold) {
            return Action.Skill;
        }
        return Action.Move;
    }

    public getTarget(p: Pack): CharacterState | null {
        if (!this.state) throw 'State of IBehavior not set';

        let living = p.Living;
        if (living.length === 0) return null;

        let { targeting } = this.state.context.skill;

        // Find the living character in range and that has the
        // highest number of affected targets.
        let aoe = p.Living
            .map(c => {
                // Place the considered character at the front so
                // we know where it is.
                let others = targeting.affected(c, p)
                    .filter(char => c !== char);
                return [c].concat(others);
            })
            .reduce((prev, current) => {
                if (prev.length > current.length) {
                    return prev;
                }
                return current;
            });
        // Check to ensure we have at least one valid target
        if (aoe.length === 0) return null;

        // Return the Character we placed at the front.
        return aoe[0];
    }

    public getMoveOrder(c: CharacterState): MoveTime {
        if (!this.state) throw 'State of IBehavior not set';
        // Ask the skill how far we need to move
        let { targeting } = this.state.context.skill;
        let distance = c.Position.distanceTo(this.state.Position);
        let distanceToOptimal = targeting.movement(distance, 0.5);

        // Translate from a distance to an amount of time
        let { movespeed } = this.state.context.stats;
        return distanceToOptimal.toMoveTime(movespeed);
    }

}

/**
 * Check if any enemies are in range
 */
export class StrafingRanged implements IBehavior {

    public state: CharacterState;

    /**
     * Keep track of if we explicitly moved last action to
     * put space between us and the enemy.
     *
     * This allows us to strafe instead of always running away
     */
    private withdrewLastAction: boolean = false;

    public setState(c: CharacterState) {
        this.state = c;
    }

    public getAction(p: Pack): Action {

        // Check if we're within range of the enemy and didn't retreat
        // in the last action. We cannot withdraw consecutive times. 
        if (this.isWithinRangeOfEnemy(p) && !this.withdrewLastAction) {
            this.withdrewLastAction = true;
            return Action.Move;
        }
        // From this point, anything we do is not prompted by a
        // desire to create more space
        this.withdrewLastAction = false;

        // Fetch best target in current situation
        let target = this.getTarget(p);
        // No possible target means no action
        if (target === null) return Action.NOP;
        let distance = target.Position.distanceTo(this.state.Position);
        // Ask the skill what it wants
        let { targeting } = this.state.context.skill;
        let distanceToOptimal = targeting.movement(distance, 0.5);
        // Use a skill if we're allowed to hold, otherwise we need to move.
        if (distanceToOptimal.direction === MovementDirection.Hold) {
            return Action.Skill;
        }
        return Action.Move;
    }

    public getTarget(p: Pack): CharacterState | null {
        if (!this.state) throw 'State of IBehavior not set';

        let living = p.Living;
        if (living.length === 0) return null;

        // Find the closest target, a single reduce does the job
        return p.Living.reduce((prev, current) => {

            let currentDist = this.state.Position.distanceTo(current.Position);

            let prevDistance = this.state.Position.distanceTo(prev.Position);

            if (currentDist < prevDistance) {
                return current;
            }
            return prev;
        });
    }

    public getMoveOrder(c: CharacterState): MoveTime {
        if (!this.state) throw 'State of IBehavior not set';

        let { movespeed } = this.state.context.stats;

        // Check if we were instructed to withdraw
        if (this.withdrewLastAction) {
            // Double the distance between that CharacterState and us
            let distance = c.Position.distanceTo(this.state.Position);
            let d = new MoveDistance(MovementDirection.Farther, distance * 2);
            return d.toMoveTime(movespeed);
        }

        // Ask the skill how far we need to move
        let { targeting } = this.state.context.skill;
        let distance = c.Position.distanceTo(this.state.Position);
        let distanceToOptimal = targeting.movement(distance, 0.5);

        // Translate from a distance to an amount of time
        return distanceToOptimal.toMoveTime(movespeed);
    }

    /** Find all CharacterStates in range of us */
    private withinRangeOf(p: Pack): Array<CharacterState> {
        return p.Living.filter(c => {
            return c.context.skill.targeting
                .baseValid(c.Position, this.state);
        });
    }

    /** Determine if we are within range of an enemy */
    private isWithinRangeOfEnemy(p: Pack): boolean {
        return this.withinRangeOf(p).length > 0;
    }

}
