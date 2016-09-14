import {IDamageMod, DamageModOrder, DamageModDirection} from './DamageMods';
import {Damage, Elements} from './Damage';
import {intfromInterval} from './Random';

/** The application of armor to mitigate physical damage */
export class Armor implements IDamageMod {
    public name = 'ArmorDamageMod';
    public canSum = true;

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
        return Object.assign({}, this);
    }
}

/** The application of a resistance to mitigate an element's damage */
export class Resistance implements IDamageMod {
    public name = 'ResistsDamageMod';
    public canSum = true;

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
        return Object.assign({}, this);
    }
}

/** Zero the Damage to nothing */
export class Zero implements IDamageMod {
    public name = 'ZeroDamageMod';
    public canSum = false;

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
        return Object.assign({}, this);
    }
}

/** Local, flat physical damage  */
export class LocalPhysical implements IDamageMod {
    public name = 'LocalPhysicalDamageMod';
    public canSum = true;

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Local;

    constructor(public min: number, public max: number) { }

    public apply(d: Damage): Damage {
        // Roll in range
        let flatPhys = intfromInterval(this.min, this.max);
        d.phys += flatPhys;
        return d;
    }

    public sum(other: LocalPhysical): LocalPhysical {
        return new LocalPhysical(this.min + other.min, this.max + other.max);
    }

    public clone(): IDamageMod {
        return Object.assign({}, this);
    }
}
