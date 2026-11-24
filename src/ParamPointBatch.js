// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
/*
 * [SV2] Param Point Batch (2/3)
 * Batch edits on the selected points of one parameter curve:
 * set one value, transition, scale, quantize, space evenly.
 * Requires Synthesizer V Studio 2 Pro 2.1.2+. UI follows the SV language (English / Simplified Chinese).
 * Note: a SidePanelSection script's "name" must be ASCII, so it is not translated.
 */

function getClientInfo() {
	return {
		"name": "Param Point Batch",
		"category": "Utilities",
		"author": "morokoshibito",
		"versionNumber": 4,
		"minEditorVersion": 131330,
		"type": "SidePanelSection"
	};
}

//@@COMMON@@

var GRIDS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 6, 1 / 8, 1 / 16, 1 / 32];

var status = W("");
var setVal = W("0"), bSet = W(0);
var shape = W(0), density = W("8"), bRecalc = W(0), bGenerate = W(0);
var factor = W("1.5"), center = W(""), bScale = W(0);
var grid = W(3), bQuant = W(0), bSpace = W(0);

var st = { param: -1, pos: [] };

function refresh() {
	var pick = scanSelection();
	if (!pick) {
		st.param = -1; st.pos = [];
		status.setValue(T("Select several points on one parameter curve.") + msgLine());
		return;
	}
	st.param = pick.p; st.pos = pick.pos;
	var auto = automation(st.param), mn = Infinity, mx = -Infinity, sum = 0;
	for (var i = 0; i < st.pos.length; i++) {
		var v = auto.get(st.pos[i]);
		if (v < mn) { mn = v; } if (v > mx) { mx = v; } sum += v;
	}
	var span = (st.pos[st.pos.length - 1] - st.pos[0]) / SV.QUARTER;
	status.setValue(T("%1 · %2 point(s) selected · span %3 quarter notes", pName(st.param), st.pos.length, fx(span, 3)) + "\n" +
		T("Min %1 · Max %2 · Avg %3", fx(mn, 3), fx(mx, 3), fx(sum / st.pos.length, 3)) + msgLine());
}

function need(n) {
	if (st.param < 0 || st.pos.length < n) { say(T("Select at least %1 point(s).", n)); return false; }
	return true;
}

function pairs() {
	var auto = automation(st.param), out = [];
	for (var i = 0; i < st.pos.length; i++) { out.push([st.pos[i], auto.get(st.pos[i])]); }
	return out;
}

// remove all first, then write, so moved points do not overwrite each other
function rewrite(olds, news) {
	var auto = automation(st.param), kept = [];
	for (var i = 0; i < olds.length; i++) { auto.remove(olds[i][0]); }
	for (var j = 0; j < news.length; j++) {
		auto.add(news[j][0], news[j][1]);
		if (kept.indexOf(news[j][0]) < 0) { kept.push(news[j][0]); }
	}
	var oldPos = [];
	for (var k = 0; k < olds.length; k++) { oldPos.push(olds[k][0]); }
	reselect(st.param, oldPos, kept);
	return kept.length;
}

function setAll() {
	if (!need(1)) { return; }
	var v = num(setVal);
	if (isNaN(v)) { say(T("Invalid value.")); return; }
	v = clampValue(st.param, v);
	var auto = automation(st.param);
	for (var i = 0; i < st.pos.length; i++) { auto.add(st.pos[i], v); }
	say(T("Set %1 point(s) to %2.", st.pos.length, fx(v, 4)));
}

function shapeAt(t) {
	var k = Number(shape.getValue());
	if (k == 1) { return (1 - Math.cos(Math.PI * t)) / 2; }
	if (k == 2) { return t * t; }
	if (k == 3) { return 1 - (1 - t) * (1 - t); }
	return t;
}

// ends fixed; recalculate the values of the selected middle points
function recalc() {
	if (!need(3)) { return; }
	var auto = automation(st.param), p = st.pos, p0 = p[0], p1 = p[p.length - 1];
	var v0 = auto.get(p0), v1 = auto.get(p1);
	for (var i = 1; i < p.length - 1; i++) {
		auto.add(p[i], clampValue(st.param, v0 + (v1 - v0) * shapeAt((p[i] - p0) / (p1 - p0))));
	}
	say(T("Recalculated %1 middle point(s).", p.length - 2));
}

