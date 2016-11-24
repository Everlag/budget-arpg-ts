import {
    IDamageMod, IRangeMod, IDamageModSummable,
    DamageModOrder, DamageModDirection,
} from './DamageMods';
import { Damage, Elements, ElementArray } from './Damage';
import { MovementDirection } from './Movement';
import { MoveDistance } from './Pack';
import { intfromInterval } from './Random';
import { CharacterState } from './CharacterState';

/** Binary Range handling, is either within range or not */
export class DiscreteRange implements IRangeMod {
    public name = 'DiscreteRangeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Range;

    public distance: number | null = null;

    constructor(public range: number) { };

    public apply(d: Damage): Damage {
        if (this.distance === null) throw Error('null distance');

        // Zero if distance outside range
        if (Math.abs(this.distance) > this.range) {
            console.log('DiscreteRange calculated, mult = 0!');
            d.phys = 0;
            d.setElement(Elements.Fire, 0);
            d.setElement(Elements.Light, 0);
            d.setElement(Elements.Cold, 0);
        }
        return d;
    }

    public movement(distance: number, target: number): MoveDistance {
        // Out of range implies we have to move closer
        if (Math.abs(distance) > this.range) {
            return new MoveDistance(MovementDirection.Closer,
                distance - this.range);
        }
        return new MoveDistance(MovementDirection.Hold, 0);
    }

    public clone(): IRangeMod {
        return Object.assign(new DiscreteRange(0), this);
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

/** 
 * The divserion of a percentage of taken damage into mana
 *
 * This applies equally across all elements and physcial damage.
 * When not enough manner is available to eat the full percentage,
 * whatever percentage can be mitigated will be mitigated
 */
export class Resolve implements IDamageModSummable {
    public name = 'ResolveDamageMod';

    public direction = DamageModDirection.Taking;

    public reqTags = new Set();
    public position = DamageModOrder.PostMitigation;

    constructor(public percent: number) { }

    public apply(d: Damage,
        target: CharacterState): Damage {
        // Amount of mana needed to mitigate all damage we can
        let totalDamage = d.sum() * this.percent;

        // Actual amount of mana used to mitigate
        let usedMana = Math.min(target.context.mana, totalDamage);

        // Short-circuit if there's no mana to use
        if (usedMana === 0) return d;

        // Determine what percent we can mitigate with
        let effectivePercent = (usedMana / totalDamage) * this.percent;

        // Mitigate over the elements
        ElementArray().forEach((element) => {
            let magnitude = d.getElement(element);
            // Mitigate damage
            let applied = (1 - effectivePercent) * magnitude;
            // Update Damage with new element value
            d.setElement(element, applied);
        });

        // Mitigate physical damage
        d.phys = d.phys * (1 - effectivePercent);

        // Remove used mana from the target of the  damage
        target.context.mana -= usedMana;

        return d;
    }

    public sum(other: Resolve): Resolve {
        // Ensure we can't mitigate more than 100% of the damage with this
        // because that's just wasteful.
        return new Resolve(Math.min(this.percent + other.percent, 1));
    }

    public clone(): IDamageMod {
        return Object.assign(new Resolve(0), this);
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

/** 
 * Local, flat physical damage
 *
 * NOTE: this does sum
 */
export class LocalFire implements IDamageModSummable {
    public name = 'LocalFireDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Local;

    constructor(public min: number, public max: number) { }

    public apply(d: Damage): Damage {
        // Roll in range
        let flatFire = intfromInterval(this.min, this.max);
        // Apply flat fire
        d.fire += flatFire;
        return d;
    }

    public sum(other: LocalFire): LocalFire {
        return new LocalFire(other.min + this.min, other.max + this.max);
    }

    public clone(): IDamageMod {
        return Object.assign(new LocalFire(0, 0), this);
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
