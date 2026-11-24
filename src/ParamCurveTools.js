// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
/*
 * [SV2] Param Curve Tools (3/3, less used)
 * Playhead readout and insert, curve simplification, copy selected points to another parameter or group.
 * Requires Synthesizer V Studio 2 Pro 2.1.2+. UI follows the SV language (English / Simplified Chinese).
 * Note: a SidePanelSection script's "name" must be ASCII, so it is not translated.
 */

function getClientInfo() {
	return {
		"name": "Param Curve Tools",
		"category": "Utilities",
		"author": "morokoshibito",
		"versionNumber": 3,
		"minEditorVersion": 131330,
		"type": "SidePanelSection"
	};
}

//@@COMMON@@

var status = W("");
var phParam = W(2), bInsert = W(0);
var threshold = W("0.002"), bSimplify = W(0);
var tgtParam = W(3), tgtGroup = W(0), dq = W("0"), mapRange = W(false), overwrite = W(false), bCopy = W(0), bGroups = W(0);

var st = { param: -1, pos: [] };
var groupRefs = [], groupNames = [], groupsBuilt = false;

function names() { var n = []; for (var i = 0; i < PARAMS.length; i++) { n.push(pName(i)); } return n; }

// playhead readout follows the parameter of the selected points; otherwise the combo box
function phIndex() { return st.param >= 0 ? st.param : Number(phParam.getValue()); }

function playhead() {
	var sec = SV.getPlayback().getPlayhead(), abs = timeAxis().getBlickFromSeconds(sec);
	return { sec: sec, abs: abs, local: abs - offset() };
}

function refresh() {
	if (!groupsBuilt) { buildGroups(); }
	var pick = scanSelection();
	if (pick) {
		if (pick.p !== st.param) { phParam.setValue(pick.p); }
		st.param = pick.p; st.pos = pick.pos;
	} else { st.param = -1; st.pos = []; }
	var p = phIndex(), ph = playhead();
	status.setValue(T("Playhead %1 · %2 s", mbText(ph.abs), fx(ph.sec, 3)) + "\n" +
		pName(p) + " = " + fx(automation(p).get(ph.local), 4) + (PARAMS[p].unit ? " " + pUnit(p) : "") + msgLine());
}

function insertAtPlayhead() {
	var p = phIndex(), ph = playhead();
	if (ph.local < 0) { say(T("The playhead is before the start of the current group.")); return; }
	var pos = Math.round(ph.local), auto = automation(p);
	auto.add(pos, auto.get(pos));
	reselect(p, st.param === p ? st.pos.slice(0) : [], [pos]);
	say(T("Inserted a point (keeps the curve value, shape unchanged)."));
}

function simplify() {
	var p = phIndex(), auto = automation(p), th = num(threshold);
	if (isNaN(th) || th <= 0) { say(T("Invalid threshold.")); return; }
	var all = sortedPoints(auto);
	if (all.length < 3) { say(T("Too few points to simplify.")); return; }
	var whole = st.pos.length < 2, b, e;
	if (whole) { b = all[0][0]; e = all[all.length - 1][0]; }
	else { b = st.pos[0]; e = st.pos[st.pos.length - 1]; }
	var before = all.length;
	if (!whole) { reselect(p, st.pos.slice(0), []); }
	auto.simplify(b, e, th);
	var after = auto.getAllPoints().length;
	say(whole ? T("Whole curve: %1 -> %2 point(s).", before, after) : T("Selected range: %1 -> %2 point(s).", before, after));
}

function buildGroups() {
	groupRefs = []; groupNames = [];
	var project = SV.getProject();
	for (var t = 0; t < project.getNumTracks(); t++) {
		var track = project.getTrack(t);
		for (var g = 0; g < track.getNumGroups(); g++) {
			var ref = track.getGroupReference(g);
			groupRefs.push(ref);
			groupNames.push(track.getName() + " / " + (g === 0 ? T("Main group") :
				ref.getTarget().getName() + " @ " + T("bar %1", blickToMB(offsetOf(ref)).measure)));
		}
	}
	groupsBuilt = true;
	var cur = groupRef();
	for (var i = 0; i < groupRefs.length; i++) {
		if (groupRefs[i].getTarget().getName() === cur.getTarget().getName() && offsetOf(groupRefs[i]) === offsetOf(cur)) {
			tgtGroup.setValue(i);
		}
	}
	try { SV.refreshSidePanel(); } catch (e) {}
}

