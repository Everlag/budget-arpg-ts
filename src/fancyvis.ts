import { select, Selection } from 'd3-selection'
import { interval } from 'd3-timer';
import { shuffle } from 'd3-array';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';

function update(root: Selection<any, any, any, any>,
    dataset: Array<string>) {

    let duration = 750;

    // JOIN
    let text = root.selectAll('text')
        .data(dataset, (d: string) => d)

    // EXIT
    // Discard unused elements
    text.exit()
        .attr('class', 'exit')
        // Everything after the duration
        // call is transitioned out
        .transition().duration(duration)
        .attr('y', 60)
        .style('fill-opacity', 1e-6)
        .remove();

    // UPDATE
    // 
    // Change old elements as required
    text.attr('class', 'update')
        .attr('y', 0)
        .style('fill-opacity', 1)
        .transition().duration(duration)
        .attr('x', (d, i) => i * 32);

    // ENTER
    // create new elements
    text.enter().append('text')
        .attr('class', 'enter')
        .attr('dy', '0.35em')
        .attr('y', -60)
        .attr('x', (d, i) => i * 32)
        .style('fill-opacity', 1e-6)
        .text(d => d)
        // Add the old elements and set positions for all elements
        .transition().duration(duration)
        .attr('y', 0)
        .style('fill-opacity', 1);

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

    let alphabet = 'abcdefghijklmnopqrstuvwxyz';

    update(groot, alphabet.split(''));

    interval(() => {
        let newData = shuffle(alphabet.split(''))
            .slice(0, Math.random() * 26);
        update(groot, newData);
    }, 1000);

}
