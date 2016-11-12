import { Damage, DamageTag } from './Damage';
import { MoveDistance } from './Pack';

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
     * ie, 'increased' and 'reduced'
     */
    GlobalAdd,
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
    Always
}

/** Any Damage Modifier that effects the calculation of damage */
export interface IDamageMod {
    /** Name of a DamageMod */
    name: String;
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
    apply(d: Damage): Damage;
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
export interface IRangeMod extends IDamageMod {
    /** 
     * Distance the skill is used from the target
     *
     * This is allowed to be null given that distance is typically
     * not set until a mod is cloned and added to a DamageModGroup.
     */
    distance: number | null;
    /**
     * Determine how to move based entirely on provided distance
     *
     * This MUST abide by the rule that Hold means the skill should be used
     * while Closer or Farther mean that movement is absolutely necessary.
     *
     * target is the minimum coefficient you wish the mod to apply,
     * higher coefficient means more damage.
     */
    movement(distance: number, target: number): MoveDistance;
    /** Create a new IRangeMod with equivalenyt functionality */
    clone(): IRangeMod;
}

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
    public apply(d: Damage): Damage {
        // Process mods in the group so they are executed properly 
        let summed = DamageModGroup.sum(this.mods);
        let ordered = DamageModGroup.order(summed);

        console.log(ordered);

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

            d = mod.apply(d);
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
