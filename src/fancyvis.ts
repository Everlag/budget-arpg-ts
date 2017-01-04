import { select, Selection } from 'd3-selection';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';
import { transition } from 'd3-transition';
import { interval } from 'd3-timer';
import { line, curveCardinalClosed } from 'd3-shape';
import { axisBottom } from 'd3-axis';
import { scaleLinear, ScaleLinear } from 'd3-scale';
import { interpolateString } from 'd3-interpolate';

import { intfromInterval } from './random';

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

interface IPoint {
    pos: number;
    id: string;
}

interface IMove {
    duration: number;
    newPos: number;
    id: string;
}

const graphRootID = 'graphRootID';

function graphMargins(width: number, height: number): [number, number] {
    // Handle our margins
    let margin = {
        top: 20, right: 20, bottom: 20, left: 20,
    };

    width = width - (margin.left + margin.right);
    height = height - (margin.top + margin.bottom);
    return [width, height];
}

function prepGraph(root: Selection<any, any, any, any>,
    width: number, height: number): ScaleLinear<number, number> {

    // Consider our margins
    [width, height] = graphMargins(width, height);

    // Create our range and set it's domain
    let xDomain = [-100, 100];
    let xRange = [0, width];
    let x = scaleLinear().range(xRange);
    x.domain(xDomain);

    let axisHeight = 50;

    let group = root.append('g')
        .attr('id', graphRootID)
        .attr('width', width)
        .attr('height', height);

    // Add the axis
    let axis = group.append('g')
        // Ensure its in the middle
        .attr('transform', `translate(0, ${height / 2})`)
        .attr('height', axisHeight)
        // We want only the center marker
        .call(axisBottom(x).ticks(1));

    return x;
}

function graph(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<IPoint>) {

    // Consider our margins
    [width, height] = graphMargins(width, height);

    // Grab the root of our graph
    let markers = select(`#${graphRootID}`).selectAll('circle');

    let inTransition = transition('markersIn').duration(2000);

    // UPDATE
    markers.attr('class', 'update')
        .transition().duration(() => 20);

    // ENTER
    markers.data(points, (p: IPoint) => p.id)
        .enter()
        .append('circle')
        .attr('class', 'enter')
        .attr('r', 10)
        // Convert simulation position to display coord
        .attr('cx', d => xScale(d.pos))
        // Start at +-height and fade in
        .attr('cy', (d, i) => Math.pow(-1, i) * height)
        .style('opacity', 0)
        // Transition the markers into position
        .transition(inTransition)
        .style('opacity', 1)
        .attr('cy', height / 2);

    // EXIT
    markers.exit().remove();

    // let valueLine = line<IPoint>()
    //     .x(d => x(d.pos))
    //     .y(d => 0);
}

function move(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    move: Array<IMove>) {

    // Consider our margins
    [width, height] = graphMargins(width, height);

    // Generate a lookup table of ids that moved
    let movedIDs = new Map<string, boolean>();
    move.forEach(m => movedIDs.set(m.id, true));

    // Grab the markers that moved
    let moved = select(`#${graphRootID}`).selectAll('circle')
        .data(move, (p: IMove) => p.id)
        // Filter only for those that moved
        .filter((d: IMove) => movedIDs.has(d.id));

    moved.transition()
        .duration(d => d.duration)
        .attr('cx', d => xScale(d.newPos))

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

    let xScale = prepGraph(groot, width, height);

    let i = 0;
    let points: Array<IPoint> = [
        {
            id: `${++i}`,
            pos: 0,
        },
        {
            id: `${++i}`,
            pos: 30,
        },
        {
            id: `${++i}`,
            pos: -70,
        },
        {
            id: `${++i}`,
            pos: -20,
        },
        {
            id: `${++i}`,
            pos: 80,
        },
    ]
    graph(groot, width, height, xScale, points);

    let moves: Array<IMove> = points.map(p=> {
        return {
            duration: intfromInterval(1000, 4000),
            newPos: 0,
            id: p.id,
        };
    });

    interval(() => {
        moves.forEach(m=> m.newPos = intfromInterval(-100, 100));
        console.log('moving to', moves[0].newPos);
        move(groot, width, height, xScale, moves);
    }, 2000);
}
