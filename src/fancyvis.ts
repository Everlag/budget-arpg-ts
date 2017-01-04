import { select, Selection } from 'd3-selection';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';
import { line, curveCardinalClosed } from 'd3-shape';
import { interpolateString } from 'd3-interpolate';

interface ILinePoint {
    x: number;
    y: number;
    id: string;
}

type tweenCB = (t: number) => string;

function tweenDash(): tweenCB {
    // Narrow this
    let p: SVGPathElement = this;

    let length = p.getTotalLength();
    let interp = interpolateString(`0,${length}`, `${length}, ${length}`);
    return (t: number) => interp(t);
}

function transitionThis(path: Selection<any, any, any, any>) {
    path.transition().duration(5000)
        .attrTween('stroke-dasharray', tweenDash);
}

function curve(root: Selection<any, any, any, any>,
    dataset: Array<[number, number]>) {

    // Line creation function
    let xLine = line()
        .curve(curveCardinalClosed);

    let renderLine = xLine(dataset);
    if (!renderLine) throw Error('no curve generated');

    root.append('path')
        .style('stroke', '#aaa')
        .style('stroke-dasharray', '4,4')
        // Add the line
        .attr('d', renderLine);

    // Add a path to fill in over the path
    root.append('path')
        .style('stroke', 'black')
        .attr('d', renderLine)
        .call(transitionThis);

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

        path {
            fill: none;
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
    let groot = svgroot.append('g');

    let curveData: Array<[number, number]> = [
        [480, 200],
        [580, 400],
        [680, 100],
        [780, 300],
    ];
    curve(groot, curveData);

}
