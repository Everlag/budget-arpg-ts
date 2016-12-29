import { TicksPerSecond, State, Event, EventType } from './ARPGState';
import { CharacterState } from './CharacterState';
import { DamageTag, Damage, Elements } from './Damage';
import { DamageModGroup, DamageModDirection } from './DamageMods';
import { PositionBounds } from './Movement';
import { ITargeting } from './Targeting';
import * as DamageMods from './DamageModRegistry';
import * as Targetings from './Targeting';
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
        baseTarget: CharacterState,
        state: State) {
        // Prevent multiple execution.
        if (this.applied) throw Error('cannot apply SkillResult > 1 time');
        this.applied = true;

        // Calculate relevant distances
        let distance = target.Position
            .distanceTo(source.Position);
        let baseTargetDistance = baseTarget.Position
            .distanceTo(source.Position);

        // Apply the Damage
        let initialDamage = this.mods
            .apply(new Damage(this.tags, distance, baseTargetDistance),
            target, source);
        initialDamage.apply(target, source);

        // Skip followup calculation when we don't have one.
        if (!this.hasFollowup) return;

        // Schedule an event to complete to resolve the postmods
        let e = new Event(EventType.SkillPostEffect,
            state.now + this.postDelay,
            () => {
                // Don't bother calculating and applying damage for the dead...
                if (target.isDead) return null;

                // Calculate and apply scheduled post-damage
                if (this.postmods) {
                    let postDistance = target.Position
                        .distanceTo(source.Position);
                    let postBaseTargetDistance = baseTarget.Position
                        .distanceTo(source.Position);
                    let postDamage = this.postmods
                        .apply(new Damage(new Set(), postDistance, postBaseTargetDistance),
                        target, source);
                    postDamage.apply(target, source);
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
    targeting: ITargeting;
    /** Singular time modifier allowed for a skill */
    timeMod: StatMods.IStatMod;
    effects: Array<ISkillEffect>;
    execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult>;
}

/**
 * A partial part of a skill's execution.
 */
export interface ISkillEffect {
    name: String;
    tags: Array<DamageTag>;
    targeting: ITargeting;
    execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult;
}

class BasicAttackEffect implements ISkillEffect {
    public static targeting = new Targetings
        .SingleTargetDiscrete(PositionBounds.ScreenSize / 10);

    public name = 'Basic Attack Effect';
    public tags = [DamageTag.Attack, DamageTag.Melee];

    public targeting = BasicAttackEffect.targeting;

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        return new SkillResult(mods, new DamageModGroup(),
            new Set(this.tags), 0);
    }
}

export class BasicAttack implements ISkill {
    public name = 'Basic Attack';

    public timingBy = SkillTiming.Attack;

    public targeting = BasicAttackEffect.targeting;
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
    public static targeting = new Targetings
        .SingleTargetDiscrete(PositionBounds.ScreenSize / 5);

    public name = 'Tossed Blade Effect';
    public tags = [DamageTag.Attack, DamageTag.Ranged];

    public targeting = TossedBladeEffect.targeting;

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
    public targeting = TossedBladeEffect.targeting;
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

class GroundSmashEffect implements ISkillEffect {
    public static targeting = new Targetings
        .DirectedAoEDiscrete(PositionBounds.ScreenSize / 10,
        PositionBounds.ScreenSize / 10);

    public name = 'Ground Smash Effect';
    public tags = [DamageTag.Attack, DamageTag.Melee];

    public targeting = GroundSmashEffect.targeting;

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        return new SkillResult(mods, new DamageModGroup(),
            new Set(this.tags), 0);
    }
}

/** An attack aimed at the ground */
export class GroundSmash implements ISkill {

    public name = 'GroundSmash';

    public timingBy = SkillTiming.Attack;
    public targeting = GroundSmashEffect.targeting;
    // 10% reduced inherent attack speed for fun
    public timeMod = new StatMods.IncreasedAttackSpeed(-0.5);

    public effects = [new GroundSmashEffect()];

    /** Execute each effect of this skill and return the results */
    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult> {

        let results = this.effects.map(effect => {
            return effect.execute(target, user, mods.clone());
        });

        return results;
    }
}

class FireNovaEffect implements ISkillEffect {
    public static targeting = new Targetings
        .DirectedAoEDiscrete(PositionBounds.ScreenSize / 5,
        PositionBounds.ScreenSize / 20);

    public name = 'Fire Nova Effect';
    public tags = [DamageTag.Spell, DamageTag.Ranged];

    public targeting = FireNovaEffect.targeting;

    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): SkillResult {

        // Add the flat fire damage
        mods.add(new DamageMods.LocalElement(3, 6, Elements.Fire),
            DamageModDirection.Dealing);

        return new SkillResult(mods, new DamageModGroup(),
            new Set(this.tags), 0);
    }
}

// A fire nova explodes at the target Character and is an area of effect.
export class FireNova implements ISkill {

    public name = 'Fire Nova';

    public timingBy = SkillTiming.Spell;
    public targeting = FireNovaEffect.targeting;
    // 10% increased inherent attack speed for fun
    public timeMod = new StatMods.IncreasedAttackSpeed(0.0);

    public effects = [new FireNovaEffect()];

    /** Execute each effect of this skill and return the results */
    public execute(target: CharacterState, user: CharacterState,
        mods: DamageModGroup): Array<SkillResult> {

        let results = this.effects.map(effect => {
            return effect.execute(target, user, mods.clone());
        });

        return results;
    }
}
