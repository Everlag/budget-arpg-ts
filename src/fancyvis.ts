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
    /** Absolute coefficient of movement */
    coeff: number;
}

interface IDamage {
    /** 
     * id is required to be present
     *
     * So we can remove the IDamage after its
     * presentation is complete
     */
    id: string;
    /** Absolute time this was added */
    when: number;
    /** Amount of damage taken */
    sum: number;
    isCrit: boolean;
}

interface ICharSpec {
    id: string;
    staticPos: IPoint;
    move: IMove | null;
    damages: Array<IDamage>;
}

/** Make a copy of a character spec which can be changed independently */
function copyCharSpec(spec: ICharSpec): ICharSpec {
    // Container
    let fresh = Object.assign({}, spec);

    // Children
    fresh.staticPos = Object.assign({}, fresh.staticPos);
    fresh.move = Object.assign({}, fresh.move);
    fresh.damages = fresh.damages.map(d => Object.assign({}, d));

    return fresh;
}

const graphRootID = 'graphRootID';

// How large our unit circles, sizing of everything
// else is based around this.
const circleRadius = 10;

const circleGroupIDPrefix = 'group';
const circleGroupClass = 'group';

const circleMiscTextClass = 'circleMiscText';
const intentArrowClass = 'intentArrow';
const intentRight = 'intentRight';
const intentLeft = 'intentLeft';

const damageTextClass = 'damageText';

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

const leftArrowPath = 'M15.41 16.09l-4.58-4.59 4.58-4.59L14 5.5l-6 6 6 6z';
const rightArrowPath = 'M8.59 16.34l4.58-4.59-4.58-4.59L10 5.75l6 6-6 6z';
const defaultArrowHeight = 12;

// Given an x position in screen coordinates and height of element,
// return the transform string a group should have
function getGroupTransform(x: number, height: number) {
    return `translate(${x}, ${height / 2})`;
}

/** 
 * Set merged selection of groups to their inactive state
 *
 * This filters for anything not performing another action,
 * ie a move, and sets them to rest.
 */
function inactive(merged: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>) {

    // UPDATE - handle non-moving
    //     stop active transitions
    //     hide intent arrows
    let inactive = merged.filter(d => d.move === null);

    // Use static positions for those null moves
    inactive.attr('transform', d => {
        return getGroupTransform(xScale(d.staticPos.loc), height);
    });

    // Clear out the text value and make it invisible
    inactive.select(`.${circleMiscTextClass}`).text('').attr('opacity', 0);

    // Hide intent arrows
    inactive.selectAll(`.${intentArrowClass}.${intentRight}`)
        .attr('opacity', 0);
    inactive.selectAll(`.${intentArrowClass}.${intentLeft}`)
        .attr('opacity', 0);
    // Stop active transitions
    inactive.transition();
}

