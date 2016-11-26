import { TicksPerSecond, State, Event } from './ARPGState';
import { CharacterState } from './CharacterState';
import { DamageTag, Damage } from './Damage';
import { DamageModGroup, IRangeMod, DamageModDirection } from './DamageMods';
import { PositionBounds } from './Movement';
import * as DamageMods from './DamageModRegistry';
import * as StatMods from './StatMods';

/** 
 * A SkillResult contains the mods for the initial skill use
 * as well as the post-mods and delay for any after-effect.
 *
 * postmods may be null to indicate no followup is to be scheduled.
 */
export class SkillResult {
    private applied: Boolean = false;

    constructor(public mods: DamageModGroup,
        public postmods: DamageModGroup | null,
        public tags: Set<DamageTag>, public postDelay: number) {

        if (mods === null) {
            throw Error('mods is null, prefer to add(new Zero()) instead');
        }
    }

    /** 
     * Apply this SkillEffect.
     *
     * This can be used only once.
     */
    public execute(target: CharacterState, source: CharacterState,
        state: State) {
        // Prevent multiple execution.
        if (this.applied) throw Error('cannot apply SkillResult > 1 time');
        this.applied = true;

        // Calculate and apply initial damage
        let initialDamage = this.mods
            .apply(new Damage(this.tags), target, source);
        initialDamage.apply(target);

        // Skip followup calculation when we don't have one.
        if (!this.hasFollowup) return;

        // Schedule an event to complete to resolve the postmods
        let e = new Event(state.now + this.postDelay,
            () => {
                // Don't bother calculating and applying damage for the dead...
                if (target.isDead) return null;

                // Calculate and apply scheduled post-damage
                if (this.postmods) {
                    let postDamage = this.postmods
                        .apply(new Damage(new Set()), target, source);
                    postDamage.apply(target);
                }

                return null;
            }, null);
        state.addEvent(e);
    }

    get hasFollowup(): Boolean {
        return this.postmods != null;
    }
}

/** 
 * The type of timing applied to the skill
 *
 * NOTE: relevant DamageTags still need to be present on each SkillEffect
 */
export const enum SkillTiming {
    Attack = 0,
    Spell,
}

/**
 * A full skill with all effects
 */
export interface ISkill {
    name: String;
    /** How timing for the skill is performed */
    timingBy: SkillTiming;
    /** How range for the skill is handled, this informs character movement */
    rangeBy: IRangeMod;
    /** Singular time modifier allowed for a skill */
    timeMod: StatMods.IStatMod;
    effects: Array<ISkillEffect>;
    execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult>;
}

/**
 * A partial part of a skill's execution.
 *
 * TODO: handle range here when we introduce it
 */
export interface ISkillEffect {
    name: String;
    tags: Array<DamageTag>;
    rangeBy: IRangeMod;
    execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult;
}

class BasicAttackEffect implements ISkillEffect {
    public static rangeBy = new DamageMods.
        DiscreteRange(PositionBounds.ScreenSize / 10);

    public name = 'Basic Attack Effect';
    public tags = [DamageTag.Attack, DamageTag.Melee];

    public rangeBy = BasicAttackEffect.rangeBy;

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        return new SkillResult(mods, new DamageModGroup(),
            new Set(this.tags), 0);
    }
}

export class BasicAttack implements ISkill {
    public name = 'Basic Attack';

    public timingBy = SkillTiming.Attack;

    public rangeBy = BasicAttackEffect.rangeBy;
    // Do not modify the base attack speed set by the gear
    public timeMod = new StatMods.IncreasedAttackSpeed(0);

    public effects = [new BasicAttackEffect()];

    /** Execute each effect of this skill and return the results */
    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult> {

        let results = this.effects.map(effect => {
            return effect.execute(target, user, mods.clone());
        });

        return results;
    }
}

/** 
 * No initial damage(zeroed) but postmods set to represent travel time.
 */
class TossedBladeEffect implements ISkillEffect {
    public static rangeBy = new DamageMods
        .DiscreteRange(PositionBounds.ScreenSize / 5);

    public name = 'Tossed Blade Effect';
    public tags = [DamageTag.Attack, DamageTag.Ranged];

    public rangeBy = TossedBladeEffect.rangeBy;

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        // Zero initial damage
        let initial = new DamageModGroup();
        initial.add(new DamageMods.Zero(), DamageModDirection.Always);

        // Schedule future damage 0.3s from now
        let postDelay = TicksPerSecond * 0.3;
        // Pass through mods, nothing special apart from the delay
        let postmods = mods;

        // Zero the initial impact
        return new SkillResult(initial, postmods,
            new Set(this.tags), postDelay);
    }

}

export class TossedBlade implements ISkill {
    public name = 'Tossed Blade';

    public timingBy = SkillTiming.Attack;
    public rangeBy = TossedBladeEffect.rangeBy;
    // 10% increased inherent attack speed for fun
    public timeMod = new StatMods.IncreasedAttackSpeed(0.1);

    public effects = [new TossedBladeEffect()];

    /** Execute each effect of this skill and return the results */
    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult> {

        let results = this.effects.map(effect => {
            return effect.execute(target, user, mods.clone());
        });

        return results;
    }
}

// PROBLEM: range needs to be resolved when the event resolves, not
// when the skill is executed... Each skill has a type of range...
// SOLUTION: RangeDamageMod will be constructed with two CharacterStates and
// distance is calculated at apply time. I like this.
