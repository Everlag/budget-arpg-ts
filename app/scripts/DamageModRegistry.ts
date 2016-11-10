import {
    IDamageMod, IRangeMod, IDamageModSummable,
    DamageModOrder, DamageModDirection,
} from './DamageMods';
import { Damage, Elements } from './Damage';
import { MovementDirection } from './Movement';
import { intfromInterval } from './Random';

/** Binary Range handling, is either within range or not */
export class DiscreteRange implements IRangeMod {
    public name = 'DiscreteRangeDamageMod';

    public direction = DamageModDirection.Taking;

    public reqTags = new Set();
    public position = DamageModOrder.Range;

    constructor(public distance: number, public range: number) { };

    public apply(d: Damage): Damage {
        // Zero if distance outside range
        if (this.distance > this.range) {
            d.phys = 0;
            d.setElement(Elements.Fire, 0);
            d.setElement(Elements.Light, 0);
            d.setElement(Elements.Cold, 0);
        }
        return d;
    }

    public movement(distance: number, target: number): MovementDirection {
        if (distance < this.range) return MovementDirection.Hold;
        return MovementDirection.Closer;
    }

    public clone(): IDamageMod {
        return Object.assign(new DiscreteRange(0, 0), this);
    }
}

/**
 * Range handling as linear falloff from a sweetspot
 *
 * If outside the [min, max], the Damage is zeroed.
 * Otherwise, (max + min)/2 is 100% damage
 * and decreases linearly till the bounds
 */
export class LinearFalloff implements IRangeMod {
    public name = 'LinearFalloffDamageMod';

    public direction = DamageModDirection.Taking;

    public reqTags = new Set();
    public position = DamageModOrder.Range;

    constructor(public distance: number,
        public minRange: number, public maxRange: number) {

        if (minRange > maxRange || minRange === maxRange) {
            throw 'invalid minRange, maxRange in LinearFalloffDamageMod';
        }
    };

    public apply(d: Damage): Damage {
        // Zero if distance outside possible ranges
        if (this.distance < this.minRange || this.distance > this.maxRange) {
            d.phys = 0;
            d.setElement(Elements.Fire, 0);
            d.setElement(Elements.Light, 0);
            d.setElement(Elements.Cold, 0);
            return d;
        }

        // Calculate midway point in range, the 'sweetspot'
        let sweetSpot = (this.minRange + this.maxRange) / 2;
        let delta = Math.abs(this.distance - sweetSpot);

        // Determine total range of values distance can sit in
        let window = (this.maxRange - this.minRange) / 2;

        // Finally, the coefficient we'll apply
        let coeff = 1 - (delta / window);

        // And apply it
        d.phys = d.phys * coeff;
        d.setElement(Elements.Fire, d.getElement(Elements.Fire) * coeff);
        d.setElement(Elements.Light, d.getElement(Elements.Light) * coeff);
        d.setElement(Elements.Cold, d.getElement(Elements.Cold) * coeff);

        return d;
    }

    public movement(distance: number, target: number): MovementDirection {
        // Handle easy edge cases
        if (this.distance < this.minRange) return MovementDirection.Farther;
        if (this.distance > this.maxRange) return MovementDirection.Closer;

        // Calculate midway point in range, the 'sweetspot'
        let sweetSpot = (this.minRange + this.maxRange) / 2;
        let delta = Math.abs(this.distance - sweetSpot);

        // Determine total range of values distance can sit in
        let window = (this.maxRange - this.minRange) / 2;

        // Finally, the coefficient we'll apply
        let coeff = 1 - (delta / window);

        if (coeff < target) return MovementDirection.Closer;
        return MovementDirection.Hold;
    }

    public clone(): IDamageMod {
        return Object.assign(new DiscreteRange(0, 0), this);
    }
}

/** The application of armor to mitigate physical damage */
export class Armor implements IDamageModSummable {
    public name = 'ArmorDamageMod';

    public direction = DamageModDirection.Taking;

    public reqTags = new Set();
    public position = DamageModOrder.Mitigation;

    constructor(public armor: number) { }

    public apply(d: Damage): Damage {
        let phys = (10 * d.phys * d.phys) / (this.armor + (10 * d.phys));
        d.phys = phys;
        return d;
    }

    public sum(other: Armor): Armor {
        return new Armor(this.armor + other.armor);
    }

    public clone(): IDamageMod {
        return Object.assign(new Armor(0), this);
    }
}

/** The application of a resistance to mitigate an element's damage */
export class Resistance implements IDamageModSummable {
    public name = 'ResistsDamageMod';

    public direction = DamageModDirection.Taking;

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

    public sum(other: Resistance): Resistance {
        if (!this.summable(other)) {
            throw Error('this mod is not summable with other');
        }
        // Cap resists at 75% mitigation
        let capped = Math.min(this.resistance + other.resistance, 0.75);

        return new Resistance(capped, this.element);
    }

    public summable(other: Resistance): Boolean {
        return this.element === other.element;
    }

    public clone(): IDamageMod {
        return Object.assign(new Resistance(0, Elements.Fire), this);
    }
}

/** Zero the Damage to nothing */
export class Zero implements IDamageMod {
    public name = 'ZeroDamageMod';

    public direction = DamageModDirection.Always;

    public reqTags = new Set();
    public position = DamageModOrder.PostInitial;

    public apply(d: Damage): Damage {
        // I know, it looks bad :|
        d.phys = 0;
        d.setElement(Elements.Fire, 0);
        d.setElement(Elements.Light, 0);
        d.setElement(Elements.Cold, 0);

        return d;
    }

    public clone(): IDamageMod {
        return Object.assign(new Zero(), this);
    }
}

/** 
 * Local, flat physical damage
 *
 * NOTE: this does sum
 */
export class LocalPhysical implements IDamageModSummable {
    public name = 'LocalPhysicalDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Local;

    constructor(public min: number, public max: number) { }

    public apply(d: Damage): Damage {
        // Roll in range
        let flatPhys = intfromInterval(this.min, this.max);
        // Apply flat physical
        d.phys += flatPhys;
        return d;
    }

    public sum(other: LocalPhysical): LocalPhysical {
        return new LocalPhysical(other.min + this.min, other.max + this.max);
    }

    public clone(): IDamageMod {
        return Object.assign(new LocalPhysical(0, 0), this);
    }
}

export class IncreasedCritChance implements IDamageModSummable {
    public name = 'IncreasedCritChanceDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.GlobalAdd;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        // Roll in range
        d.criticalChance *= 1 + this.percent;
        // Cap if chance is higher than maximum
        d.criticalChance = Math.min(d.criticalChance, 0.80);
        return d;
    }

    public sum(other: IncreasedCritChance): IncreasedCritChance {
        return new IncreasedCritChance(this.percent + other.percent);
    }

    public clone(): IDamageMod {
        return Object.assign(new IncreasedCritChance(0), this);
    }
}
