import {
    Stats, StatModGroup, StatModOrder,
    IStatusStatMod, IStatMod,
} from './StatMods';
import { IDamageMod } from './DamageMods';
import { CharacterState } from './CharacterState';
import { Event, TicksPerSecond } from './ARPGState';
import { Damage } from './Damage';

/** Burns last for 8 seconds */
export const BurnDuration = 8 * TicksPerSecond;
/** Burns deal 50% of the initial hit's fire damage over the duration */
export const BurnRatio = 0.5;

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
        // Remove the mod from our list
        console.log('removing Burning!', this.mods.length);
        this.mods = this.mods.filter(m => m !== mod);
        console.log('removed Burning!', this.mods.length);

        // Ensure we aren't dead...
        if (this.selfState.isDead) return;

        // Recalculate the stats
        let {context} = this.selfState;
        context.stats = this.applyStats(context.stats);
        // Force the stats to take effect
        context.reflectStatChange();
    }

    /** Apply Burning to a Character off of a hit if it has fire damage */
    public applyBurn(hit: Damage) {
        if (hit.fire === 0) return;

        console.log('applying burn!');

        // Determine the rate of damage scaled off the initial hit
        let rate = (BurnRatio * hit.fire) / BurnDuration;

        // Prepare the IStatusMod
        let burn: IStatusMod = {
            DamageMod: null,
            StatMod: new Burning(rate),
        };

        // Set an event to remove the burn
        let end = new Event(this.selfState.state.now + BurnDuration,
            () => {
                this.remove(burn);
                return null;
            }, null);
        this.selfState.state.addEvent(end);

        // Finally, add the mod
        this.add(burn);

        console.log(`burn applied, healthRegen=${this.selfState.context.stats.healthRegen}`);
    }

    /** Apply the StatMods */
    private applyStats(stats: Stats): Stats {
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
        statMods.forEach(s => group.add(s));
        inverseEffectives.forEach(s => group.add(s));

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
}