// delete every point between the ends and generate new ones by density
function generate() {
	if (!need(2)) { return; }
	var d = num(density);
	if (isNaN(d) || d <= 0) { say(T("Invalid density.")); return; }
	var auto = automation(st.param), p0 = st.pos[0], p1 = st.pos[st.pos.length - 1];
	if (p1 <= p0) { say(T("The first and last points are at the same position.")); return; }
	var v0 = auto.get(p0), v1 = auto.get(p1);
	var n = Math.max(1, Math.round((p1 - p0) / SV.QUARTER * d));
	var all = sortedPoints(auto), removed = 0;
	for (var j = 0; j < all.length; j++) { if (all[j][0] > p0 && all[j][0] < p1) { auto.remove(all[j][0]); removed++; } }
	var news = [p0];
	for (var m = 1; m < n; m++) {
		var np = Math.round(p0 + (p1 - p0) * m / n);
		auto.add(np, clampValue(st.param, v0 + (v1 - v0) * shapeAt(m / n)));
		news.push(np);
	}
	news.push(p1);
	reselect(st.param, st.pos.slice(0), news);
	say(T("Removed %1 point(s), generated %2 middle point(s).", removed, n - 1));
}

function scale() {
	if (!need(1)) { return; }
	var k = num(factor);
	if (isNaN(k)) { say(T("Invalid factor.")); return; }
	var ps = pairs(), c;
	if (String(center.getValue()).replace(/\s/g, "") === "") {
		c = 0;
		for (var i = 0; i < ps.length; i++) { c += ps[i][1]; }
		c /= ps.length;
	} else {
		c = num(center);
		if (isNaN(c)) { say(T("Invalid center value.")); return; }
	}
	var auto = automation(st.param), clipped = 0;
	for (var j = 0; j < ps.length; j++) {
		var raw = c + (ps[j][1] - c) * k, v = clampValue(st.param, raw);
		if (v !== raw) { clipped++; }
		auto.add(ps[j][0], v);
	}
	say(clipped ? T("Scaled by %1 around %2; %3 point(s) were clipped to the range.", k, fx(c, 3), clipped)
		: T("Scaled by %1 around %2.", k, fx(c, 3)));
}

function quantize() {
	if (!need(1)) { return; }
	var unit = GRIDS[Number(grid.getValue())] * SV.QUARTER, off = offset(), ps = pairs(), out = [];
	for (var i = 0; i < ps.length; i++) {
		out.push([Math.max(0, Math.round(Math.round((ps[i][0] + off) / unit) * unit - off)), ps[i][1]]);
	}
	var kept = rewrite(ps, out);
	say(kept < ps.length ? T("Quantized %1 point(s); %2 fell on the same grid line and were merged.", ps.length, ps.length - kept)
		: T("Quantized %1 point(s).", ps.length));
}

function space() {
	if (!need(3)) { return; }
	var ps = pairs(), n = ps.length, p0 = ps[0][0], p1 = ps[n - 1][0], out = [];
	for (var i = 0; i < n; i++) { out.push([Math.round(p0 + (p1 - p0) * i / (n - 1)), ps[i][1]]); }
	rewrite(ps, out);
	say(T("Spaced %1 point(s) evenly.", n));
}

bSet.setValueChangeCallback(wrap(setAll));
bRecalc.setValueChangeCallback(wrap(recalc));
bGenerate.setValueChangeCallback(wrap(generate));
bScale.setValueChangeCallback(wrap(scale));
bQuant.setValueChangeCallback(wrap(quantize));
bSpace.setValueChangeCallback(wrap(space));

startLoop(100, refresh);

function getSidePanelSectionState() {
	var shapes = [T("Linear"), T("Cosine (S-curve)"), T("Ease in"), T("Ease out")];
	var grids = ["1/4", "1/8", T("1/8 triplet"), "1/16", T("1/16 triplet"), "1/32", "1/64", "1/128"];
	return {
		"title": T("Param Point Batch"),
		"rows": [
			row([ro(status, 1.0, 55)]),

			label(T("Set one value")),
			row([box(setVal, 0.5), btn(T("Set all to this value"), bSet, 0.5)]),

			label(T("Transition (ends fixed): shape  |  density (points per quarter note)")),
			row([combo(shape, shapes, 0.5), box(density, 0.5)]),
			row([btn(T("Recalculate middle points"), bRecalc, 0.5), btn(T("Generate by density"), bGenerate, 0.5)]),

			label(T("Scale: factor  |  center (empty = average)")),
			row([box(factor, 0.35), box(center, 0.35), btn(T("Scale"), bScale, 0.3)]),

			label(T("Time: quantize grid")),
			row([combo(grid, grids, 0.5), btn(T("Quantize"), bQuant, 0.5)]),
			row([btn(T("Space evenly between ends"), bSpace, 1.0)])
		]
	};
}
