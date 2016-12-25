import { IDamageMod } from './DamageMods';
import { Stats, StatModGroup, baseStatsArg, IStatMod } from './StatMods';
import { ISkill } from './Skill';
import { entityCode } from './random';

import { register } from './SerialDecorate';

export const enum GearSlot {
    Chest = 0,
    Boots,
    Gloves,
    Helmet,
    Weapon,
}

@register
export class Gear {
    constructor(public slot: GearSlot,
        public damageMods: Array<IDamageMod>,
        public statMods: Array<IStatMod>) { }
}

@register
export class LoadOut {
    constructor(public gear: Array<Gear>) {
        // Ensure each piece of gear is sitting in a different slot
        let usedSlots = new Set<GearSlot>();
        let overlaps = gear.some(g => {
            if (usedSlots.has(g.slot)) return true;
            usedSlots.add(g.slot);
            return false;
        });

        if (overlaps) throw Error('multiple gear items in same slot');
    }

    /**
     * Create an array of DamageMods from this LoadOut
     *
     * This is typically used to seed the initial DamageModGroup for a hit.
     */
    public getMods(): Array<IDamageMod> {
        return this.gear.reduce((prev, g): Array<IDamageMod> => {
            prev.push(...g.damageMods);
            return prev;
        }, (<Array<IDamageMod>>[]));
    }

    /**
     * Create an array of StatMods from this LoadOut
     *
     * This is typically used to seed the initial StatModGroup.
     */
    public getStatMods(): Array<IStatMod> {
        return this.gear.reduce((prev, g): Array<IStatMod> => {
            prev.push(...g.statMods);
            return prev;
        }, (<Array<IStatMod>>[]));
    }
}

@register
export class Character {
    public identity: string;
    constructor(public loadout: LoadOut,
        public skill: ISkill,
        public baseStats: string) {

        this.identity = entityCode();
    }

    /** 
     * Return a DamageModGroup representing the entire
     * set of Damage modifiers that this Character can have.
     */
    public getMods(): Array<IDamageMod> {
        // TODO: include passives and such
        return this.loadout.getMods();
    }

    /**
     * Return computed stats for this Character.
     */
    get stats(): Stats {
        // Fetch baseline from gear
        let base = this.loadout.getStatMods();
        // TODO: include passives and such
        // Factor in the skill's modifier to execution time
        base.push(this.skill.timeMod);

        // Create a new group
        let group = new StatModGroup();
        base.forEach(mod => group.add(mod));

        return group.apply(new Stats(baseStatsArg));
    }
}
