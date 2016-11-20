import { CharacterState } from './CharacterState';
import { MovementDirection } from './Movement';
import { Pack, Action, MoveTime, IBehavior } from './Pack';

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
        let {rangeBy} = this.state.context.skill;
        let distanceToOptimal = rangeBy.movement(distance, 0.5);
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
        let {rangeBy} = this.state.context.skill;
        let distance = c.Position.distanceTo(this.state.Position);
        let distanceToOptimal = rangeBy.movement(distance, 0.5);

        // Translate from a distance to an amount of time
        let { movespeed } = this.state.context.stats;
        return distanceToOptimal.toMoveTime(movespeed);
    }

}
