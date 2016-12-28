import { CharacterState } from './CharacterState';
import { State } from './ARPGState';
import { Pack, MoveDistance } from './Pack';
import { ISkill } from './Skill';
import { Position, MovementDirection } from './Movement';
import { DamageModGroup, DamageModDirection, IRangeMod } from './DamageMods';
import * as DamageMods from './DamageModRegistry';

/**
 * Types of targeting a skill can have
 *
 * These are defined in what they target, Character or Position,
 * and what they can hit with respect to their target.
 */
export enum TargetFlavor {
    /** Targeting and hitting a single Character */
    Single = 0,
    /**
     * Targeting one Character but allowing for overflow
     * to hit additional, nearby targets.
     */
    Adjacent,
    /**
     * Targeting a position and hitting targets near that position.
     *
     * Does not mitigate evasion.
     */
    DirectedAoE,
    /**
     * Targeting a position and hitting targets near that position.
     *
     * Typically mitigates evasion at the expensve of power.
     */
    WideAoE,
}

export class SkillTarget {

    constructor(public targetSet: Pack,
        public source: CharacterState,
        public skill: ISkill) { }

    /** Apply the skill to all possibly affected targets */
    public apply(mods: DamageModGroup, state: State): number {
        let { Position: pos } = this.source;
        let { targeting } = this.skill;

        let affected = 0;
        // Iterate over potential targets
        targeting.affected(pos, this.targetSet)
            .forEach(c => {
                // Add a copy of the skill's RangeMod with
                // appropriate distance set
                let rangeBy = targeting.rangeMod.clone();
                mods.add(rangeBy, DamageModDirection.Dealing);

                // Pass the DamageModGroup off to the skill for execution
                // and execute the results.
                this.skill.execute(c, this.source, mods)
                    .forEach(result => result.execute(c, this.source, state));

                affected++;
            });

        return affected;
    }
}

export interface ITargeting {
    /** RangeMod associated with a specific method of targeting */
    rangeMod: IRangeMod;
    flavor: TargetFlavor;
    /** Get all members of a Pack potentially affected by this */
    affected(pos: Position, p: Pack): Array<CharacterState>;
    /** Determine how to move based entirely on provided distance
     *
     * This MUST abide by the rule that Hold means the skill should be used
     * while Closer or Farther mean that movement is absolutely necessary.
     *
     * target is the minimum coefficient you wish the mod to apply,
     * higher coefficient means more damage.
     */
    movement(distance: number, target: number): MoveDistance;
}

export class SingleTargetDiscrete implements ITargeting {

    public flavor = TargetFlavor.Single;

    public rangeMod: IRangeMod;

    constructor(public range: number) {
        this.rangeMod = new DamageMods.DiscreteRange(range);
    }

    public affected(pos: Position, p: Pack): Array<CharacterState> {
        // We can return only a single target... shit
        // TODO: coherency!
        return p.Living.filter(c => c.Position.distanceTo(pos) < this.range);
    }

    public movement(distance: number, target: number): MoveDistance {
        // Out of range implies we have to move closer
        if (Math.abs(distance) > this.range) {
            return new MoveDistance(MovementDirection.Closer,
                distance - this.range);
        }
        return new MoveDistance(MovementDirection.Hold, 0);
    }
}
