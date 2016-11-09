import { CharacterState } from './Character';
import { MovementDirection } from './Movement';
import { Pack, IBehavior } from './Pack';

/** Choose the nearest possible target */
export class AgressiveNaiveMelee implements IBehavior {

    public state: CharacterState;

    public setState(c: CharacterState) {
        this.state = c;
    }

    public getTarget(p: Pack): CharacterState {
        if (!this.state) throw 'State of IBehavior not set';

        // Find the closest target, a single reduce does the job
        return p.states.reduce((prev, current) => {

            let currentDist = this.state.context.position
                .distanceTo(current.context.position);

            let prevDistance = this.state.context.position
                .distanceTo(prev.context.position);

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
