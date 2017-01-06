import { select, Selection } from 'd3-selection';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';
import { transition } from 'd3-transition';
import { interval, Timer } from 'd3-timer';
import { axisBottom } from 'd3-axis';
import { scaleLinear, ScaleLinear } from 'd3-scale';
import { easeQuad, easeLinear } from 'd3-ease';

import { intfromInterval } from './random';

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

/** Make a copy of a character spec which can be changed independently */
function copyCharSpec(spec: ICharSpec): ICharSpec {
    // Container
    let fresh = Object.assign({}, spec);

    // Children
    fresh.staticPos = Object.assign({}, fresh.staticPos);
    fresh.move = Object.assign({}, fresh.move);

    return fresh;
}

const graphRootID = 'graphRootID';

const circleGroupIDPrefix = 'group';
const circleGroupClass = 'group';

const circleMiscTextClass = 'circleMiscText';

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
    group.append('g')
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
    return `translate(${x}, ${height / 2})`;
}

function graph(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>) {

    // Consider our margins
    [width, height] = graphMargins(width, height);

    // Setup transitions
    let inDuration = 750;
    const inTransitionName = 'markersIn';
    let inTransition = transition(inTransitionName)
        .duration(inDuration)
        .ease(easeQuad);

    const moveTransitionName = 'movement';
    let moveTransition = transition(moveTransitionName)
        .ease(easeLinear);

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

    // ENTER - Give the newGroups a place to put extra info
    newGroups.append('text')
        .text('')
        .attr('class', circleMiscTextClass)
        .attr('x', -circleRadius)
        .attr('y', (circleRadius * 3));

    // UPDATE - merge new and old to work on them
    let merged = groups.merge(newGroups);

    // UPDATE - use static positions for those null moves
    merged.filter(d => d.move === null)
        .attr('transform', d => {
            return getGroupTransform(xScale(d.staticPos.loc), height);
        });

    // UPDATE - start movements
    let doMove = merged.filter(d => d.move != null);

    doMove.select(`.${circleMiscTextClass}`)
        // Set initial text value
        .text(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        // Transition it to zero over time
        .transition(moveTransition)
        .duration(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        .tween('text', function(d: ICharSpec) {
            // Capture 'this' and make available in closure
            if (this === null) throw Error('null this in text tween');
            let ref = <Element>this;
            // Make a copy of the spec.
            let vendor = copyCharSpec(d);
            return (t) => {
                if (!vendor.move) throw Error('move required but not present');
                // Calculate time remaining on the duration
                // in terms of seconds
                let duration = vendor.move.duration / 1000;
                ref.textContent = (duration - (duration * t)).toFixed(1);
            };
        });

    // Move the groups
    doMove.transition(inTransition)
        .duration(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        .attr('transform', d => {
            if (!d.move) throw Error('move required but not present');

            return getGroupTransform(xScale(d.move.newPos), height);
        });

    // EXIT
    groups.exit().remove();
}

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
    ];
    // Draw initial points
    graph(groot, width, height, xScale, points);

    let waiter: Timer;

    // Define update function that runs infinitely
    let update = () => {
        waiter.stop();

        // Mess with the data to move them
        points.forEach(p => {
            // Roll to see if it moves this tick
            let doesMove = intfromInterval(0, 1);

            if (doesMove) {
                p.move = {
                    duration: intfromInterval(500, 3000),
                    newPos: intfromInterval(-100, 100),
                };
            } else {
                // If we were previously moving, arrive.
                // NOTE: this can cause flickering to the new position
                //       if the movement is interrupted!
                if (p.move) {
                    p.staticPos.loc = p.move.newPos;
                }
                p.move = null;
            }
        });

        // Update display
        graph(groot, width, height, xScale, points);

        // Run this again
        waiter = interval(update, intfromInterval(500, 2000));
    };

    // Start the infinite loop
    waiter = interval(update, 200);

}
