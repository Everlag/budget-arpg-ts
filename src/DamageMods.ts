import {
    Damage, DamageTag,
    ElementArray, ElementToString,
} from './Damage';
import { CharacterState } from './CharacterState';

/**
 * The absolute ordering of DamageMods.
 *
 * A damage mod with a lower index is applied before a damage
 * mod with a higher index.
 */
export const enum DamageModOrder {
    /**
     * Mods effecting base damage
     *
     * ie, those found on weapons or spell skills
     */
    Local = 0,
    /**
     * Flat added damage
     *
     * ie, equipment or skill effects
     */
    AddedDamage,
    /**
     * Scaling 'Base Damage'
     *
     * ie, Deals % of Base Attack Damage
     *
     * Mark of GGG:
     *     'Your Base Attack damage is the
     *      damage listed on your weapon, plus any added damage,
     *      and that's what's modified by those stats on attack skills.'
     */
    BaseDamageScale,
    /**
     * Conversion modifies destructively changing one damage type to another
     *
     * ie, % of Cold Damage Converted to Fire Damage
     */
    ConvertTo,
    /**
     * Conversion from one damage type to another without changing
     * the original type
     *
     * ie, 'gain % of phys as extra cold'
     */
    AddedConvert,
    /**
     * Additive modifiers from any source
     *
     * Additive modifers may not directly affect damage, they must
     * apply to the 'increased' property on the Damage instance.
     *
     * ie, 'increased' and 'reduced'
     */
    GlobalAdd,
    /**
     * Application of additive modifiers
     *
     * This addresses a limitation of the IDamageModSummable interface
     * and is an implementation detail.
     *
     * ie, two mods saying '10% increased fire damage' now become
     *     a total of '20% increased fire damage' rather than
     *     an effective two '10% more fire damage' 
     */
    PostGlobalAdd,
    /**
     * Multiplicative modifiers from any source
     *
     * ie, 'more' and 'less'
     */
    GlobalMult,
    /**
     * Miscellaneous modifiers applied before mitigation
     *
     * ie, n of 3 projectiles colliding
     */
    PostInitial,
    /**
     * Distance between two entities effecting scaling
     *
     * There should be only a single Range modifier.
     */
    Range,
    /**
     * Mitigations
     *
     * ie, armor for physical damage or resists for elemental
     */
    Mitigation,
    /**
     * Mitigations that apply after the initial mitigation
     *
     * ie, resolve which should have armor and resists happen first
     */
    PostMitigation,
    /**
     * Mods that modify the impact of statuses that the Damage
     * can apply but do not effect the actual sum of the Damage.
     *
     * ie, calculating percent of fire leeched as life 
     */
    StatusCalc,
}

/** 
 * Possible direction a DamageMod requires in order to be applied.
 *
 * As mitigations are included as DamageMods, this prevents a Character
 * from mitigating the damage they deal.
 */
export const enum DamageModDirection {
    /** Apply this mod only when taking receiving damage */
    Taking = 0,
    /** Apply this mod only when dealing damage */
    Dealing,
    /** Always apply this mod */
    Always,
}

/** Any Damage Modifier that effects the calculation of damage */
export interface IDamageMod {
    /** Name of a DamageMod */
    name: String;
    /** Pretty printing the DamageMod */
    readonly pretty: string;
    /**
     * The set of DamageTag enums that all must
     * be present for the mod to be applied.
     *
     * This must be constant across all DamageMods with the same name.
     */
    reqTags: Set<DamageTag>;
    /** The point this DamageMod is applied relative to other DamageMods */
    position: DamageModOrder;
    /**
     * The direction this DamageMod requires to be applied
     *
     * DamageModGroup is required to silently drop mods of the incorrect
     * direction when adding them.
     */
    direction: DamageModDirection;
    /** Apply the DamageMod to provided Damage */
    apply(d: Damage, target: CharacterState, source: CharacterState): Damage;
    /** 
     * Create a new DamageMod with equivalent functionality
     *
     * This allows a DamageModGroup to be cloned.
     */
    clone(): IDamageMod;
}

/** 
 * A DamageMod that determines the impact of distance
 *
 * Note: typical usage is a skill adding a clone of its saved instance
 *       with the actual distance set.
 */
export interface IRangeMod extends IDamageMod { }

/**
 * Any IDamageMod that can be summed with either all or
 * a subset of the same mod
 */
export interface IDamageModSummable extends IDamageMod {
    /** Sum two IDamgeMod instances of the same name with canSum true */
    sum(other: IDamageModSummable): IDamageModSummable;
    /**
     * Determine if two DamageMods with equal names can be summed.
     *
     * This is optional and is checked as necessary.
     */
    summable?(other: IDamageMod): Boolean;
}

/**
 * Narrow the provided mod to either summable or false.
 */
function isIDamageModSummable(mod: any): IDamageModSummable | Boolean {
    if (typeof mod.sum === 'function') {
        return <IDamageModSummable>mod;
    }
    return false;
}

class PostGlobalAddCleanup implements IDamageMod {
    public name = 'PostGlobalAddCleanupDamageMod';

    public direction = DamageModDirection.Always;

    public reqTags = new Set();
    public position = DamageModOrder.PostGlobalAdd;

