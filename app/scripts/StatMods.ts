import {TicksPerSecond} from './ARPGState';

/** Argument type for Stats constructor */
export type StatsArg = {
    Health: number;
    /** 
     * Tick time required to attack
     *
     * Default is one second with
     * an attack Skill applying a flat added mod.
     */
    AttackTime: number;
    /**
     * Tick time required to cast a spell
     *
     * Default is zero with
     * a Spell Skill applying a flat added mod.
     */
    CastTime: number;
};

/** Sane default baseline stats */
export const baseStatsArg: StatsArg = {
    Health: 50,
    AttackTime: TicksPerSecond / 1,
    CastTime: 0,
};

export class Stats {
    public health: number;
    public attackTime: number;
    public castTime: number;

    constructor(base: StatsArg) {
        ({
            Health: this.health,
            AttackTime: this.attackTime,
            CastTime: this.castTime,
        } = base);
    }

    public clone(): Stats {
        return Object.assign(new Stats(baseStatsArg), this);
    }
}

export const enum StatModOrder {
    Base = 0,
    Add,
    Mult
}

/** Any Stats Modifier that effects the calculation of stats */
export interface IStatMod {
    /** Name of a StatMod */
    name: String;
    /** Whether or not the StatMod can be reasonably summed */
    canSum: Boolean;
    /** The point this StatMod is applied relative to other StatMods */
    position: StatModOrder;
    /** Apply the DamageMod to provided Damage */
    apply(s: Stats): Stats;
    /** Sum two IDamgeMod instances of the same name with canSum true */
    sum(other: IStatMod): IStatMod;
}

/** Explicit additions to the health pool before scaling */
export class FlatAddedHealth implements IStatMod {
    public name = 'FlatAddedHealthMod';
    public canSum = true;

    public position = StatModOrder.Add;

    constructor(public flat: number) { }

    public apply(s: Stats): Stats {
        s.health += this.flat;
        return s;
    }

    public sum(other: FlatAddedHealth): FlatAddedHealth {
        return new FlatAddedHealth(this.flat + other.flat);
    }
}

/** Flat attack time */
export class BaseAttackTime implements IStatMod {
    public name = 'BaseAttackSpeedMod';
    public canSum = true;

    public position = StatModOrder.Add;

    constructor(public time: number) { }

    public apply(s: Stats): Stats {
        s.attackTime += this.time;
        return s;
    }

    public sum(other: BaseAttackTime): BaseAttackTime {
        // Disallow multiple BaseAttackTimes by catching it here.
        throw Error('BaseAttackTime should have a single source');
    }
}

/** Percentage increased attack speed */
export class IncreasedAttackSpeed implements IStatMod {
    public name = 'IncreasedAttackSpeedMod';
    public canSum = true;

    public position = StatModOrder.Add;

    constructor(public percent: number) { }

    public apply(s: Stats): Stats {
        // Attack time should be reduced by this,
        // thus the shenanigans.
        s.attackTime *= 1 / (1 + this.percent);
        return s;
    }

    public sum(other: IncreasedAttackSpeed): IncreasedAttackSpeed {
        return new IncreasedAttackSpeed(this.percent + other.percent);
    }
}

/**
 * A set of StatMods which are applied as an atomic operation.
 *
 * This enforces the application order and summation of its underlying mods.
 *
 * NOTE: This is mostly derived from DamageModGroup's implementation.
 */
export class StatModGroup {

    /** Return all summable mods as their sums */
    private static sum(mods: Array<IStatMod>): Array<IStatMod> {
        let summed = new Array<IStatMod>();

        // Buckets of summable mods with the same names
        let buckets = new Map<String, Array<IStatMod>>();

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
            let merged = StatModGroup.mergeBucket(bucket);
            summed.push(...merged);
        });

        return summed;
    }

    /** Reduce the bucket to mods which can be merged. */
    private static mergeBucket(bucket: Array<IStatMod>): Array<IStatMod> {
        // Naive reduce to sum as we don't need to check for summable
        return [bucket.reduce((prev, current) => current.sum(prev))];
    }

    /** Return all mods in their correct execution order */
    private static order(mods: Array<IStatMod>): Array<IStatMod> {
        // Sort in ascending order, this implicitly respects
        // the ordering as DamageModOrder is an ascending enum.
        return mods.sort((a, b) => a.position - b.position);
    }

    public mods: Array<IStatMod>;

    constructor() {
        this.mods = [];
    }

    /** Add a StatMod to the group. */
    public add(mod: IStatMod) {
        this.mods.push(mod);
    }

    /**
     * Apply mods in this group to provided Damage
     *
     * NOTE: there is no guarantee the initial Damage instance
     * will remain unmodified.
     */
    public apply(s: Stats): Stats {
        // Process mods in the group so they are executed properly 
        let summed = StatModGroup.sum(this.mods);
        let ordered = StatModGroup.order(summed);

        console.log(ordered);

        // Apply each mod.
        ordered.forEach(mod => s = mod.apply(s));

        return s;
    }

}