import { Pack } from './Pack';
import { StateSerial } from './Serial';

/** Convert current state to a packed snapshot */
export function snapshot(packs: Array<Pack>): string {
    let serial: StateSerial = {
        packs: packs.map(p => p.toJSON()),
    }

    return JSON.stringify(serial);
}