/** Handle movement of provided merged selection of groups */
function move(merged: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>) {

    let textTransition = transition('textMoveTransition').ease(easeLinear);
    let circleTransition = transition('circleMoveTransition').ease(easeQuad);

    // UPDATE - start movements
    let doMove = merged.filter(d => d.move != null);

    // Show their text change over time
    doMove.select(`.${circleMiscTextClass}`)
        // Set initial text value
        .text(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        // Ensure its visible
        .attr('opacity', 1)
        // Transition it to zero over time
        .transition(textTransition)
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

    // Show right intent arrow and hide left intent arrow when moving right
    let moveRight = doMove.filter(d => !(!d.move) && d.move.coeff === 1);
    moveRight.selectAll(`.${intentArrowClass}.${intentRight}`)
        .attr('opacity', 1);
    moveRight.selectAll(`.${intentArrowClass}.${intentLeft}`)
        .attr('opacity', 0);

    // Show left intent arrow and hide right intent arrow when moving left
    let moveLeft = doMove.filter(d => !(!d.move) && d.move.coeff === -1);
    moveLeft.selectAll(`.${intentArrowClass}.${intentLeft}`)
        .attr('opacity', 1);
    moveLeft.selectAll(`.${intentArrowClass}.${intentRight}`)
        .attr('opacity', 0);

    // Move the groups
    doMove.transition(circleTransition)
        .duration(d => {
            if (!d.move) throw Error('move required but not present');
            return d.move.duration;
        })
        .attr('transform', d => {
            if (!d.move) throw Error('move required but not present');

            return getGroupTransform(xScale(d.move.newPos), height);
        });
}

function damaged(merged: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>) {

    // UPDATE - display damage done
    let wasDamaged = merged.filter((d: ICharSpec) => d.damages.length > 0);

    let damageDuration = 1000;

    // So, what we're doing here is a nested selection... okay then.
    wasDamaged.selectAll(`.${damageTextClass}`)
        .data((d: ICharSpec) => d.damages)
        .enter()
        // Fill in the text
        .append('text')
        .text(d => d.sum.toFixed(1))
        // Set the class so the selectAll works :|
        .classed(damageTextClass, true)
        // Explicit defaults for relevant attributes
        .attr('x', 0)
        .attr('y', 0)
        .attr('opacity', 1)
        // Start transition
        .transition().duration(damageDuration)
        .attr('y', -height / 4)
        .attr('opacity', 0)
        // Remove the element at the end of the transition
        .remove()
        // Remove the IDamage from the character at the end
        .on('end', d => {
            // Find the spec
            let spec = points.find(other => other.id === d.id);
            if (!spec) throw Error('cannot find parent to remove IDamage from');
            // Remove d
            spec.damages = spec.damages.filter(other => other !== d);
        });

}

function graph(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>) {

    // Consider our margins
    [width, height] = graphMargins(width, height);

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

    // Calculate how much to scale the arrows
    // to match the size of the circle
    let arrowScale = (circleRadius * 2) / defaultArrowHeight;
    let arrowTransform = (isLeft: boolean): string => {
        let translate = `translate(0, -${circleRadius})`;
        if (isLeft) {
            // Yeah, the x translate is a little... shady
            translate = `translate(-${2.3 * circleRadius}, -${circleRadius})`;
        }
        return `scale(${arrowScale})${translate}`;
    };
    // ENTER - Add right-facing intent markers
    newGroups.append('path')
        .classed(intentArrowClass, true)
        .classed(intentRight, true)
        .attr('transform', arrowTransform(false))
        .attr('d', rightArrowPath)
        .attr('opacity', 0);
    // ENTER - Add left-facing intent markers
    newGroups.append('path')
        .classed(intentArrowClass, true)
        .classed(intentLeft, true)
        .attr('transform', arrowTransform(true))
        .attr('d', leftArrowPath)
        .attr('opacity', 0);

    // ENTER - Give the newGroups a place to put extra info
    newGroups.append('text')
        .text('')
        .attr('class', circleMiscTextClass)
        .attr('x', -circleRadius)
        .attr('y', (circleRadius * 3));

    // UPDATE - merge new and old to work on them
    let merged = groups.merge(newGroups);

    // UPDATE - handle various ways data can effect the mergd result
    // 
    // NOTE: a given data point should be represented in only one
    //       of the following functions.
    // 
    //       ie, a move is handled in only move
    //           and filtered out everywhere else.
    inactive(merged, width, height, xScale, points);
    move(merged, width, height, xScale, points);
    damaged(merged, width, height, xScale, points);

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

        .${intentArrowClass} {
            fill: black;
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
            damages: [],
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: 30,
            },
            move: null,
            damages: [],
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: -70,
            },
            move: null,
            damages: [],
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: -20,
            },
            move: null,
            damages: [
                {
                    id: `${i}`,
                    isCrit: false,
                    sum: 20,
                    when: 0,
                },
            ],
        },
        {
            id: `${++i}`,
            staticPos: {
                loc: 80,
            },
            move: {
                newPos: 0,
                coeff: -1,
                duration: 2000,
            },
            damages: [],
        },
    ];
    // Draw initial points
    graph(groot, width, height, xScale, points);

    console.log(points);

    let waiter: Timer;

    // Define update function that runs infinitely
    let update = () => {
        waiter.stop();

        // Mess with the data to move them
        points.forEach(p => {
            // Roll to see if it moves this tick
            let doesMove = intfromInterval(0, 1);

            if (doesMove) {
                let oldPos = p.staticPos.loc;
                let newPos = intfromInterval(-100, 100);
                let deltaPos = newPos - oldPos;
                p.move = {
                    duration: intfromInterval(500, 3000),
                    newPos,
                    coeff: deltaPos / Math.abs(deltaPos),
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

            let isNotDamaged = intfromInterval(0, 5);
            if (!isNotDamaged) {
                p.damages.push({
                    id: p.id,
                    isCrit: false,
                    when: 0,
                    sum: intfromInterval(0, 10),
                });
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
