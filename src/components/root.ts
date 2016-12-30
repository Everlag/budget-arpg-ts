import * as Vue from 'vue';
import Component from 'vue-class-component';

@Component({
    name: 'root',
    props: {
        propMessage: String,
    },
    template: require('raw-loader!./root.html'),
})
export default class Root extends Vue {
    private readonly propMessage: string;

    public mounted() {
        console.log(`holy shit I'm mounted with propMessage=${this.propMessage}!`);
    }
}
