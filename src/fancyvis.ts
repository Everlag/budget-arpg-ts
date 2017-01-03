import { select, Selection } from 'd3-selection';
import { interval } from 'd3-timer';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';
import { easeBounce } from 'd3-ease';
import { transition } from 'd3-transition';

function circles(root: Selection<any, any, any, any>,
    dataset: Array<ICircleSpec>) {

    let t = transition('circleTransition')
        .ease(easeBounce)
        .duration(100);

    // JOIN
    let dots = root.selectAll('circle')
        .data(dataset, (d: ICircleSpec) => d.id);

    // UPDATE existing
    dots.attr('class', 'update')
        .transition(t)
        .attr('r', d => d.radius / 2)
        .attr('cx', (d, i) => (i) * (40 + (d.radius / 2) * 1.1) % 500);

    // ENTER
    dots.enter()
        .append('circle')
        .attr('cx', (d, i) => (i) * (40 + d.radius * 1.1) % 500)
        .attr('cy', (d) => d.radius + 200 * Math.sin(Math.random() * 2 * Math.PI))
        .attr('r', d => d.radius)
        .attr('class', 'enter');

    // EXIT
    dots.exit().remove();
}

interface ICircleSpec {
    radius: number;
    id: string;
}

export function visualize() {

    let style = document.createElement('style');
    style.type = 'text/css';
    let styleContent = document.createTextNode(`
        text {
            font: bold 38px monospace;
        }

        .enter {
            fill: green;
        }

        .update {
            fill: black;
        }

        .exit {
            fill: orange;
        }
    `);
    style.appendChild(styleContent);
    document.body.appendChild(style);

    let root = document.querySelector('#d3root');
    if (!root) throw Error('d3 root element not present');

    let [width, height] = [960, 500];

    let svgroot = select(root).append('svg')
        .attr('width', width)
        .attr('height', height);

    // Create a group for our content
    let groot = svgroot.append('g')
        .attr('transform', `translate(32, ${height / 2})`);

    let data: Array<ICircleSpec> = [];
    circles(groot, data);

    let i = 0;
    interval(() => {
        data.push({
            radius: i * 20 % 70,
            id: `${i}a`,
        });
        data.push({
            radius: i * 21 % 49,
            id: `${i}b`,
        });
        i++;
        circles(groot, data);
    }, 200);

}