    public apply(d: Damage): Damage {
        // It's important these keys are the canonical representations
        // of the elements provided by ElementToString
        let elements: { [key: string]: number | null } = {
            Fire: null,
            Light: null,
            Cold: null,
        };
        // This looks super pedantic but ensures we can't add an element
        // without changing this.
        let {
            phys,
            fire,
            light,
            cold,
            criticalChance,
        } = d.increased;
        /* tslint:disable */
        elements['Fire'] = fire;
        elements['Light'] = light;
        elements['Cold'] = cold;
        /* tslint:enable */

        ElementArray().forEach(element => {
            // Grab the string key
            let stringKey = ElementToString(element);
            // So, that's a scary looking type assertion
            // but I assure you, all is well.
            let multiplier = elements[stringKey];
            // Check sanity
            if (!multiplier) throw Error('element not found in PostGlobalAddCleanup');
            // If all went well, we have a multiplier to apply
            let magnitude = d.getElement(element);
            let applied = magnitude * multiplier;
            d.setElement(element, applied);
        });

        // As usual, phys sits here, unfancy as per usual.
        d.phys *= phys;
        // Also, handle criticalChance
        d.criticalChance *= criticalChance;

        return d;
    }

    public clone(): IDamageMod {
        throw Error('attempted to clone PostGlobalAddCleanup');
    }

    public get pretty(): string {
        return ``;
    }
}

/**
 * A set of DamageMods which are applied as an atomic operation.
 *
 * This enforces the application order and summation of its underlying mods.
 */
export class DamageModGroup {

    /** Return all summable mods as their sums */
    private static sum(mods: Array<IDamageMod>): Array<IDamageMod> {
        let summed = new Array<IDamageMod>();

        // Buckets of summable mods with the same names
        let buckets = new Map<String, Array<IDamageModSummable>>();

        // Split the mods so they are easier to process.
        mods.forEach(mod => {
            // Manually narrow the type
            let summable = isIDamageModSummable(mod);
            // Immediately filter out non-summable mods
            if (!summable) {
                summed.push(mod);
            } else {
                // Push summable mods into buckets
                let bucket = buckets.get(mod.name);
                if (!bucket) bucket = new Array();
                bucket.push(<IDamageModSummable>summable);
                buckets.set(mod.name, bucket);
            }
        });

        // Go through each bucket and merge the mods that can be merged
        // and add those to summed.
        [...buckets.values()].forEach(bucket => {
            let merged = DamageModGroup.mergeBucket(bucket);
            summed.push(...merged);
        });

        return summed;
    }

    /** Reduce the bucket to mods which can be merged. */
    private static mergeBucket(bucket: Array<IDamageModSummable>): Array<IDamageMod> {
        // Two possible paths, either the first mod in a bucket
        // has summable present or not.
        if (!bucket[0].summable) {
            // Naive reduce to sum as we don't need to check summable
            return [bucket.reduce((prev, current) => {
                if (current.sum) {
                    return current.sum(prev);
                } else {
                    throw 'attempting so sum unsummable';
                }
            })];
        }

        // Keep track of which mods have been summed
        let used = new Set<number>();

        // Handle summable not allowing mods of the same name to be merged
        return <Array<IDamageMod>>bucket.map((mod, topIndex) => {
            // Skip used mods
            if (used.has(topIndex)) return null;
            // Note that this mod is used. At this point, it will
            // always be returned to summed in one form or another.
            used.add(topIndex);

            bucket.forEach((other, index) => {
                // Skip used mods
                if (used.has(index)) return null;

                // Check if these are compatible mods
                if (mod.summable && mod.sum && mod.summable(other)) {
                    mod = mod.sum(other);
                    // Note that this has been used
                    used.add(index);
                }
            });

            return mod;
        }).filter(mod => mod != null);
    }

    /** Return all mods in their correct execution order */
    private static order(mods: Array<IDamageMod>): Array<IDamageMod> {
        // Sort in ascending order, this implicitly respects
        // the ordering as DamageModOrder is an ascending enum.
        return mods.sort((a, b) => a.position - b.position);
    }

    public mods: Array<IDamageMod>;

    constructor() {
        this.mods = [];
    }

    /** 
     * Add a DamageMod to the group under the context of a specific direction
     *
     * This silently drops mods of the incorrect direction.
     */
    public add(mod: IDamageMod, direction: DamageModDirection) {
        // Push the mod only if the direction is satisfied
        if (mod.direction === direction ||
            mod.direction === DamageModDirection.Always) {
            this.mods.push(mod);
        }
    }

    /**
     * Apply mods in this group to provided Damage
     *
     * NOTE: there is no guarantee the initial Damage instance
     * will remain unmodified.
     */
    public apply(d: Damage,
        target: CharacterState, source: CharacterState): Damage {

        // Add the mod that smoothes over the increased multiplier
        this.add(new PostGlobalAddCleanup(), DamageModDirection.Always);

        // Process mods in the group so they are executed properly 
        let summed = DamageModGroup.sum(this.mods);
        let ordered = DamageModGroup.order(summed);

        // Apply each mod.
        ordered.forEach(mod => {
            // Ensure there is at least some tag overlap
            // if the mod has required tags
            let tagOverlap = [...mod.reqTags.values()]
                .reduce((prev, current) => {
                    let hasShared = d.tags.has(current);
                    return hasShared || prev;
                }, false) || mod.reqTags.size === 0;

            // If no tag overlap, then continue
            if (!tagOverlap) return;

            d = mod.apply(d, target, source);
            // Ensure sum is not null as a result of a specific mod.
            if (isNaN(d.sum())) throw Error(`damage sum NaN post ${mod.name}`);
        });

        return d;
    }

    /** 
     * Return a copy of this DamageModGroup which is
     * mutable without modifying this group.
     */
    public clone(): DamageModGroup {
        let clone = new DamageModGroup();
        // Directly modify the clone's underlying mods as we've lost
        // the context to use add
        clone.mods.push(...this.mods.map(m => m.clone()));
        return clone;
    }
}
