import { select, Selection } from 'd3-selection';
// Needed as a side efect to inject transition
// into the selection api.
import 'd3-transition';
import { transition } from 'd3-transition';
import { axisBottom } from 'd3-axis';
import { line, curveCatmullRom } from 'd3-shape';
import { scaleLinear, ScaleLinear } from 'd3-scale';
import { easeQuad, easeLinear } from 'd3-ease';

import { TicksPerSecond } from './Globals';
import {
    ImplictRecordToString,
    RecordFlavor,
    IMoveStartRecord, IMoveEndRecord, IDamageRecord, IDeathRecord,
} from './Records';
import { StateSerial, CharacterStateSerial } from './Serial';

/** Convert a given number of simulation ticks to realtime milliseconds */
function ticksToMillis(ticks: number): number {
    return (ticks / TicksPerSecond) * 1000;
}

interface IGraphConf {
    base: Selection<any, any, any, any>;
    xScale: ScaleLinear<number, number>;
    width: number;
    height: number;
}

/** Make a copy of a character spec which can be changed independently */
function copyCharSpec(spec: ICharSpec): ICharSpec {
    // Container
    let fresh = Object.assign({}, spec);

    // Children
    fresh.move = Object.assign({}, fresh.move);
    fresh.damages = fresh.damages.map(d => Object.assign({}, d));

    return fresh;
}

/** ID for the base element of the graph */
const graphID = 'graph';
/** ID for the prepGraph root */
const graphRootID = 'graphRootID';

// How large our unit circles, sizing of everything
// else is based around this.
const circleRadius = 10;

const circleGroupIDPrefix = 'group';
const circleGroupClass = 'group';

const circleMiscTextClass = 'circleMiscText';
const circleIDTextClass = 'circleIdText';
const intentArrowClass = 'intentArrow';
const intentRight = 'intentRight';
const intentLeft = 'intentLeft';

const damageTextClass = 'damageText';

const skillLineClass = 'skillLine';

/** Given the simulation identifier for a group, determine it's DOM id */
function circleGroupDomID(id: string) {
    return `${circleGroupIDPrefix}${id}`;
}

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
    points: Array<ICharSpec>, pointLookup: Map<string, ICharSpec>) {

    // UPDATE - handle non-moving
    //     stop active transitions
    //     hide intent arrows
    let inactive = merged.filter(d => d.move === null);

    // Use static positions for those null moves
    inactive.attr('transform', d => {
        return getGroupTransform(xScale(d.staticLoc), height);
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
    points: Array<ICharSpec>, pointLookup: Map<string, ICharSpec>) {

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
            return d.move.duration.toFixed(1);
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
    points: Array<ICharSpec>, pointLookup: Map<string, ICharSpec>) {

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
            let spec = pointLookup.get(d.id);
            if (!spec) throw Error('cannot find parent to remove IDamage from');
            // Remove d
            spec.damages = spec.damages.filter(other => other !== d);
        });

}

interface ISkillLinePoint {
    x: number;
    y: number;
    charRef: ICharSpec;
}

function skillUse(merged: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>, pointLookup: Map<string, ICharSpec>) {

    // UPDATE - show skill relation
    let skillUsed = merged.filter((d: ICharSpec) => d.skill !== null);

    // Be explicit about our path creation
    let pathLine = line<ISkillLinePoint>()
        .x(d => d.x)
        .y(d => d.y)
        .curve(curveCatmullRom);

    // Now we draw a curved line ending in an arrow
    // to the target from the source.
    // NOTE: we do not need a sub-select as there can only
    //       be one active skill used at a time
    skillUsed.select(`.${skillLineClass}`)
        // Compute three necessary points for a fancy curved line
        .datum((d: ICharSpec) => {
            if (d.skill === null) throw Error('null skill in skillUse datum');

            // Lookup the target
            let target = pointLookup.get(d.skill.target);
            if (!target) throw Error('target not found in pointLookup for skillUse');

            // Find our position and set our path in terms
            // of its origin being located relative to this group;
            let thisPos = xScale(d.staticLoc);
            let targetPos = xScale(target.staticLoc);
            let deltaPos = targetPos - thisPos;

            // Construct our line
            let start = {
                x: 0,
                y: 0,
                charRef: d,
            };
            let mid = {
                x: deltaPos / 2,
                y: 40,
                charRef: d,
            };
            let end = {
                x: deltaPos,
                y: 0,
                charRef: d,
            };

            return [start, mid, end];
        })
        .attr('d', pathLine)
        .attr('opacity', 1)
        .transition().duration((d: Array<ISkillLinePoint>) => {
            let start = d[0];
            let skill = start.charRef.skill;
            if (skill === null) throw Error('null skill in skillUse transition duration');
            return skill.duration;
        })
        .attr('opacity', 0);

}

