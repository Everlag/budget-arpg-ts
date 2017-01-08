
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
    IMoveStart,
    IMoveEnd,
    ISkillApply,
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

/** The start of a movement */
export interface IMoveStartRecord extends IRecord {
    source: string;
    /** The Character that prompted this movement */
    target: string;
    /** How long the movement takes */
    duration: number;
    /** Coefficient determing absolute movement, in {0, 1} */
    moveCoeff: number;
    /** Where the move will place the Character */
    endPos: number;
}

/** The end of a movement */
export interface IMoveEndRecord extends IRecord {
    source: string;
    /** Where the move places the Character */
    endPos: number;
}

export interface ISkillApply extends IRecord {
    source: string;
    target: string;
    /** Specific name the skill ahs */
    skillName: string;
}

export interface IDeathRecord extends IRecord {
    source: string;
}

/** Convert an implicit record to a short, human readable string */
export function ImplictRecordToString(record: IRecord) {
    switch (record.flavor) {
        case RecordFlavor.IDamage:
            let damage = <IDamageRecord>record;
            return `${damage.source} damages ${damage.target} for ${Math.floor(damage.sum)}`;
        case RecordFlavor.IMoveStart:
            let moveStart = <IMoveStartRecord>record;
            return `${moveStart.source} moves ${moveStart.moveCoeff} for ${Math.floor(moveStart.duration)}`;
        case RecordFlavor.IMoveEnd:
            let moveEnd = <IMoveEndRecord>record;
            return `${moveEnd.source} moed to ${moveEnd.endPos}`;
        case RecordFlavor.ISkillApply:
            let apply = <ISkillApply>record;
            return `${apply.source} uses ${apply.skillName} on ${apply.target}`;
        case RecordFlavor.IDeath:
            let death = <IDeathRecord>record;
            return `${death.source} dies`;
        default:
            throw Error('fell through record flavor switch');
    }
}
