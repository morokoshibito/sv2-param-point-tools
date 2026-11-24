// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
// Minimal mock of the Synthesizer V Studio 2 scripting API, enough to run the
// side panel scripts in Node.js. It models one track whose note groups can be
// added, deleted and opened, piecewise-linear parameter curves, point selection
// and a 4/4 time axis at 120 BPM. Like SV, any access to a deleted note group,
// its reference or its curves throws.
"use strict";
var vm = require("vm");
var fs = require("fs");

var Q = 705600000; // SV.QUARTER (blicks per quarter note)

function widget() {
	var value, cb;
	return {
		setValue: function (v) { value = v; },
		getValue: function () { return value; },
		setEnabled: function () {},
		setValueChangeCallback: function (f) { cb = f; },
		fire: function () { if (cb) { cb(); } }
	};
}

function automation(type) {
	var range = type === "loudness" ? [-48, 12] : [-1, 1];
	return {
		pts: [],
		add: function (b, v) {
			for (var i = 0; i < this.pts.length; i++) { if (this.pts[i][0] === b) { this.pts[i][1] = v; return false; } }
			this.pts.push([b, v]);
			this.pts.sort(function (a, c) { return a[0] - c[0]; });
			return true;
		},
		remove: function (b) { var n = this.pts.length; this.pts = this.pts.filter(function (p) { return p[0] !== b; }); return n !== this.pts.length; },
		get: function (b) {
			var p = this.pts;
			if (!p.length) { return 0; }
			if (b <= p[0][0]) { return p[0][1]; }
			for (var i = 1; i < p.length; i++) {
				if (b <= p[i][0]) { var t = (b - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t; }
			}
			return p[p.length - 1][1];
		},
		getAllPoints: function () { return this.pts.map(function (p) { return p.slice(); }); },
		// drops every second interior point: enough to observe that simplify ran
		simplify: function (b, e) {
			var inner = this.pts.filter(function (p) { return p[0] > b && p[0] < e; });
			this.pts = this.pts.filter(function (p) { return !(p[0] > b && p[0] < e) || inner.indexOf(p) % 2 === 0; });
			return true;
		},
		getDefinition: function () { return { range: range, defaultValue: 0 }; },
		getInterpolationMethod: function () { return "Cosine"; }
	};
}

function deadError(what) {
	return new Error("__invocation_error__: cannot access a deleted '" + what + "' object");
}

// wraps every method so it throws once state.dead is true
function guard(obj, what, state) {
	Object.keys(obj).forEach(function (k) {
		if (typeof obj[k] !== "function") { return; }
		var f = obj[k];
		obj[k] = function () { if (state.dead) { throw deadError(what); } return f.apply(this, arguments); };
	});
	return obj;
}

function group(name) {
	var curves = {}, state = { dead: false };
	var g = guard({
		getName: function () { return name; },
		getParameter: function (t) { return curves[t] || (curves[t] = guard(automation(t), "Automation", state)); }
	}, "NoteGroup", state);
	g._state = state;
	return g;
}

function reference(grp, offsetQn) {
	var state = { dead: false };
	var r = guard({
		getTarget: function () { return grp; },
		getTimeOffset: function () { return offsetQn * Q; }
	}, "NoteGroupReference", state);
	r._state = state;
	return r;
}

// lang: SV interface language code, e.g. "zh-cn", "en-us"
function load(scriptPath, lang) {
	var timers = [];
	var selected = {};
	var dragging = false;
	var translationsReady = false;   // SV reads getTranslations only after the script has loaded
	var titlesAtRefresh = [];
	var trMap = null;
	var ctx;

	var main = group("main");
	var refs = [reference(main, 0)];          // refs[0] is the track's main group
	var current = refs[0];                    // group open in the piano roll
	function addGroup(name, offsetQn) { var r = reference(group(name), offsetQn); refs.push(r); return r; }
	function deleteGroup(r) {
		var i = refs.indexOf(r);
		if (i <= 0) { throw new Error("mock: cannot delete the main group"); }
		refs.splice(i, 1);
		r._state.dead = true;
		if (current === r) { current = refs[0]; }
	}
	var chorusRef = addGroup("chorus", 8);
	var chorus = chorusRef.getTarget();
	var selection = {
		getSelectedPoints: function (t) { return (selected[t] || []).slice(); },
		selectPoints: function (t, a) { selected[t] = (selected[t] || []).concat(a.filter(function (x) { return (selected[t] || []).indexOf(x) < 0; })); },
		unselectPoints: function (t, a) { selected[t] = (selected[t] || []).filter(function (x) { return a.indexOf(x) < 0; }); },
		hasUnfinishedEdits: function () { return dragging; }
	};
	var mark = { position: 0, positionBlick: 0, numerator: 4, denominator: 4 };
	var timeAxis = {
		getMeasureMarkAtBlick: function () { return mark; },
		getAllMeasureMarks: function () { return [mark]; },
		getSecondsFromBlick: function (b) { return b / Q / 2; },
		getBlickFromSeconds: function (s) { return s * 2 * Q; }
	};
	var track = {
		getName: function () { return "Vocal"; },
		getNumGroups: function () { return refs.length; },
		getGroupReference: function (i) { return refs[i]; }
	};

	var SV = {
		QUARTER: Q,
		T: function (s) {
			if (!translationsReady) { return s; }
			if (!trMap) { trMap = {}; ctx.getTranslations(lang).forEach(function (p) { trMap[p[0]] = p[1]; }); }
			return Object.prototype.hasOwnProperty.call(trMap, s) ? trMap[s] : s;
		},
		create: function () { return widget(); },
		setTimeout: function (ms, f) { timers.push(f); },
		refreshSidePanel: function () { titlesAtRefresh.push({ ready: translationsReady, title: ctx.getSidePanelSectionState().title }); },
		getPlayback: function () { return { getPlayhead: function () { return 1.25; } }; },
		getProject: function () { return { getTimeAxis: function () { return timeAxis; }, getNumTracks: function () { return 1; }, getTrack: function () { return track; } }; },
		getMainEditor: function () {
			return {
				getSelection: function () { return selection; },
				getCurrentGroup: function () { return current; },
				getCurrentTrack: function () { return track; }
			};
		}
	};

	ctx = vm.createContext({ SV: SV });
	vm.runInContext(fs.readFileSync(scriptPath, "utf8"), ctx, { filename: scriptPath });
	translationsReady = true;

	return {
		ctx: ctx,
		Q: Q,
		main: main,
		chorus: chorus,
		selected: selected,
		titlesAtRefresh: titlesAtRefresh,
		setDragging: function (d) { dragging = d; },
		tick: function (n) { for (var i = 0; i < (n || 1); i++) { var f = timers.shift(); if (f) { f(); } } },
		curve: function (t) { return current.getTarget().getParameter(t || "loudness"); },
		refs: refs,
		addGroup: addGroup,
		// deleting a group kills its reference, the group and its curves, as in SV
		deleteGroup: function (r) { var g = r.getTarget(); deleteGroup(r); g._state.dead = true; },
		openGroup: function (r) { current = r; Object.keys(selected).forEach(function (k) { selected[k] = []; }); },
		select: function (t, positions) { selected[t] = positions.slice(); },
		status: function () { return ctx.status.getValue(); }
	};
}

module.exports = { load: load, Q: Q };
