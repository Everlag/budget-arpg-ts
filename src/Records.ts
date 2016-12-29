
/** 
 * Types of records we support
 *
 * Prefix E means an explicit event retired on the queue
 * while prefix I is an implicit event as a side effect of the queue
 */
export enum RecordFlavor {
    ESkillUse = 0,
    ESkillPostEffect,
    EMovement,
    EStatusEffect,
    IDamage,
    IMovement,
    IDeath,
}

export interface IRecord {
    /** Tick-time this record was recorded at */
    when: number;
    flavor: RecordFlavor;
}

export interface IDamageRecord extends IRecord {
    target: string;
    source: string;
    /** Actual amount of damage the Target took post-mitigation */
    sum: number;
    isCrit: Boolean;
}

export interface IMovementRecord extends IRecord {
    source: string;
    /** The Character that prompted this movement */
    target: string;
    /** How long the movement takes */
    duration: number;
    /** Coefficient determing absolute movement, in {0, 1} */
    moveCoeff: number;
}

export interface IDeathRecord extends IRecord {
    source: string;
}
