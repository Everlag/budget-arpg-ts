import {
    Stats, StatModGroup, StatModOrder,
    IStatusStatMod, IStatMod,
} from './StatMods';
import { IDamageMod } from './DamageMods';
import { CharacterState } from './CharacterState';
import { Event, TicksPerSecond } from './ARPGState';
import { RecordFlavor } from './Recording';
import { Damage, ILeechSpec } from './Damage';

/**
 * Export default values for the status effects
 *
 * Each Damage instance will have these available.
 * This allows StatusEffects to be affected by DamageMods
 */

/** Burns last for 8 seconds */
export const BurnDuration = 8 * TicksPerSecond;
/** Burns deal 50% of the initial hit's fire damage over the duration */
export const BurnRatio = 0.5;

/** Chills last for up to 3 seconds */
export const MaxChilldDuration = 4 * TicksPerSecond;
/** Chills slow for a flat 40% */
export const ChillSlowMultiplier = 1.4;

/** 
 * Leech can recover 3% of maximum health per second per instance
 *
 * This is calculated post-mitigation, so this isn't actually
 * as significant a buff as it seems.
 *
 * NOTE: there is no overall cap for leeching as that doesn't fit nicely
 *       into the current code. That will probably be added later.
 */
export const LeechRate = 0.03 / TicksPerSecond;

interface IStatusMod {
    DamageMod: IDamageMod | null;
    StatMod: IStatusStatMod | null;
}

// TODO: handle diff, ie changing the rate of HealthRegen
// and such when the equivalent stats entry changes

export class StatusEffects {

    private mods: Array<IStatusMod> = [];

    constructor(public selfState: CharacterState) { }

    /** Add a StatusMod to the instance */
    public add(mod: IStatusMod) {
        // Add the mod to our collection
        this.mods.push(mod);

        // If this contains a StatMod, we need force
        // health recalculation before applying it.
        // 
        // We also just exit if they're dead...
        // ({ stats: baseStats, skill: this.skill } = base);
        if (this.selfState.isDead) return;

        // Apply the new status mod
        let {context} = this.selfState;
        context.stats = this.applyStats(context.stats);
        // Force the stats to take effect
        context.reflectStatChange();
    }

    /** Remove a StatusMod from the instance */
    public remove(mod: IStatusMod) {

        // Recalculate the stats
        let {context} = this.selfState;

        // Invert all currently active mods if this one is active
        if (mod.StatMod && mod.StatMod.effective) {
            context.stats = this.applyStatsInverse(context.stats);
        }

        // Remove the mod from our list
        this.mods = this.mods.filter(m => m !== mod);

        // Reclalculate stats
        context.stats = this.applyStats(context.stats);
        // Force the stats to take effect
        context.reflectStatChange();
    }

    /** Apply Burning to a Character off of a hit if it has fire damage */
    public applyBurn(hit: Damage) {
        if (hit.fire === 0) return;

        console.log('applying burn!');

        let {burnDuration, burnRatio} = hit.statusEffects;

        // Determine the rate of damage scaled off the initial hit
        let rate = (burnRatio * hit.fire) / burnDuration;

        // Prepare the IStatusMod
        let burn: IStatusMod = {
            DamageMod: null,
            StatMod: new Burning(rate),
        };

        // Set an event to remove the burn
        let end = new Event(RecordFlavor.EStatusEffect,
            this.selfState.state.now + burnDuration,
            () => {
                this.remove(burn);
                return null;
            }, null);
        this.selfState.state.addEvent(end);

        // Finally, add the mod
        this.add(burn);

        console.log(`burn applied, healthRegen=${this.selfState.context.stats.healthRegen}, duration=${burnDuration}`);
    }

    /** Apply Chilled to a Character off of a hit if it has cold damage */
    public applyChill(hit: Damage) {
        if (hit.cold === 0) return;

        let {maxChillDuration, chillSlowMultiplier} = hit.statusEffects;

        // Determine the duration as based off of the target's max health
        let fraction = (hit.cold / this.selfState.context.baseStats.health);
        let duration = fraction * maxChillDuration;
        // Potential chills for less than 200ms are ignored
        if (duration < 0.2 * TicksPerSecond) return;

        // Prepare the IStatusMod
        let chill: IStatusMod = {
            DamageMod: null,
            StatMod: new Chilled(chillSlowMultiplier),
        };

        // Set an event to remove the burn
        let end = new Event(RecordFlavor.EStatusEffect,
            this.selfState.state.now + duration,
            () => {
                this.remove(chill);
                return null;
            }, null);
        this.selfState.state.addEvent(end);

        // Finally, add the mod
        this.add(chill);

        console.log(`chill applied, fraction=${fraction} attackTime=${this.selfState.context.stats.attackTime}`);
    }

