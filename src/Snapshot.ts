import { Pack } from './Pack';
import { StateSerial } from './Serial';
import { IRecord } from './Records';

/** Convert current state to a packed snapshot */
export function snapshot(when: number,
    events: Array<IRecord>, packs: Array<Pack>): string {

    let serial: StateSerial = {
        when, events,
        packs: packs.map(p => p.toJSON()),
    };

    return JSON.stringify(serial);
}
