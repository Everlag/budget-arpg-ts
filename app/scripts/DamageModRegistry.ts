import {IDamageMod, DamageModOrder} from './DamageMods';
import {Damage, Elements} from './Damage';

/** The application of armor to mitigate physical damage */
export class Armor implements IDamageMod {
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

    public sum(other: Armor): IDamageMod {
        return new Armor(this.armor + other.armor);
    }
}

/** The application of a resistance to mitigate an element's damage */
export class Resistance implements IDamageMod {
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

    public sum(other: Resistance): IDamageMod {
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
}
