import {
    IDamageMod, IRangeMod, IDamageModSummable,
    DamageModOrder, DamageModDirection,
} from './DamageMods';
import {
    Damage, DamageTag,
    Elements, ElementArray, ElementToPrettyString,
    getLeechSpecElement, setLeechSpecElement,
} from './Damage';
import { intfromInterval } from './random';
import { CharacterState } from './CharacterState';

/** Binary Range handling, is either within range or not */
export class DiscreteRange implements IRangeMod {
    public name = 'DiscreteRangeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Range;

    constructor(public range: number) { };

    public apply(d: Damage): Damage {

        let { distance } = d;

        // Zero if distance outside range
        if (Math.abs(distance) > this.range) {
            console.log('DiscreteRange calculated, mult = 0!');
            d.phys = 0;
            d.setElement(Elements.Fire, 0);
            d.setElement(Elements.Light, 0);
            d.setElement(Elements.Cold, 0);
        }
        return d;
    }

    public clone(): IRangeMod {
        return Object.assign(new DiscreteRange(0), this);
    }

    public get pretty(): string {
        return `${this.range} discrete range`;
    }
}

/** 
 * Binary Range handling, is either within range or not
 *
 * This takes into account a radius
 */
export class DiscreteRangeRadius implements IRangeMod {
    public name = 'DiscreteRangeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Range;

    constructor(public range: number, public radius: number) { };

    public apply(d: Damage): Damage {

        let { distance, baseTargetDistance } = d;

        // Determine distance between the baseTarget and the actual target 
        let delta = Math.abs(distance - baseTargetDistance);
        // Zero if distance outside range
        if (delta > this.radius) {
            console.log('DiscreteRangeRadius calculated, mult = 0!');
            d.phys = 0;
            d.setElement(Elements.Fire, 0);
            d.setElement(Elements.Light, 0);
            d.setElement(Elements.Cold, 0);
        }
        return d;
    }

    public clone(): IRangeMod {
        return Object.assign(new DiscreteRangeRadius(0, 0), this);
    }

    public get pretty(): string {
        return `${this.range} discrete range`;
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

    public get pretty(): string {
        return `${this.armor} added Armor`;
    }
}

/** 
 * The application of reflexes to increase the distance
 *
 * This increases both the floor and ceiling
 */
export class Reflexes implements IDamageModSummable {
    public name = 'EvasionDamageMod';

    public direction = DamageModDirection.Taking;

    public reqTags = new Set();
    public position = DamageModOrder.Mitigation;

    constructor(public value: number) { }

    public apply(d: Damage): Damage {

        // Short circuit on known useless values
        if (this.value === 0) return d;

        let { distance } = d;
        let maxAdded = distance * 0.75;

        // Reflexes value increases both the minimum and maximum values
        // for the coefficient that can be rolled
        let coeffFloor = Math.log2(this.value);
        let coeffMax = Math.log2(this.value) * 10;
        let coefficient = intfromInterval(coeffFloor, coeffMax) / 100;

        // We have the ceiling of maxAdded to consider
        let added = Math.min(coefficient * distance, maxAdded);

        // Add it on
        d.distance += added;

        return d;
    }

    public sum(other: Reflexes): Reflexes {
        return new Reflexes(this.value + other.value);
    }

    public clone(): IDamageMod {
        return Object.assign(new Reflexes(0), this);
    }

