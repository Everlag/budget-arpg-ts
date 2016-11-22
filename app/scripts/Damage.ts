import { CharacterState } from './CharacterState';
import { rollSuccess } from './random';

export const enum Elements {
    Fire = 0,
    Light,
    Cold,
}

/** Get the members of Elements as an array */
export function ElementArray(): Array<Elements> {
    return [Elements.Fire, Elements.Cold, Elements.Light];
}

export const enum DamageTag {
    // Top level tags that must be attached to Damage
    Attack, Spell, DOT,
    Melee, Ranged,
}

export class Damage {
    /** Chance for Damage application to be a critical strike */
    public criticalChance = 0.05;
    /** Multiplier applied to critical strikes */
    public criticalMultiplier = 1.5;

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

    /** 
     * Apply this Damage to a target
     *
     * TODO: handle conditions and such.
     */
    public apply(target: CharacterState) {
        // Calculate sum
        let sum = this.sum();

        // Check if crit and 
        // TODO: set condition chance to 100% for relevant damage types...
        if (rollSuccess(this.criticalChance)) {
            sum *= this.criticalMultiplier;
        }

        // Apply summed damage to health.
        target.context.health -= sum;

        // If the target is dead, leave
        if (target.isDead) return;

        // TODO: handle applying conditions...
    }

    public sum(): number {
        return this.phys + this.fire + this.light + this.cold;
    }
}
