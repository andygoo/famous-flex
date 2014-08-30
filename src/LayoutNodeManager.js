/**
 * This Source Code is licensed under the MIT license. If a copy of the
 * MIT-license was not distributed with this file, You can obtain one at:
 * http://opensource.org/licenses/mit-license.html.
 *
 * @author: Hein Rutjes (IjzerenHein)
 * @license MIT
 * @copyright Gloey Apps, 2014
 */

/*global define*/

/**
 * LayoutNodesContext is the interface for a layout-function to access
 * renderables in the data-source and set their size, position, tranformation, etc...
 * The renderables are not accessed directly but through opaque layout-nodes.
 *
 * @module
 */
define(function(require, exports, module) {

    // import dependencies
    var LayoutNode = require('./LayoutNode');
    var LayoutContext = require('./LayoutContext');

    /**
     * @class
     * @alias module:LayoutNodeManager
     */
    function LayoutNodeManager(createLayoutNodeFunction) {
        this._createLayoutNodeFunction = createLayoutNodeFunction;
        this._context = new LayoutContext({
            next: _contextNextNode.bind(this),
            byId: _contextNodeById.bind(this),
            byArrayElement: _contextNodeByArrayElement.bind(this),
            set: _contextSetNode.bind(this)
        });
        //this._first = undefined;
        //this._currentSequence = undefined;
        //this._nodesById = undefined;
    }

    /**
     * Prepares the manager for a new layout iteration, after which it returns the 
     * context which can be used by the layout-function.
     */
    LayoutNodeManager.prototype.prepareForLayout = function(viewSequence, nodesById) {

        // Reset all nodes
        var node = this._first;
        while (node) {
            node.reset();
            node = node._next;
        }

        // Prepare data
        this._currentSequence = viewSequence;
        this._nodesById = nodesById;
        this._prev = undefined;
        this._current = this._first;
        return this._context;
    };

    /**
     * When the layout-function no longer lays-out the node, then it is not longer
     * being invalidated. In this case the destination is set to the removeSpec
     * after which the node is animated towards the remove-spec.
     */
    LayoutNodeManager.prototype.removeNonInvalidatedNodes = function(removeSpec) {
        var node = this._first;
        while (node) {
            if (!node._invalidated && !node._removing) {
                node.remove(removeSpec);
            }
            node = node._next;
        }
    };

    /**
     * Builds the render-spec and destroy any layout-nodes that no longer
     * return a render-spec.
     */
    LayoutNodeManager.prototype.buildSpecAndDestroyUnrenderedNodes = function() {
        var result = [];
        var node = this._first;
        var prevNode;
        while (node) {
            var spec = node.getSpec();
            if (!spec) {
                var destroyNode = node;
                node = node._next;
                if (prevNode) {
                    prevNode._next = node;
                }
                else {
                    this._first = node;
                }
                destroyNode.destroy();
            }
            else {
                result.push(spec);
                prevNode = node;
                node = node._next;
            }
        }
        return result;
    }

    /**
     * Get the layout-node by its renderable.
     *
     * @param {Object} renderable renderable
     * @return {FlowLayoutNode} layout-node or undefined
     */
    LayoutNodeManager.prototype.getNodeByRenderNode = function(renderable) {
        var node = this._first;
        while (node) {
            if (node._spec.renderNode === renderable) {
                return node;
            }
            node = node._next;
        }
        return undefined;
    }

    /**
     * Get the layout-node by its renderable.
     *
     * @param {Object} renderable renderable
     * @return {FlowLayoutNode} layout-node or undefined
     */
    LayoutNodeManager.prototype.insertNode = function(node) {
        node._next = this._first;
        this._first = node;
    }

    /**
     * Get the layout-node for a given render-node. When no layout-node exists
     * a new one is created. This function is optimized to return almost
     * immediately when the layout-function requests the layout-nodes in the
     * same order. When the layout-nodes are requested in a new/difference
     * order, then the layout-nodes are re-arragned in that new order so that
     * they can be accessed efficiently the next time the layout is reflowed.
     *
     * @param {Object} renderNode render-node for which to lookup the layout-node
     * @return {FlowLayoutNode} layout-node
     */
    function _contextGetCreateAndOrderNodes(renderNode) {

        // Optimized path. If the next current layout-node matches the renderNode
        // return that immediately.
        if (this._current && (this._current._spec.renderNode === renderNode)) {
            this._prev = this._current;
            this._current = this._current._next;
            return this._prev;
        }

        // Look for a layout-node with this render-node
        var node = this._current;
        var prev = this._prev;
        while (node) {
            if (node._spec.renderNode === renderNode) {

                // Remove from old position in linked-list
                if (prev) {
                    prev._next = node._next;
                }

                // Insert before current
                node._next = this._current;
                if (this._prev) {
                    this._prev._next = node;
                }
                else {
                    this._first = node;
                }
                this._prev = node;
                return node;
            }
            prev = node;
            node = node._next;
        }

        // No layout-node found, create new one
        node = this._createLayoutNodeFunction(renderNode);
        node._next = this._current;
        if (this._prev) {
            this._prev._next = node;
        }
        else {
            this._first = node;
        }
        this._prev = node;
        return node;
    }

    /**
     * Get the next layout-node
     */
    function _contextNextNode(renderNode) {

        // Get the next node from the sequence
        if (!this._currentSequence) {
            return undefined;
        }
        var renderNode = this._currentSequence.get();
        if (!renderNode) {
            return undefined;
        }
        this._currentSequence = this._currentSequence.getNext();

        // Get the layout-node by its render-node
        return _contextGetCreateAndOrderNodes.call(this, renderNode);
    }

    /**
     * Get the layout-node by id.
     */
     function _contextNodeById(nodeId) {

        // This function is only possible when the nodes were provided based on id
        if (!this._nodesById) {
            return undefined;
        }
        var renderNode = this._nodesById[nodeId];
        if (!renderNode) {
            return undefined;
        }

        // If the result was an array, return that instead
        if (renderNode instanceof Array) {
            return renderNode;
        }

        // Get the layout-node by its render-node
        return _contextGetCreateAndOrderNodes.call(this, renderNode);
    }

    /**
     * Get the layout-node by array element.
     */
    function _contextNodeByArrayElement(arrayElement) {
        return _contextGetCreateAndOrderNodes.call(this, arrayElement);
    }

    /**
     * Get the layout-node by array element.
     */
    function _contextSetNode(node, set) {
        if (!node) {
            return this;
        }
        if (!(node instanceof LayoutNode) && ((node instanceof String) || (typeof node === 'string'))) {
            node = _contextNodeById.call(this, node);
            if (!node) {
                return this;
            }
        }
        return node.set(set);
    }

    module.exports = LayoutNodeManager;
});
