// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
/*
 * [SV2] Param Point Editor (1/3, most used)
 * Select one point on a parameter curve to read and set its exact value and position.
 * Requires Synthesizer V Studio 2 Pro 2.1.2+. UI follows the SV language (English / Simplified Chinese).
 * Note: a SidePanelSection script's "name" must be ASCII, so it is not translated.
 */

function getClientInfo() {
	return {
		"name": "Param Point Editor",
		"category": "Utilities",
		"author": "morokoshibito",
		"versionNumber": 7,
		"minEditorVersion": 131330,
		"type": "SidePanelSection"
	};
}

//@@COMMON@@

var status = W("");
var fValue = W(""), fMeasure = W(""), fBeat = W(""), fQn = W(""), fSec = W("");
var bApply = W(0), bRevert = W(0), bPrev = W(0), bNext = W(0);
var FIELDS = { value: fValue, measure: fMeasure, beat: fBeat, qn: fQn, sec: fSec };

var st = { param: -1, pos: null };
var written = {}, lastKey = "", forceWrite = false, pendingPos = null, panelParam = -2;

function setText(k, t) { written[k] = t; FIELDS[k].setValue(t); }
function dirty(k) { return String(FIELDS[k].getValue()) !== written[k]; }
function anyDirty() { for (var k in FIELDS) { if (dirty(k)) { return true; } } return false; }

function writeFields(abs, value) {
	var mb = blickToMB(abs);
	setText("value", fx(value, 4));
	setText("measure", String(mb.measure));
	setText("beat", fx(mb.beat, 4));
	setText("qn", fx(abs / SV.QUARTER, 6));
	setText("sec", fx(timeAxis().getSecondsFromBlick(abs), 6));
}

function clearFields() { for (var k in FIELDS) { setText(k, ""); } }

// target position (project blicks) from whichever box the user edited
function targetPosition(currentAbs) {
	var n;
	if (dirty("measure") || dirty("beat")) {
		var m = Math.round(num(fMeasure)), b = num(fBeat);
		if (isNaN(m) || isNaN(b)) { return NaN; }
		var idx = m - 1, marks = timeAxis().getAllMeasureMarks(), mm = marks[0];
		for (var i = 0; i < marks.length; i++) { if (marks[i].position <= idx) { mm = marks[i]; } }
		var beatLen = 4 / mm.denominator * SV.QUARTER;
		return mm.positionBlick + (idx - mm.position) * mm.numerator * beatLen + (b - 1) * beatLen;
	}
	if (dirty("qn")) { n = num(fQn); return isNaN(n) ? NaN : n * SV.QUARTER; }
	if (dirty("sec")) { n = num(fSec); return isNaN(n) ? NaN : timeAxis().getBlickFromSeconds(n); }
	return currentAbs;
}

function refresh() {
	var dragging = false;
	try { dragging = selection().hasUnfinishedEdits(); } catch (e) {}
	var pick = scanSelection();

	if (!pick) {
		if (dragging && st.param >= 0) {
			status.setValue(T("%1 · dragging", pName(st.param)) + "\n" + T("Release the mouse to see the new value."));
			return;
		}
		if (st.param !== -1) { clearFields(); }
		st.param = -1;
		st.pos = null;
		lastKey = "";
		status.setValue(T("Click a point on a parameter curve.") + msgLine());
		rebuildIfNeeded();
		return;
	}

	st.param = pick.p;
	st.pos = pick.pos[0];
	if (pendingPos !== null) {
		for (var i = 0; i < pick.pos.length; i++) { if (Math.abs(pick.pos[i] - pendingPos) < 1) { st.pos = pick.pos[i]; } }
		pendingPos = null;
	}
	var auto = automation(st.param);
	var value = auto.get(st.pos);
	var pts = sortedPoints(auto), ci = -1;
	for (var j = 0; j < pts.length; j++) { if (Math.abs(pts[j][0] - st.pos) < 1) { ci = j; } }

	var info = T("%1 · curve point %2/%3", pName(st.param), ci + 1, pts.length);
	if (pick.pos.length > 1) { info += "\n" + T("%1 point(s) selected, showing the leftmost.", pick.pos.length); }
	else if (pick.others) { info += "\n" + T("Other parameter curves also have selected points."); }
	status.setValue(info + msgLine());

	// refresh the boxes only when it will not overwrite typing
	var key = st.param + "@" + st.pos;
	if (forceWrite || key !== lastKey || !anyDirty()) {
		writeFields(st.pos + offset(), value);
		forceWrite = false;
	}
	lastKey = key;
	rebuildIfNeeded();
}

function rebuildIfNeeded() {
	if (st.param !== panelParam) {
		panelParam = st.param;
		try { SV.refreshSidePanel(); } catch (e) {}
	}
}

function apply() {
	if (st.param < 0) { return; }
	var off = offset();
	var abs = targetPosition(st.pos + off);
	var v = num(fValue);
	if (isNaN(abs) || isNaN(v)) { say(T("Invalid number.")); return; }
	v = clampValue(st.param, v);
	var newPos = Math.max(0, Math.round(abs - off));
	var auto = automation(st.param);
	if (newPos !== st.pos) { auto.remove(st.pos); }
	auto.add(newPos, v);
	reselect(st.param, [st.pos], [newPos]);
	pendingPos = newPos;
	forceWrite = true;
	say(T("Applied."));
}

function step(dir) {
	if (st.param < 0) { return; }
	var pts = sortedPoints(automation(st.param)), ci = -1;
	for (var i = 0; i < pts.length; i++) { if (Math.abs(pts[i][0] - st.pos) < 1) { ci = i; } }
	var ni = ci + dir;
	if (ci < 0 || ni < 0 || ni >= pts.length) { say(dir < 0 ? T("Already the first point.") : T("Already the last point.")); return; }
	var all = scanSelection();
	reselect(st.param, all ? all.pos : [], [pts[ni][0]]);
	pendingPos = pts[ni][0];
	forceWrite = true;
}

bApply.setValueChangeCallback(wrap(apply));
bRevert.setValueChangeCallback(wrap(function () { forceWrite = true; }));
bPrev.setValueChangeCallback(wrap(function () { step(-1); }));
bNext.setValueChangeCallback(wrap(function () { step(1); }));

startLoop(50, refresh);

function getSidePanelSectionState() {
	var vl = T("Value");
	if (st.param >= 0) {
		var p = PARAMS[st.param];
		var range = (p.min !== null) ? p.min + " ~ " + p.max : T("no range limit");
		vl = T("Value (%1)", (p.unit ? pUnit(st.param) + ", " : "") + range);
	}
	return {
		"title": T("Param Point Editor"),
		"rows": [
			row([ro(status, 1.0, 40)]),
			label(vl),
			row([box(fValue, 1.0)]),
			label(T("Bar  |  Beat")),
			row([box(fMeasure, 0.5), box(fBeat, 0.5)]),
			label(T("Quarter notes  |  Seconds")),
			row([box(fQn, 0.5), box(fSec, 0.5)]),
			row([btn(T("Apply"), bApply, 0.5), btn(T("Revert"), bRevert, 0.5)]),
			row([btn(T("<< Previous point"), bPrev, 0.5), btn(T("Next point >>"), bNext, 0.5)])
		]
	};
}