    public get pretty(): string {
        return `${this.value} added Reflexes`;
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

    public get pretty(): string {
        return `${this.resistance * 100}% increased ${ElementToPrettyString(this.element)} resistance`;
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

    public get pretty(): string {
        return `${this.percent * 100} increased Resolve(% damage diverted to mana)`;
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

    public get pretty(): string {
        return `Deal no damage`;
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

    public get pretty(): string {
        return `${this.min}-${this.max} added Physical damage`;
    }
}

/** 
 * Local, flat damage of a specific element
 *
 * NOTE: this does sum
 */
export class LocalElement implements IDamageModSummable {
    public name = 'LocalElementDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.Local;

    constructor(public min: number, public max: number,
        public element: Elements) { }

    public apply(d: Damage): Damage {
        // Roll in range
        let flat = intfromInterval(this.min, this.max);
        let magnitude = d.getElement(this.element);
        // Calculate and set
        let applied = magnitude + flat;
        d.setElement(this.element, applied);
        return d;
    }

    public sum(other: LocalElement): LocalElement {
        if (!this.summable(other)) {
            throw Error('this mod is not summable with other');
        }

        return new LocalElement(this.min + other.min,
            this.max + other.max,
            this.element);
    }

    public summable(other: LocalElement): Boolean {
        return this.element === other.element;
    }

    public clone(): IDamageMod {
        return Object.assign(new LocalElement(0, 0, Elements.Fire), this);
    }

    public get pretty(): string {
        return `${this.min}-${this.max} added ${ElementToPrettyString(this.element)} damage`;
    }
}

export class IncreasedCritChance implements IDamageModSummable {
    public name = 'IncreasedCritChanceDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.GlobalAdd;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        d.increased.criticalChance += this.percent;
        return d;
    }

    public sum(other: IncreasedCritChance): IncreasedCritChance {
        return new IncreasedCritChance(this.percent + other.percent);
    }

    public clone(): IDamageMod {
        return Object.assign(new IncreasedCritChance(0), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% increased critical strike chance`;
    }
}

export class IncreasedMeleePhysical implements IDamageModSummable {
    public name = 'IncreasedMeleePhysicalDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set([DamageTag.Melee]);
    public position = DamageModOrder.GlobalAdd;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        d.increased.phys += this.percent;
        return d;
    }

    public sum(other: IncreasedMeleePhysical): IncreasedMeleePhysical {
        return new IncreasedMeleePhysical(this.percent + other.percent);
    }

    public clone(): IDamageMod {
        return Object.assign(new IncreasedMeleePhysical(0), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% increased melee Physical damage`;
    }
}

export class IncreasedMeleeElement implements IDamageModSummable {
    public name = 'IncreasedMeleeElementDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set([DamageTag.Melee]);
    public position = DamageModOrder.GlobalAdd;

    constructor(public percent: number, public element: Elements) { }

    public apply(d: Damage): Damage {
        d.setIncreasedElement(this.element, this.percent);
        return d;
    }

    public sum(other: IncreasedMeleeElement): IncreasedMeleeElement {
        if (!this.summable(other)) {
            throw Error('this mod is not summable with other');
        }

        return new IncreasedMeleeElement(this.percent + other.percent,
            this.element);
    }

    public summable(other: IncreasedMeleeElement): Boolean {
        return this.element === other.element;
    }

    public clone(): IDamageMod {
        return Object.assign(new IncreasedMeleeElement(0, Elements.Fire), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% increased melee ${ElementToPrettyString(this.element)} damage`;
    }
}

export class AllLeechedAsLife implements IDamageModSummable {
    public name = 'AllLeechedAsLifeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.StatusCalc;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        Object.keys(d.healthLeech)
            .forEach(key => d.healthLeech[key] += this.percent);
        return d;
    }

    public sum(other: AllLeechedAsLife): AllLeechedAsLife {
        return new AllLeechedAsLife(this.percent + other.percent);
    }

    public clone(): IDamageMod {
        return Object.assign(new AllLeechedAsLife(0), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% of all damage leeched as life`;
    }
}

export class PhysLeechedAsLife implements IDamageModSummable {
    public name = 'PhysLeechedAsLifeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.StatusCalc;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        d.healthLeech.phys += this.percent;
        return d;
    }

    public sum(other: PhysLeechedAsLife): PhysLeechedAsLife {
        return new PhysLeechedAsLife(this.percent + other.percent);
    }

    public clone(): IDamageMod {
        return Object.assign(new PhysLeechedAsLife(0), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% of Physical damage leeched as life`;
    }
}

export class ElementLeechedAsLife implements IDamageModSummable {
    public name = 'ElementLeechedAsLifeDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.StatusCalc;

    constructor(public percent: number, public element: Elements) { }

    public apply(d: Damage): Damage {
        let prev = getLeechSpecElement(d.healthLeech, this.element);
        setLeechSpecElement(prev + this.percent, d.healthLeech, this.element);
        return d;
    }

    public sum(other: ElementLeechedAsLife): ElementLeechedAsLife {
        if (!this.summable(other)) {
            throw Error('this mod is not summable with other');
        }

        return new ElementLeechedAsLife(this.percent + other.percent,
            this.element);
    }

    public summable(other: ElementLeechedAsLife): Boolean {
        return this.element === other.element;
    }

    public clone(): IDamageMod {
        return Object.assign(new ElementLeechedAsLife(0, Elements.Fire), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% of ${ElementToPrettyString(this.element)} damage leeched as life`;
    }
}

export class ReducedBurnDuration implements IDamageModSummable {
    public name = 'ReducedBurnDurationDamageMod';

    public direction = DamageModDirection.Dealing;

    public reqTags = new Set();
    public position = DamageModOrder.StatusCalc;

    constructor(public percent: number) { }

    public apply(d: Damage): Damage {
        d.statusEffects.burnDuration *= (1 - this.percent);

        return d;
    }

    public sum(other: ReducedBurnDuration): ReducedBurnDuration {
        // Enforce a cap that burn duration reduction can be at most 80%
        // of the default duration. 
        let capped = Math.min(this.percent + other.percent, 0.8);
        return new ReducedBurnDuration(capped);
    }

    public clone(): IDamageMod {
        return Object.assign(new ReducedBurnDuration(0), this);
    }

    public get pretty(): string {
        return `${this.percent * 100}% reduced Burn duration`;
    }
}
