var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.18.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function CustomToolPanel() {}

    CustomToolPanel.prototype.init = function(params) {
      this.eGui = document.createElement("div");
      this.eGui.style.textAlign = "center";
      this.eGui.innerHTML = this.getTemplate();
    };

    CustomToolPanel.prototype.getGui = function() {
      return this.eGui;
    };

    CustomToolPanel.prototype.getTemplate = function() {
      return `
      <div>
        <h3>Quick Filter</h3>
        <label>
            <input type="text" id="quick-filter" oninput="onQuickFilterChanged(event)" />
        </label>
        <h3>External Filter</h3>
        <label>
            <input type="radio" name="filter" value="everyone" checked onchange="externalFilterChanged('everyone')"/> Everyone
        </label>
        <label>
            <input type="radio" name="filter" value="below30" onchange="externalFilterChanged('below30')"/> Below 30
        </label>
        <label>
            <input type="radio" name="filter" value="between30and50" onchange="externalFilterChanged('between30and50')"/> Between 30 and 50
        </label>
        <label>
            <input type="radio" name="filter" value="above50" onchange="externalFilterChanged('above50')"/> Above 50
        </label>
        <label>
            <input type="radio" name="filter" value="dateAfter2008" onchange="externalFilterChanged('dateAfter2008')"/> After 01/01/2008
        </label>
      </div>`;
    };

    /* Button.svelte generated by Svelte v3.18.2 */
    const file = "Button.svelte";

    function create_fragment(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			attr_dev(div, "id", "myGrid");
    			attr_dev(div, "class", "ag-theme-balham");
    			set_style(div, "height", "100%");
    			set_style(div, "width", "100%");
    			set_style(div, "margin-top", "40px");
    			add_location(div, file, 148, 0, 3610);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function asDate(dateAsString) {
    	var splitFields = dateAsString.split("/");
    	return new Date(splitFields[2], splitFields[1], splitFields[0]);
    }

    function instance($$self) {
    	console.log(CustomToolPanel);

    	var columnDefs = [
    		{
    			headerName: "Athlete",
    			field: "athlete",
    			width: 150
    		},
    		{
    			headerName: "Age",
    			field: "age",
    			width: 90,
    			filter: "agNumberColumnFilter"
    		},
    		{
    			headerName: "Country",
    			field: "country",
    			width: 120
    		},
    		{
    			headerName: "Year",
    			field: "year",
    			width: 90
    		},
    		{
    			headerName: "Date",
    			field: "date",
    			width: 110,
    			filter: "agDateColumnFilter",
    			filterParams: {
    				comparator(filterLocalDateAtMidnight, cellValue) {
    					var dateAsString = cellValue;
    					var dateParts = dateAsString.split("/");
    					var cellDate = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]));

    					if (filterLocalDateAtMidnight.getTime() == cellDate.getTime()) {
    						return 0;
    					}

    					if (cellDate < filterLocalDateAtMidnight) {
    						return -1;
    					}

    					if (cellDate > filterLocalDateAtMidnight) {
    						return 1;
    					}
    				}
    			}
    		},
    		{
    			headerName: "Sport",
    			field: "sport",
    			width: 110
    		},
    		{
    			headerName: "Gold",
    			field: "gold",
    			width: 100,
    			filter: "agNumberColumnFilter"
    		},
    		{
    			headerName: "Silver",
    			field: "silver",
    			width: 100,
    			filter: "agNumberColumnFilter"
    		},
    		{
    			headerName: "Bronze",
    			field: "bronze",
    			width: 100,
    			filter: "agNumberColumnFilter"
    		},
    		{
    			headerName: "Total",
    			field: "total",
    			width: 100,
    			filter: "agNumberColumnFilter"
    		}
    	];

    	var gridOptions = {
    		defaultColDef: { filter: true },
    		columnDefs,
    		rowData: null,
    		animateRows: true,
    		isExternalFilterPresent,
    		doesExternalFilterPass,
    		sideBar: {
    			toolPanels: [
    				{
    					id: "columns",
    					labelDefault: "Columns",
    					labelKey: "columns",
    					iconKey: "columns",
    					toolPanel: "agColumnsToolPanel"
    				},
    				{
    					id: "customTP",
    					labelDefault: "Custom",
    					labelKey: "customTP",
    					iconKey: "custom-tp",
    					toolPanel: CustomToolPanel
    				}
    			],
    			defaultToolPanel: "customTP"
    		}
    	};

    	var ageType = "everyone";

    	function isExternalFilterPresent() {
    		// if ageType is not everyone, then we are filtering
    		return ageType != "everyone";
    	}

    	function doesExternalFilterPass(node) {
    		switch (ageType) {
    			case "below30":
    				return node.data.age < 30;
    			case "between30and50":
    				return node.data.age >= 30 && node.data.age <= 50;
    			case "above50":
    				return node.data.age > 50;
    			case "dateAfter2008":
    				return asDate(node.data.date) > new Date(2008, 1, 1);
    			default:
    				return true;
    		}
    	}

    	// setup the grid after the page has finished loading
    	document.addEventListener("DOMContentLoaded", function () {
    		var gridDiv = document.querySelector("#myGrid");
    		new agGrid.Grid(gridDiv, gridOptions);
    		gridOptions.api.setRowData([]);
    	});

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("columnDefs" in $$props) columnDefs = $$props.columnDefs;
    		if ("gridOptions" in $$props) gridOptions = $$props.gridOptions;
    		if ("ageType" in $$props) ageType = $$props.ageType;
    	};

    	return [];
    }

    class Button extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Button",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    /* App.svelte generated by Svelte v3.18.2 */
    const file$1 = "App.svelte";

    function create_fragment$1(ctx) {
    	let main;
    	let t;
    	let current;

    	const button = new Button({
    			props: { style: "height: 100%;width: 100%;" },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			main = element("main");
    			t = text("Table\n\t");
    			create_component(button.$$.fragment);
    			set_style(main, "height", "100%");
    			set_style(main, "width", "100%");
    			attr_dev(main, "class", "svelte-18sli8n");
    			add_location(main, file$1, 13, 0, 153);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, t);
    			mount_component(button, main, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(button.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(button.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(button);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
