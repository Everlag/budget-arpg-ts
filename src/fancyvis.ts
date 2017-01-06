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
import { easeQuad } from 'd3-ease';

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
    loc: number;
}

interface IMove {
    duration: number;
    newPos: number;
}

interface ICharSpec {
    id: string;
    staticPos: IPoint;
    move: IMove | null;
}

const graphRootID = 'graphRootID';

const circleGroupIDPrefix = 'group';
const circleGroupClass = 'group';

const circleIDTextClass = 'circleIDText';

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

// Given an x position in screen coordinates and height of element,
// return the transform string a group should have
function getGroupTransform(x: number, height: number) {
    return `translate(${x}, ${height / 2})`
}

// Returns duration to wait for graph to be prepared
function graph(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>): number {

    // Consider our margins
    [width, height] = graphMargins(width, height);

    console.log('graph called!')

    // Setup transitions
    let inDuration = 750;
    const inTransitionName = 'markersIn';
    let inTransition = transition(inTransitionName)
        .duration(inDuration)
        .ease(easeQuad);

    // Uh...
    let circleRadius = 10;

    // JOIN
    let groups = root.selectAll(`g.${circleGroupClass}`)
        .data(points, (p: ICharSpec) => p.id);

    // ENTER - setup groups
    let entered = groups.enter();

    // ENTER - Add a group per-data
    let newGroups = entered.append('g')
        // Set class so the selectAll can actually find this...
        .attr('class', circleGroupClass)
        // Set id per-group
        .attr('id', d => `${circleGroupIDPrefix}${d.id}`)
        // Set them to start at their static position
        .attr('transform', d => {
            return getGroupTransform(xScale(d.staticPos.loc), height);
        });

    // ENTER - Add circles to newGroups
    newGroups.append('circle')
        .attr('r', circleRadius);

    // ENTER - Add identifiers to newGroups
    newGroups.append('text')
        .text(d => d.id)
        .attr('x', -circleRadius)
        .attr('y', -(circleRadius * 1.5));

    // UPDATE - merge new and old to work on them
    let merged = groups.merge(newGroups);

    // UPDATE - use static positions for those null moves
    merged.filter(d => d.move === null)
        .attr('transform', d => {
            return getGroupTransform(xScale(d.staticPos.loc), height);
        });

    // UPDATE - start movements
    merged.filter(d => d.move != null)
        .transition(inTransition)
        .duration(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        .attr('transform', d => {
            if (!d.move) throw Error('move required but not present');

            return getGroupTransform(xScale(d.move.newPos), height);
        })
    // TODO: we'll filter for non-null .moves

    // EXIT
    groups.exit().remove();

    // // Grab the root of our graph
    // let markers = select(`#${graphRootID}`).selectAll(`.${circleGroupClass}`);
    // // UPDATE
    // // NOTHING

    // // ENTER
    // let markerGroups = markers.data(points, (p: IPoint) => p.id)
    //     .enter()
    //     // Add a group for the circle and associated elements
    //     .append('g')
    //     .attr('id', d=> `${circleGroupIDPrefix}${d.id}`)
    //     // Convert simulation position to display coord
    //     .attr('transform', d=> `translate(${xScale(d.pos)}, 0)`)

    // // Start groups at +-height and fade in
    // markerGroups
    //     .attr('transform', (d, i)=> {
    //         return `translate(${xScale(d.pos)}, ${Math.pow(-1, i) * height})`
    //     })
    //     // .attr('cy', (d, i) => Math.pow(-1, i) * height)
    //     .style('opacity', 0)
    //     // Transition the markers into position
    //     .transition(inTransition)
    //     .style('opacity', 1)
    //     .attr('transform', (d, i)=> {
    //         return `translate(${xScale(d.pos)}, ${height / 2})`
    //     })

    // let circleRadius = 10;

    // // Add a circle to each group
    // let circles = markerGroups.append('circle')
    //     .attr('r', circleRadius);

    // // Add some text to show identities
    // let texts = markerGroups.selectAll('text').append('text')
    //     .text(d=> d.id)
    //     .attr('class', circleIDTextClass)
    //     .attr('x', -circleRadius)
    //     .attr('y', -(circleRadius * 1.5));

    // // EXIT
    // markers.exit().remove();

    // console.log('setup markers', markers, 'group is', markerGroups);

    return inDuration;

    // let valueLine = line<IPoint>()
    //     .x(d => x(d.pos))
    //     .y(d => 0);
}

const moveIntentClass = 'moveIntent';

// function move(root: Selection<any, any, any, any>,
//     width: number, height: number,
//     xScale: ScaleLinear<number, number>,
//     move: Array<IMove>) {

//     // Consider our margins
//     [width, height] = graphMargins(width, height);

//     // // Grab the markers that moved
//     let moved = select(`#${graphRootID}`).selectAll(`.${circleGroupClass}`)
//         .data(move, (p: IMove) => p.id);

//     console.log(moved);

//     // let intentText = moved.enter()
//     //     .append('text')
//     //     .text(d=> {
//     //         console.log('I am evaulted!');
//     //         return d.id;
//     //     })
//     //     .attr('x', -30)
//     //     .attr('y', 50);
//    // console.log(moved, intentText);

//    //  // Move the group's position
//    //  moved.transition()
//    //      .duration(d => d.duration)
//         // .attr('transform', d=> `translate(${xScale(d.newPos)}, ${height / 2})`)

//     // Cleanup
//     // info.exit().remove();
// }

export function visualize() {

    (<any>window).select = select;

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
    let points: Array<ICharSpec> = [
        {
            id: `${++i}`,
            staticPos: {
                loc: 0,
            },
            move: null,
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: 30,
            },
            move: null,
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: -70,
            },
            move: null,
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: -20,
            },
            move: null,
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: 80,
            },
            move: {
                newPos: 0,
                duration: 2000,
            },
        },
    ]
    let waitTime = graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);
    graph(groot, width, height, xScale, points);


    let waitTimer = interval(() => {
        // Prevent this from firing again
        waitTimer.stop();

        let moves: Array<IMove> = points.map(p => {
            return {
                duration: intfromInterval(1000, 4000),
                newPos: 0,
                id: p.id,
            };
        });

        console.log('calling move');
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // move(groot, width, height, xScale, moves);
        // interval(() => {
        //     moves.forEach(m=> m.newPos = intfromInterval(-100, 100));
        //     console.log('moving to', moves[0].newPos);
        //     move(groot, width, height, xScale, moves);
        // }, 500);

    }, waitTime)

}
