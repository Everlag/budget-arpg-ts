import { CharacterState } from './Character';
import { MovementDirection } from './Movement';
import { Pack, Action, IBehavior } from './Pack';

/**
 * Choose the nearest possible target,
 * require at least 1% of Damage.
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
        let direction = rangeBy.movement(distance, 0.01);
        if (direction === MovementDirection.Hold) return Action.Skill;
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

    public getDirection(c: CharacterState): MovementDirection {
        if (!this.state) throw 'State of IBehavior not set';
        return MovementDirection.Closer;
    }

}
