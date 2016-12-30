// import { TicksPerSecond } from './ARPGState';
import {
    //     RecordFlavor,
    IRecord,
    //     IMovementRecord, IDamageRecord, IDeathRecord
} from './Records';
import { StateSerial, PackSerial } from './Serial';
// import * as d3 from 'd3';
import * as Vue from 'vue';
import Component from 'vue-class-component';

import root from './components/root';

@Component({
    props: {
        pack: Object,
    },
    template: `<div>okay, so we're here! {{pack.isDead}}</div>`,
})
class Pack extends Vue {
    private readonly pack: PackSerial;

    public mounted() {
        if (!this.pack) return;
        console.log(`holy shit I'm mounted with isDead=${this.pack.isDead}!`);
    }
}

export function renderVue() {
    // mount
    let mount = new Vue({
        el: '#el',
        template: `
            <div>
                <div>apples</div>
                <pack :pack='pack'></pack>
                <root propMessage='apples'></root>
            </div>
        `,
        components: {
            root, Pack,
        },
        data: () => {
            return {
                pack: {
                    isDead: false,
                },
                propMessage: 'holy shit!',
            };
        },
    });
    if (!mount) throw Error('vue not mounted');
    console.log(mount);

    let snapshots: Array<string> = (<any>window).snapshots;
    let renderState: StateSerial = JSON.parse(snapshots[0]);

    (<any>mount.$data).pack = renderState.packs[0];
}

export function visualize(seedState: Object, events: Array<IRecord>) {
    console.log('yeah, about that');
}
