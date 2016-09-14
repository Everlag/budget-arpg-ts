import {TicksPerSecond} from './ARPGState';
import {CharacterState} from './Character';
import {DamageTag} from './Damage';
import {DamageModGroup} from './DamageMods';
import {Zero} from './DamageModRegistry';

/** 
 * A SkillResult contains the mods for the initial skill use
 * as well as the post-mods and delay for any after-effect.
 *
 * postmods may be null to indicate no followup is to be scheduled.
 */
export class SkillResult {
    constructor(public mods: DamageModGroup,
        public postmods: DamageModGroup, public postDelay: number) {

        if (mods === null) {
            throw Error('mods is null, prefer to add(new Zero()) instead');
        }
    }

    get hasFollowup(): Boolean {
        return this.postmods != null;
    }
}

/**
 * A partial part of a skill's execution.
 *
 * This peforms several specific actions
 *     - generating events to be added to the queue
 *     - adding mods to a DamageModGroup
 *     TODO: complete
 */
export interface ISkillEffect {
    name: String;
    tags: Array<DamageTag>;
    execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult;
}

class BasicAttackEffect implements ISkillEffect {
    public name = 'Basic Attack Effect';
    public tags: Array<DamageTag> = [];

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        return null;
    }
}

/** 
 * No initial damage(zeroed) but postmods set to represent travel time.
 */
class TossedBladeEffect implements ISkillEffect {
    public name = 'Tossed Blade Effect';
    public tags: Array<DamageTag> = [];

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        // Zero initial damage
        let initial = new DamageModGroup([new Zero()]);

        // Schedule future damage 0.3s from now
        let postDelay = TicksPerSecond * 0.3;
        // Pass through mods, nothing special apart from the delay
        let postmods = mods;

        // Zero the initial impact
        return new SkillResult(initial, postmods, postDelay);
    }

}

// Is it possible to not have to create an event inside a Skill?
// 
// An event requires the complete execution to be present, could we
// potentially return an immediate DamageModGroup,
// a post-DamageModGroup, and a delay for that post to be executed at?

// PROBLEM: range needs to be resolved when the event resolves, not
// when the skill is executed... Each skill has a type of range...
// SOLUTION: RangeSKILL will be constructed with two CharacterStates and 
// distance is calculated at apply time. I like this.

// EH: since we can have multiple effects per skill, perhaps a SkillEffect
// should be an (optional) scheduled time and a DamageModGroup?
// 
// I LIKE THIS.
// 
// THIS DOES NOT WORK.

// YO: Damage should apply to a Character, a Character
// shouldn't manually apply a Damage. Damage should have a chance
// to ignite/freeze/shock and can apply those on characters when necessary.
// 
// ie, '10% chance to ignite' is a DamageMod and effects that on the Damage.
