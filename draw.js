(function(){
// TODO: consider moving this into a separate .css file.
var styles = `
draw-box {
    display: block;
    position: relative;
}

.draw-box-no-select {
    -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
       -khtml-user-select: none; /* Konqueror HTML */
         -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Chrome & Opera */
}

.draw-box-selection {
    position: absolute;
    border: 1px solid silver;
}

.draw-box-selected {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #3498db;
    pointer-events: none;
}

.draw-box-dragger {
    position: absolute;
    display: none;
    width: 10px;
    height: 10px;
    top: -5px;
    left: -5px;
    cursor: pointer;
    background: #3498db;
    pointer-events: auto;
}

.draw-box-resizer {
    position: absolute;
    display: none;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    bottom: -3px;
    right: -3px;
    border: 4px solid #3498db;
    border-top: none;
    border-left: none;
    cursor: nwse-resize;
    pointer-events: auto;
}

.draw-box-hover .draw-box-dragger,
.draw-box-hover .draw-box-resizer {
    display: block
}
`

class DrawBox extends HTMLElement {
    attachedCallback() { // compatibility with custom-elements v0
        this.connectedCallback()
    }

    connectedCallback() {
        // we use inject the style element adjcent to the <draw-box> instead of
        // on the <head> element because the <draw-box> element might be used
        // within a shadow-dom of another component, so we'd like to have the
        // style contained within the same scope. It would've been easier with a
        // Shadow-DOM stylesheet, but we don't want to require the shadow-dom
        // pollyfill especially for cases where users opt to use the
        // `DrawBox.init(el)` work-around when they don't want any custom
        // element
        // TODO: reconsider when shadow-dom is has better vendor support.
        var s = `<style id='draw-box-styles'>` + DrawBox.styles + `</style>`
        this.parentNode.insertBefore($create(s), this)

        var selectBox = $create(`<div class='draw-box-selection'></div>`)

        DrawBox.initTrackEvents(this)
        this.addEventListener('track', this.onTrack.bind(this, 'draw', selectBox))
        this.addEventListener('click', this.onClick)
        this.addEventListener('mousemove', this.onMouseMove)
    }

    onMouseMove(ev) {
        var { x, y } = ev
        var pos = { left: x, top: y, width: 1, height: 1 }

        var selected = []
        for (var i = 0; i < this.children.length ; i += 1) {
            var child = this.children[i]
            if (!child._drawbox) {
                continue
            }

            child.classList.toggle('draw-box-hover', intersect(pos, child))
        }
    }

    onClick(ev) {
        if (ev.target === this) {
            // de-select all on background click.
            Array.prototype.forEach.call(this.children, function (child) {
                this.deselect(child)
            }, this)
        } else {
            // find the selected element by walking up the ancestors tree until
            // we find the immediate child of this draw-box to select.
            var target = ev.target
            while (target.parentNode !== this) {
                target = target.parentNode
            }
            this.select(target)
        }
    }

    onTrack(type, el, ev) {
        if (ev.detail.state === 'start') {
            this.removeEventListener('mousemove', this.onMouseMove)
            this.classList.add('draw-box-no-select')
        }

        this['on' + type[0].toUpperCase() + type.slice(1)].call(this, el, ev)

        if (ev.detail.state === 'end') {
            this.classList.remove('draw-box-no-select')
            this.addEventListener('mousemove', this.onMouseMove)
        }
    }

    onDraw(el, ev) {
        var { x, y, dx, dy, state } = ev.detail
        var drawEl = this.getAttribute('draw')
        if (state === 'start') {
            var rect = this.getBoundingClientRect()
            if (drawEl !== null) {
                drawEl = document.createElement(drawEl || 'div')
                drawEl.style.position = 'absolute'
                this.appendChild(drawEl)
            }

            $bind(el, drawEl)
            el._startTop = y - rect.top
            el._startLeft = x - rect.left
            el.style.top = el._startTop + 'px'
            el.style.left = el._startLeft + 'px'
            this.appendChild(el)
        }

        // on negative deltas - the user drags from bottom-right to top-left.
        // reverse the logic such that it drags the start-position instead of
        // the end-positing.
        if (dx < 0) {
            el.style.left = el._startLeft + dx + 'px'
            dx *= -1
        }

        if (dy < 0) {
            el.style.top = el._startTop + dy + 'px'
            dy *= -1
        }

        // adjust the width and height
        el.style.width = dx + 'px'
        el.style.height = dy + 'px'
        el.update()

        // find intersections and select/deselect elements
        // TODO if it gets slow, we can consider a quadtree implementation.
        var children = drawEl ? [] : this.children
        for (var i = 0; i < children.length; i += 1) {
            var child = children[i]
            if (child._drawbox) {
                continue
            } else if (intersect(el, child)) {
                this.select(child)
            } else {
                this.deselect(child)
            }
        }

        if (state === 'end') {
            this.removeChild(el)
            this.removeAttribute('draw') // auto-disable draw.
        }
    }

    onDrag(el, ev) {
        var { dx, dy, state } = ev.detail
        if (state === 'start') {
            el._startTop = parseFloat(el.style.top)
            el._startLeft = parseFloat(el.style.left)
        }

        el.style.top = el._startTop + dy + 'px'
        el.style.left = el._startLeft + dx + 'px'
        el.update()
    }

    onResize(el, ev) {
        var { dx, dy, state } = ev.detail
        if (state === 'start') {
            el._startWidth = parseFloat(el.style.width)
            el._startHeight = parseFloat(el.style.height)
        }

        el.style.width = el._startWidth + dx + 'px'
        el.style.height = el._startHeight + dy + 'px'
        el.update()
    }

    select(child) {
        if (child._drawboxSelected) {
            return // already selected
        }

        var selectBox = $create(`
            <div class='draw-box-selected'>
                <div class='draw-box-dragger'></div>
                <div class='draw-box-resizer'></div>
            </div>
        `)

        $bind(selectBox, child)
        selectBox.style.top = child.offsetTop + 'px'
        selectBox.style.left = child.offsetLeft + 'px'
        selectBox.style.width = child.offsetWidth + 'px'
        selectBox.style.height = child.offsetHeight + 'px'

        child._drawboxSelected = selectBox.update()
        this.appendChild(selectBox)

        // onDrag
        var dragger = selectBox.querySelector('.draw-box-dragger')
        DrawBox.initTrackEvents(dragger)
            .addEventListener('track', this.onTrack.bind(this, 'drag', selectBox))

        // onResize
        var resizer = selectBox.querySelector('.draw-box-resizer')
        DrawBox.initTrackEvents(resizer)
            .addEventListener('track', this.onTrack.bind(this, 'resize', selectBox))
    }

    deselect(child) {
        if (child._drawboxSelected) {
            this.removeChild(child._drawboxSelected)
            child._drawboxSelected = null
        }
    }

    static get styles() {
        return styles
    }

    // manually upgrade an element to be a DrawBox in cases where there's no
    // support for custom-elements. Otherwise, just create a <draw-box>.
    static init(el) {
        if (el instanceof DrawBox) {
            return // idempotent
        }

        Object.setPrototypeOf(el, DrawBox.prototype)
        el.connectedCallback() // harmless even when not connected.
    }
}

// check if two elements are intersected
function intersect(el1, el2) {
    var r1 = el1 instanceof HTMLElement ? el1.getBoundingClientRect() : el1
    var r2 = el2 instanceof HTMLElement ? el2.getBoundingClientRect() : el2
    return (
        r1.top <= r2.top + r2.height && // r1 starts before r2 ends
        r1.top + r1.height >= r2.top && // r1 ends after r2 starts
        r1.left <= r2.left + r2.width && // r1 starts before r2 ends
        r1.left + r1.width >= r2.left // r1 ends after r2 starts
    )
}

// helper function for creating an element out of arbitrary HTML strings
function $create(innerHTML) {
    var container = document.createElement('div')
    container.innerHTML = innerHTML
    return Object.assign(container.children[0], { _drawbox: true })
}

function $bind(el, target) {
    el.update = function () {
        if (!target) {
            return this
        }

        target.style.top = this.style.top
        target.style.left = this.style.left
        target.style.width = this.style.width
        target.style.height = this.style.height
        return this
    }

    return el
}

// generic - can be moved to its own library, or replaced with Hammer.js Pan.
DrawBox.initTrackEvents = function(el, options) {
    var threshold = (options || {}).threshold || 0

    if (el._drawboxBound) { // idempotent function
        el.removeEventListener('mousedown', el._drawboxBound)
    }

    el.addEventListener('mousedown', mouseDown)
    el._drawboxBound = mouseDown

    var start, inThreshold;
    function mouseDown(ev) {
        if (ev.target !== el) {
            return // disable track event on sub-elements
        }

        start = ev

        window.addEventListener('mousemove', mouseMove)
        window.addEventListener('mouseup', mouseUp)
    }

    function mouseMove(ev) {
        if (!inThreshold) {
            var dx = Math.abs(ev.x - start.x)
            var dy = Math.abs(ev.y - start.y)
            if (dx >= threshold || dy >= threshold) {
                inThreshold = true
                fire('start', start)
            } else {
                return // threshold didn't break yet.
            }
        }

        fire('move', ev)
    }

    function mouseUp(ev) {
        window.removeEventListener('mousemove', mouseMove)
        window.removeEventListener('mouseup', mouseUp)

        if (inThreshold) {
            fire('end', ev)
        }

        start = inThreshold = null
    }

    function fire(state, ev) {
        var detail = {
            state: state,
            x: ev.x,
            y: ev.y,
            dx: ev.x - start.x,
            dy: ev.y - start.y,
        }

        ev = new Event('track')
        ev.detail = detail
        el.dispatchEvent(ev)
    }

    return el
}

// register the element
document.addEventListener('DOMContentLoaded', function () {
    if ('customElements' in window) {
        window.customElements.define('draw-box', DrawBox)
    } else if ('registerElement' in document) {
        window.DrawBox = document.registerElement('draw-box', DrawBox)
    } else {
        console.warn('<draw-box>: custom elements aren\'t supported')
        console.warn('<draw-box>: Initialize <draw-box> with DrawBox.init(el)')
    }
})

window.DrawBox = DrawBox
})()
