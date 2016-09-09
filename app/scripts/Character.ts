// import * as StateMachine from 'state-machine';

export class Character {
    public identity: string;
    public gear: string;
    public skill: string;
    public baseStats: string;
}

export const enum GearSlot {
    Chest = 0,
    Boots,
    Gloves,
    Helmet,
    Weapon,
}

export class Gear {
    constructor(public slot: GearSlot,
        public mods: Array<IDamageMod>) { }
}

export const enum Elements {
    Fire = 0,
    Light,
    Cold,
}

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

/** Any Damage Modifier that effects the calculation of damage */
interface IDamageMod {
    /** Name of a DamageMod */
    name: String;
    /** Whether or not the DamageMod can be reasonably summed */
    canSum: Boolean;
    /**
     * The set of DamageTag enums that all must
     * be present for the mod to be applied.
     *
     * This must be constant across all DamageMods with the same name.
     */
    reqTags: Set<DamageTag>;
    /** The point this DamageMod is applied relative to other DamageMods */
    position: DamageModOrder;
    /** Apply the DamageMod to provided Damage */
    apply(d: Damage): Damage;
    /** Sum two IDamgeMod instances of the same name with canSum true */
    sum(other: IDamageMod): IDamageMod;
    /**
     * Determine if two DamageMods with equal names can be summed.
     *
     * This is optional and is checked as necessary.
     */
    summable?(other: IDamageMod): Boolean;
}

/** The application of armor to mitigate physical damage */
export class ArmorDamageMod implements IDamageMod {
    public name = 'ArmorDamageMod';
    public canSum = true;

    public reqTags = new Set();
    public position = DamageModOrder.Mitigation;

    constructor(public armor: number) { }

    public apply(d: Damage): Damage {
        let phys = (10 * d.phys * d.phys) / (this.armor + (10 * d.phys));
        d.phys = phys;
        return d;
    }

    public sum(other: ArmorDamageMod): IDamageMod {
        return new ArmorDamageMod(this.armor + other.armor);
    }
}

/** The application of a resistance to mitigate an element's damage */
export class ResistsDamageMod implements IDamageMod {
    public name = 'ResistsDamageMod';
    public canSum = true;

    public reqTags = new Set();
    public position = DamageModOrder.Mitigation;

    constructor(public resistance: number, public element: Elements) { }

    public apply(d: Damage): Damage {
        // Fetch resistance for this element
        let magnitude = d.getElement(this.element);
        // Mitigate damage
        let applied = (1 - this.resistance) * magnitude;
        // Update Damage with new element value
        d.setElement(this.element, applied);
        return d;
    }

    public sum(other: ResistsDamageMod): IDamageMod {
        if (!this.summable(other)) {
            throw Error('this mod is not summable with other');
        }
        // Cap resists at 75% mitigation
        let capped = Math.min(this.resistance + other.resistance, 0.75);

        return new ResistsDamageMod(capped, this.element);
    }

    public summable(other: ResistsDamageMod): Boolean {
        return this.element === other.element;
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
        let buckets = new Map<String, Array<IDamageMod>>();

        // Split the mods so they are easier to process.
        mods.forEach(mod => {
            // Immediately filter out non-summable mods
            if (!mod.canSum) {
                summed.push(mod);
            } else {
                // Push summable mods into buckets
                let bucket = buckets.get(mod.name);
                if (!bucket) bucket = new Array();
                bucket.push(mod);
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
    private static mergeBucket(bucket: Array<IDamageMod>): Array<IDamageMod> {
        // Two possible paths, either the first mod in a bucket
        // has summable present or not.
        if (!bucket[0].summable) {
            // Naive reduce to sum as we don't need to check summable
            return [bucket.reduce((prev, current) => current.sum(prev))];
        }

        // Keep track of which mods have been summed
        let used = new Set<number>();

        // Handle summable not allowing mods of the same name to be merged
        return bucket.map((mod, topIndex) => {
            // Skip used mods
            if (used.has(topIndex)) return null;
            // Note that this mod is used. At this point, it will
            // always be returned to summed in one form or another.
            used.add(topIndex);

            bucket.forEach((other, index) => {
                // Skip used mods
                if (used.has(index)) return;

                // Check if these are compatible mods
                if (mod.summable(other)) {
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

    constructor(public mods: Array<IDamageMod>) { }

    public add(mod: IDamageMod) {
        this.mods.push(mod);
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
}

export const enum DamageTag {
    // Top level tags that must be attached to Damage
    Attack, DOT, Melee, Projectile,
    AOE, Fire, Light, Cold,
}

export class Damage {
    constructor(public tags: Set<DamageTag>,
        public phys: number = 0,
        public fire: number = 0,
        public light: number = 0,
        public cold: number = 0) { }

    /**
     * Returns the magnitude of the element on this Damage.
     *
     * This allows elements to be stored as top level properties
     * while also allowing for more general DamageMods
     */
    public getElement(element: Elements): number {
        let magnitude: number;
        switch (element) {
            case Elements.Fire:
                magnitude = this.fire;
                break;
            case Elements.Light:
                magnitude = this.light;
                break;
            case Elements.Cold:
                magnitude = this.cold;
                break;
            default:
                throw Error('fell through Elements switch');
        }

        return magnitude;
    }

    /**
     * Set the magnitude of the element on this Damage.
     *
     * This allows elements to be stored as top level properties
     * while also allowing for more general DamageMods
     */
    public setElement(element: Elements, magnitude: number) {
        switch (element) {
            case Elements.Fire:
                this.fire = magnitude;
                break;
            case Elements.Light:
                this.light = magnitude;
                break;
            case Elements.Cold:
                this.cold = magnitude;
                break;
            default:
                throw Error('fell through Elements switch');
        }
    }
}

// export class Orange implements StateMachine {
//     public flavor: string;
//     public current: string;
//     constructor(flavor: string) {
//         this.flavor = flavor;
//     }
// }

// interface IApples extends StateMachine {
//     warn?: StateMachineEvent;
//     panic?: StateMachineEvent;
//     calm?: StateMachineEvent;
//     clear?: StateMachineEvent;
// }

// let fsm: IApples = StateMachine.create({
//     initial: 'green',
//     events: [
//         { name: 'warn', from: 'green', to: 'yellow' },
//         { name: 'panic', from: 'yellow', to: 'red' },
//         { name: 'calm', from: 'red', to: 'yellow' },
//         { name: 'clear', from: 'yellow', to: 'green' },
//     ],
//     callbacks: {
//         onpanic: function(event?, from?, to?, msg?) { console.log('apples'); },
//         onclear: function(event?, from?, to?, msg?) { console.log('cleared'); },
//         ongreen: function(event?, from?, to?) { document.body.className = 'green'; },
//         onyellow: function(event?, from?, to?) { document.body.className = 'yellow'; },
//         onred: function(event?, from?, to?) { document.body.className = 'red'; },
//     },
// });

// fsm.warn();
// fsm.panic();

// console.log('we were executed!');

// export = fsm;

console.log('Character.ts was executed completely!');