function rangeOf(pIdx, auto) {
	try { var r = auto.getDefinition().range; if (r && r[1] > r[0]) { return r; } } catch (e) {}
	return PARAMS[pIdx].min !== null ? [PARAMS[pIdx].min, PARAMS[pIdx].max] : null;
}

function copy() {
	if (st.param < 0) { say(T("Select the points to copy first.")); return; }
	var gi = Number(tgtGroup.getValue()), tp = Number(tgtParam.getValue()), shift = num(dq);
	var dst = groupRefs[gi];
	if (!dst) { say(T("Refresh the group list first.")); return; }
	if (isNaN(shift)) { say(T("Invalid time offset.")); return; }
	var srcAuto = automation(st.param), dstAuto = autoOf(dst, tp), srcOff = offset(), dstOff = offsetOf(dst);
	var sr = rangeOf(st.param, srcAuto), tr = rangeOf(tp, dstAuto);
	var map = mapRange.getValue() && sr && tr;

	var out = [], skipped = 0;
	for (var i = 0; i < st.pos.length; i++) {
		var local = Math.round(st.pos[i] + srcOff - dstOff + shift * SV.QUARTER);
		if (local < 0) { skipped++; continue; }
		var v = srcAuto.get(st.pos[i]);
		if (map) { v = tr[0] + (v - sr[0]) / (sr[1] - sr[0]) * (tr[1] - tr[0]); }
		out.push([local, clampValue(tp, v)]);
	}
	if (!out.length) { say(T("All points fall before the start of the target group; nothing copied. Try a larger time offset.")); return; }
	if (overwrite.getValue()) {
		var ex = sortedPoints(dstAuto);
		for (var j = 0; j < ex.length; j++) {
			if (ex[j][0] >= out[0][0] && ex[j][0] <= out[out.length - 1][0]) { dstAuto.remove(ex[j][0]); }
		}
	}
	for (var k = 0; k < out.length; k++) { dstAuto.add(out[k][0], out[k][1]); }
	say(skipped ? T("Copied %1 point(s) to %2; skipped %3.", out.length, pName(tp), skipped)
		: T("Copied %1 point(s) to %2.", out.length, pName(tp)));
}

bInsert.setValueChangeCallback(wrap(insertAtPlayhead));
bSimplify.setValueChangeCallback(wrap(simplify));
bCopy.setValueChangeCallback(wrap(copy));
bGroups.setValueChangeCallback(wrap(buildGroups));

startLoop(100, refresh);

function getSidePanelSectionState() {
	var n = names();
	return {
		"title": T("Param Curve Tools"),
		"rows": [
			row([ro(status, 1.0, 55)]),

			label(T("Playhead (uses this parameter when nothing is selected)")),
			row([combo(phParam, n, 0.5), btn(T("Insert point at playhead"), bInsert, 0.5)]),

			label(T("Simplify (whole curve when nothing is selected): threshold")),
			row([box(threshold, 0.5), btn(T("Simplify"), bSimplify, 0.5)]),

			label(T("Copy selected points to: parameter  |  group")),
			row([combo(tgtParam, n, 0.5), combo(tgtGroup, groupNames.length ? groupNames : [T("(refresh)")], 0.5)]),
			label(T("Time offset (quarter notes)")),
			row([box(dq, 0.5), btn(T("Refresh groups"), bGroups, 0.5)]),
			row([check(T("Convert values by the ranges of both parameters"), mapRange)]),
			row([check(T("Delete existing points in the target range first"), overwrite)]),
			row([btn(T("Copy"), bCopy, 1.0)])
		]
	};
}