    /** Apply Leech to a Character off of a hit if it has cold damage */
    public applyLeech(hit: Damage) {

        // Determine the amounts leeched and if we should bother
        // actually applying a status
        let lifeLeeched = this.getLeechRate(hit, hit.healthLeech);
        let manaLeeched = this.getLeechRate(hit, hit.manaLeech);
        if (lifeLeeched + manaLeeched === 0) return;

        let {leechRate} = hit.statusEffects;

        // Determine how long this leech lasts for in ticks
        // 
        // The leech lasts for whichever of health and mana takes longer
        // so the shorter is effectively extended and is less effective
        let duration: number = NaN;
        if (lifeLeeched > manaLeeched) {
            // Life determines duration
            let maxHealth = this.selfState.context.baseStats.health;
            duration = lifeLeeched / (maxHealth * leechRate);
        } else {
            // Mana determines duration
            let maxMana = this.selfState.context.baseStats.mana;
            duration = manaLeeched / (maxMana * leechRate);
        }

        // Prepare the IStatusMod
        let leech: IStatusMod = {
            DamageMod: null,
            StatMod: new Leech(lifeLeeched / duration,
                manaLeeched / duration),
        };

        // Set an event to remove the effect
        let end = new Event(RecordFlavor.EStatusEffect,
            this.selfState.state.now + duration,
            () => {
                this.remove(leech);
                return null;
            }, null);
        this.selfState.state.addEvent(end);

        // Finally, add the mod
        this.add(leech);
        console.log(`leech applied, summedTotal=${lifeLeeched + manaLeeched}, duration=${duration}`);
    }

    /**
     * Given one of the leech specifications associated with a hit,
     * determine how much of the total Damage is leeched
     */
    private getLeechRate(hit: Damage, spec: ILeechSpec): number {
        let {phys, fire, light, cold} = spec;
        let sum = phys * hit.phys + fire * hit.fire +
            light * hit.light + cold * hit.cold;
        if (isNaN(sum)) throw Error('NaN sum in getLeechRate');
        return sum;
    }

    /** Invert all currently active StatMods */
    private applyStatsInverse(stats: Stats) {
        // Find all non-null stat mods
        let statMods = this.mods
            .map(mod => mod.StatMod)
            // Remove nulls
            .filter(s => s != null)
            .map(s => (<IStatusStatMod>s));

        // Find the inversions of the currently effective effects
        let inverseEffectives = statMods
            // Get only effective
            .filter(s => (<IStatusStatMod>s).effective)
            // Fetch inverses
            .map(s => (<IStatusStatMod>s).inverse());

        // Make all the currently effective effects ineffective
        statMods
            .filter(s => (<IStatusStatMod>s).effective)
            .forEach(s => s.effective = false);

        // Create a group and add all our mods and inverses to it
        let group = new StatModGroup();
        inverseEffectives.forEach(s => group.add(s));

        return group.apply(stats);
    }

    /** Apply the StatMods */
    private applyStats(stats: Stats): Stats {
        // Find all non-null stat mods
        let statMods = this.mods
            .map(mod => mod.StatMod)
            // Remove nulls
            .filter(s => s != null)
            .map(s => (<IStatusStatMod>s));

        // Invert the currently effective
        stats = this.applyStatsInverse(stats);

        // Create a group and add all our mods and inverses to it
        let group = new StatModGroup();
        statMods.forEach(s => group.add(s));

        return group.apply(stats);
    }

    /** 
     * Fetch damage mods applied by statuses
     *
     * TODO: enforce uniqueness of DamageMods ala StatMods
     */
    get damageMods(): Array<IDamageMod> {
        return this.mods
            .filter(mod => mod.DamageMod != null)
            .map(mod => <IDamageMod>mod.DamageMod);
    }
}

export class BurningInverse implements IStatMod {

    public name = 'BurningInverseMod';
    public canSum = true;

    public position = StatModOrder.StatusEffects;

    constructor(public rate: number) { }

    public apply(s: Stats): Stats {
        s.healthRegen += this.rate;
        return s;
    }

    public sum(other: BurningInverse): BurningInverse {
        // There can only be one as there's only one possible, effective
        // Burning instance at a time.
        console.log('other is:', other);
        throw Error('burning inverse attempted to sum');
    }

    public get pretty(): string {
        throw 'attempted to pretty print inverse IStatusStatMod';
    }
}

export class Burning implements IStatusStatMod {

