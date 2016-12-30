// import { TicksPerSecond } from './ARPGState';
import {
    //     RecordFlavor,
    IRecord,
    //     IMovementRecord, IDamageRecord, IDeathRecord
} from './Records';
// import * as d3 from 'd3';
import * as Vue from 'vue';

import root from './components/root';

export function renderVue() {
    // mount
    let mount = new Vue({
        el: '#el',
        template: `<root propMessage='apples'></root>`,
        components: {
            root,
        },
    });
    if (!mount) throw Error('vue not mounted');
    console.log(mount);
}

export function visualize(seedState: Object, events: Array<IRecord>) {
    console.log('yeah, about that');
}