function graph(root: Selection<any, any, any, any>,
    width: number, height: number,
    xScale: ScaleLinear<number, number>,
    points: Array<ICharSpec>, pointLookup: Map<string, ICharSpec>) {

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
        .attr('id', d => circleGroupDomID(d.id))
        // Set them to start at their static position
        .attr('transform', d => {
            return getGroupTransform(xScale(d.staticLoc), height);
        });

    // ENTER - Add circles to newGroups
    newGroups.append('circle')
        .attr('r', circleRadius);

    // ENTER - Add identifiers to newGroups
    newGroups.append('text')
        .text(d => d.id)
        .classed(circleIDTextClass, true)
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

    // ENTER - add empty skill path
    newGroups.append('path')
        .classed(skillLineClass, true);

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
    inactive(merged, width, height, xScale, points, pointLookup);
    move(merged, width, height, xScale, points, pointLookup);
    damaged(merged, width, height, xScale, points, pointLookup);
    skillUse(merged, width, height, xScale, points, pointLookup);

    // EXIT
    groups.exit().remove();
}

/** 
 * Prepare to render the graph and return the configuration
 */
export function prep(): IGraphConf {
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

        .${skillLineClass} {
            stroke: orange;
            stroke-width: 3px;
        }

        .${circleIDTextClass} {
            font: bold 2em monospace;
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
    let groot = svgroot.append('g').attr('id', graphID);

    let xScale = prepGraph(groot, width, height);

    return {
        base: groot,
        height, width,
        xScale,
    }
}

let globalSpec: IStateSpec = {
    chars: new Map(),
};

/**
 * Bootstraps the initial state configuration for a graph
 */
export function bootstrapState(config: IGraphConf, state: StateSerial) {
    // Grab all characters from all packs
    let characters = state.packs
        .reduce((prev: Array<CharacterStateSerial>, current) => {
            return prev.concat(current.states);
        }, []);
    // Convert those characters into specs
    let specs = characters.map((c): ICharSpec => {
        return {
            id: c.EntityCode,
            staticLoc: c.Position,
            damages: [],
            move: null,
            skill: null,
        };
    });

    // Set state
    specs.forEach(s => globalSpec.chars.set(s.id, s));
}

let updates = 0;

/** Update the state of graph represented by the provided config */
export function update(config: IGraphConf, state: StateSerial) {

    // Though:
    //     okay, so we need to merge the events from StateSerial
    //     into a series of ICharSpec. Hmmmm.

    // Check if there are new characters we need to process
    let ids = state.packs
        .reduce((prev: Array<string>, current) => {
            let codes = current.states.map(s => s.EntityCode);
            return prev.concat(codes);
        }, []);
    if (!ids.every(id => globalSpec.chars.has(id))) {
        // TODO: actually handle this...
        throw Error('adding new Characters after bootstrapState unimplemented!');
    }

    // Early exit if no events to process.
    if (state.events.length === 0) return;

    state.events.forEach(e => {

        // Narrow type as far as we can and extract
        // as much as we can before the switch.
        let eRef = <
            IDamageRecord | IMoveStartRecord | IMoveEndRecord | IDeathRecord
            >e;
        let source = globalSpec.chars.get(eRef.source);
        if (!source) throw Error('source ICharSpec not found for event');

        switch (e.flavor) {
            case RecordFlavor.IMoveStart:
                // Narrow type
                let moveStart = <IMoveStartRecord>e;
                // Set the move for that Character.
                source.move = {
                    coeff: moveStart.moveCoeff,
                    duration: ticksToMillis(moveStart.duration),
                    newPos: moveStart.endPos,
                };
                break;

            case RecordFlavor.IMoveEnd:
                // Narrow type
                let moveEnd = <IMoveEndRecord>e;
                source.move = null;
                source.staticLoc = moveEnd.endPos;
                break;

            default:
                // For anything we can't visualize, just print it
                console.log('d3vis unknown event:',
                    ImplictRecordToString(e));
                break;
        }
    });

    let { base: groot, width, height, xScale } = config;
    let { chars: pointLookup } = globalSpec;
    let points = Array.from(pointLookup.values());

    updates++;
    (<any>window).updates = updates;
    graph(groot, width, height, xScale, points, pointLookup);

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

interface ISkill {
    /** The id of the primary target of this skill */
    target: string;
    /** How long the skill usage takes */
    duration: number;
}

interface ICharSpec {
    id: string;
    staticLoc: number;
    move: IMove | null;
    skill: ISkill | null;
    damages: Array<IDamage>;
}

interface IStateSpec {
    // All characters are addressable by their id
    chars: Map<string, ICharSpec>;
}
