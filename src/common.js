// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
// ------------------------------------------------------------------ i18n
// T("text %1 %2", a, b): translate with SV.T, then fill %1, %2 ...
function T(s) {
	var r = SV.T(s);
	for (var i = 1; i < arguments.length; i++) { r = r.split("%" + i).join(String(arguments[i])); }
	return r;
}

// ------------------------------------------------------------------ common
var PARAMS = [
	{ type: "pitchDelta",   name: "Pitch Deviation",  unit: "cents", min: -1200, max: 1200 },
	{ type: "vibratoEnv",   name: "Vibrato Envelope", unit: "x",     min: 0,     max: 2 },
	{ type: "loudness",     name: "Loudness",         unit: "dB",    min: -48,   max: 12 },
	{ type: "tension",      name: "Tension",          unit: "",      min: -1,    max: 1 },
	{ type: "breathiness",  name: "Breathiness",      unit: "",      min: -1,    max: 1 },
	{ type: "voicing",      name: "Voicing",          unit: "",      min: 0,     max: 1 },
	{ type: "gender",       name: "Gender",           unit: "",      min: -1,    max: 1 },
	{ type: "toneShift",    name: "Tone Shift",       unit: "",      min: null,  max: null },
	{ type: "mouthOpening", name: "Mouth Opening",    unit: "",      min: null,  max: null }
];
function pName(i) { return T(PARAMS[i].name); }
function pUnit(i) { return PARAMS[i].unit ? T(PARAMS[i].unit) : ""; }

function W(v) { var w = SV.create("WidgetValue"); w.setValue(v); return w; }
function fx(n, d) { return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
function num(w) { return parseFloat(w.getValue()); }
function selection() { return SV.getMainEditor().getSelection(); }
function groupRef() { return SV.getMainEditor().getCurrentGroup(); }
function offsetOf(ref) { try { return ref.getTimeOffset(); } catch (e) { return 0; } }
function offset() { return offsetOf(groupRef()); }
// Identifies the note group open in the piano roll. Point positions are group-local,
// so a remembered position is only valid while this key stays the same.
function groupKey() {
	try {
		var ed = SV.getMainEditor(), ref = ed.getCurrentGroup();
		return ed.getCurrentTrack().getName() + "/" + ref.getTarget().getName() + "@" + offsetOf(ref);
	} catch (e) { return ""; }
}
function timeAxis() { return SV.getProject().getTimeAxis(); }
function autoOf(ref, pIdx) { return ref.getTarget().getParameter(PARAMS[pIdx].type); }
function automation(pIdx) { return autoOf(groupRef(), pIdx); }

function clampValue(pIdx, v) {
	var p = PARAMS[pIdx];
	if (p.min !== null && v < p.min) { v = p.min; }
	if (p.max !== null && v > p.max) { v = p.max; }
	return v;
}

function sortedPoints(auto) {
	var pts = auto.getAllPoints();
	pts.sort(function (a, b) { return a[0] - b[0]; });
	return pts;
}

function blickToMB(blick) {
	var mm = timeAxis().getMeasureMarkAtBlick(blick);
	var beatLen = 4 / mm.denominator * SV.QUARTER;
	var beats = Math.round((blick - mm.positionBlick) / beatLen * 1e6) / 1e6;
	var mOff = Math.floor(beats / mm.numerator);
	return { measure: mm.position + mOff + 1, beat: beats - mOff * mm.numerator + 1 };
}

function mbText(blick) {
	var mb = blickToMB(blick);
	return T("Bar %1  Beat %2", mb.measure, fx(mb.beat, 3));
}

// first parameter with selected points: {p, pos: sorted group-local positions, others}
function scanSelection() {
	var sel = selection();
	var pick = null, others = 0;
	for (var i = 0; i < PARAMS.length; i++) {
		var arr;
		try { arr = sel.getSelectedPoints(PARAMS[i].type); } catch (e) { continue; }
		if (!arr || !arr.length) { continue; }
		if (pick) { others++; continue; }
		var pos = [];
		for (var j = 0; j < arr.length; j++) { pos.push((arr[j] instanceof Array) ? arr[j][0] : arr[j]); }
		pos.sort(function (a, b) { return a - b; });
		pick = { p: i, pos: pos };
	}
	if (pick) { pick.others = others; }
	return pick;
}

function reselect(pIdx, olds, news) {
	var sel = selection();
	if (olds.length) { sel.unselectPoints(PARAMS[pIdx].type, olds); }
	if (news.length) { sel.selectPoints(PARAMS[pIdx].type, news); }
}

// status messages disappear after 4 s
var message = "", messageTime = 0;
function say(t) { message = t; messageTime = Date.now(); }
function msgLine() { return (message && Date.now() - messageTime < 4000) ? "\n" + message : ""; }

function row(cols) { return { "type": "Container", "columns": cols }; }
function label(t) { return { "type": "Label", "text": t }; }
function box(v, w) { return { "type": "TextBox", "value": v, "width": w }; }
function ro(v, w, h) { return { "type": "TextArea", "value": v, "height": h || 20, "width": w, "readOnly": true }; }
function btn(t, v, w) { return { "type": "Button", "text": t, "value": v, "width": w }; }
function combo(v, choices, w) { return { "type": "ComboBox", "value": v, "choices": choices, "height": 50, "width": w }; }
function check(t, v) { return { "type": "CheckBox", "text": t, "value": v, "width": 1.0 }; }
function wrap(f) { return function () { try { f(); } catch (e) { say(T("Error: %1", e)); } }; }
// The first run is deferred: while the script is still loading, SV has not read
// getTranslations yet, so SV.T returns English. If SV.refreshSidePanel() is called
// at that moment the panel title is cached in English. Never call SV.T or
// SV.refreshSidePanel() at the top level of a script.
var START_DELAY_MS = 300;
function startLoop(ms, f) {
	function loop() {
		try { f(); } catch (e) { say(T("Error: %1", e)); }
		SV.setTimeout(ms, loop);
	}
	SV.setTimeout(START_DELAY_MS, loop);
}