    public name = 'BurningMod';
    public canSum = true;

    public position = StatModOrder.StatusEffects;

    /** Status mod defaults to not being in effect */
    public effective = false;

    constructor(public rate: number) { }

    public apply(s: Stats): Stats {
        this.effective = true;
        s.healthRegen -= this.rate;
        return s;
    }

    /** Return the higher of the two Burning instance's rates */
    public sum(other: Burning): Burning {
        if (this.rate > other.rate) {
            other.effective = false;
            return this;
        }
        this.effective = false;
        return other;
    }

    public inverse(): IStatMod {
        // Luckily, burning is an effect that is trivial to reverse
        return new BurningInverse(this.rate);
    }

    public get pretty(): string {
        return `Burning for ${this.rate * TicksPerSecond} per second`;
    }
}

export class ChilledInverse implements IStatMod {

    public name = 'ChilledInverseMod';
    public canSum = true;

    public position = StatModOrder.StatusEffects;

    constructor(public multiplier: number) { }

    public apply(s: Stats): Stats {
        s.attackTime *= 1 / this.multiplier;
        s.castTime *= 1 / this.multiplier;
        s.movespeed *= this.multiplier;
        return s;
    }

    public sum(other: ChilledInverse): ChilledInverse {
        // There can only be one as there's only one possible, effective
        // Burning instance at a time.
        console.log('other is:', other);
        throw Error('chilled inverse attempted to sum');
    }

    public get pretty(): string {
        throw 'attempted to pretty print inverse IStatusStatMod';
    }
}

export class Chilled implements IStatusStatMod {

    public name = 'ChilledMod';
    public canSum = true;

    public position = StatModOrder.StatusEffects;

    /** Status mod defaults to not being in effect */
    public effective = false;

    constructor(public multiplier: number) { }

    public apply(s: Stats): Stats {
        this.effective = true;
        s.attackTime *= this.multiplier;
        s.castTime *= this.multiplier;
        s.movespeed *= 1 / this.multiplier;
        return s;
    }

    /** Return the higher of the two Chilled instance's rates */
    public sum(other: Chilled): Chilled {
        if (this.multiplier > other.multiplier) {
            other.effective = false;
            return this;
        }
        this.effective = false;
        return other;
    }

    public inverse(): IStatMod {
        // Luckily, burning is an effect that is trivial to reverse
        return new ChilledInverse(this.multiplier);
    }

    public get pretty(): string {
        return `Chilled to ${this.multiplier * 100}% of normal speed`;
    }
}

export class LeechInverse implements IStatMod {

    public name = 'LeechInverseMod';
    public canSum = true;

    public position = StatModOrder.StatusEffects;

    constructor(public healthRate: number, public manaRate: number) { }

    public apply(s: Stats): Stats {
        s.healthRegen -= this.healthRate;
        s.manaRegen -= this.manaRate;
        return s;
    }

    public sum(other: LeechInverse): LeechInverse {
        // These are allowed to sum as there can be more than one possible
        // Leech instance active at a time
        return new LeechInverse(this.healthRate + other.healthRate,
            this.manaRate + other.manaRate);
    }

    public get pretty(): string {
        throw 'attempted to pretty print inverse IStatusStatMod';
    }
}

export class Leech implements IStatusStatMod {

    public name = 'LeechMod';
    public canSum = false;

    public position = StatModOrder.StatusEffects;

    /** Status mod defaults to not being in effect */
    public effective = false;

    constructor(public healthRate: number, public manaRate: number) { }

    public apply(s: Stats): Stats {
        this.effective = true;
        s.healthRegen += this.healthRate;
        s.manaRegen += this.manaRate;
        return s;
    }

    /** Return the higher of the two Burning instance's rates */
    public sum(other: Leech): Leech {
        other.effective = true;
        this.effective = true;
        return new Leech(this.healthRate + other.healthRate,
            this.manaRate + other.manaRate);
    }

    public inverse(): IStatMod {
        // Luckily, burning is an effect that is trivial to reverse
        return new LeechInverse(this.healthRate, this.manaRate);
    }

    public get pretty(): string {
        let healthPortion = '';
        let manaPortion = '';
        if (this.healthRate > 0) healthPortion = `${this.healthRate * TicksPerSecond} health`;
        if (this.manaRate > 0) manaPortion = `${this.manaRate * TicksPerSecond} mana`;
        if (healthPortion && manaPortion) {
            return `Leeching for ${healthPortion} and ${manaPortion} per second`;
        }
        return `Leeching for ${healthPortion}${manaPortion} per second`;
    }
}
