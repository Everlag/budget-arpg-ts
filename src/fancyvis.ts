import { select, Selection } from 'd3-selection'
import { interval } from 'd3-timer';

function update(root: Selection<any, any, any, any>,
    dataset: Array<string>) {

    // JOIN
    let text = root.selectAll('text')
        .data(dataset);

    // UPDATE
    // 
    // Change old elements as required
    text.attr('class', 'update');

    // ENTER
    // create new elements
    text.enter().append('text')
        .attr('class', 'enter')
        .attr('x', (d, i) => i * 32)
        .attr('dy', '0.35em')
        // Add the old elements and set their content
        .merge(text)
        .text(d=> d);

    // EXIT
    // Discard unused elements
    text.exit().remove();

}

export function visualize() {

    let style = document.createElement('style');
    style.type = 'text/css';
    let styleContent = document.createTextNode(`
        text {
            font: bold 24px monospace;
        }

        .enter {
            fill: green;
        }

        .update {
            fill: black;
        }
    `);
    style.appendChild(styleContent);
    document.body.appendChild(style);

    let root = document.querySelector('#d3root');
    if (!root) throw Error('d3 root element not present');

    let [width, height] = [500, 500];

    let svgroot = select(root).append('svg')
        .attr('width', width)
        .attr('height', height);

    // Create a group for our content
    let groot = svgroot.append('g')
        .attr('transform', `translate(32, ${height / 2})`);

    let alphabet = 'abcdefghijklmnopqrstuvwxyz';

    update(groot, alphabet.split(''));

    interval(()=> {
        let newData = alphabet
            .split('')
            .slice(0, Math.random() * 26);
        update(groot, newData);
    }, 1000);

}
