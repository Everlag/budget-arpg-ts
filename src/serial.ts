import { Pack } from './Pack';

/** Losssy serialization of current combat state */
export interface StateSerial {
    packs: Array<PackSerial>;
}

/** Convert current state to a packed snapshot */
export function snapshot(packs: Array<Pack>): string {
    let serial: StateSerial = {
        packs: packs.map(p => p.toJSON()),
    }

    return JSON.stringify(serial);
}

/** Revive a packed state snapshot taken with snapshot */
export function revive(packed: string): StateSerial {
    return JSON.parse(packed);
}

/** Pack lossily serialized */
export interface PackSerial {
    states: Array<CharacterStateSerial>;
    Living: Array<CharacterStateSerial>;
    isDead: boolean;
}

/** CharacterState lossily serialized */
export interface CharacterStateSerial {
    /** Unique identifier */
    EntityCode: string;
    /** Absolute location */
    Position: number;
    /** Current values of health and mana */
    health: number;
    mana: number;
    /** Maximum values for health and mana */
    maxHealth: number;
    maxMana: number;
    /** State */
    isDead: boolean;
}
