// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
// Run with:  node tests/run_tests.js
// Tests the built scripts in scripts/ against tests/mock_sv.js.
"use strict";
var path = require("path");
var assert = require("assert");
var mock = require("./mock_sv");
var Q = mock.Q;

var DIR = path.join(__dirname, "..", "scripts");
var EDITOR = path.join(DIR, "SV2_ParamPointEditor.js");
var BATCH = path.join(DIR, "SV2_ParamPointBatch.js");
var TOOLS = path.join(DIR, "SV2_ParamCurveTools.js");

var passed = 0, failed = 0;
function test(name, fn) {
	try { fn(); passed++; console.log("  ok   " + name); }
	catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}
function pts(c) { return c.pts.map(function (p) { return [+(p[0] / Q).toFixed(3), +p[1].toFixed(3)]; }); }
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-6, a + " != " + b); }

console.log("Param Point Editor");

test("shows exact position and value of the selected point", function () {
	var sv = mock.load(EDITOR, "en-us"), c = sv.ctx;
	sv.curve().add(0, -6); sv.curve().add(4.75 * Q, -7.5); sv.curve().add(8 * Q, 3);
	sv.select("loudness", [4.75 * Q]); sv.tick();
	assert.strictEqual(c.fValue.getValue(), "-7.5000");
	assert.strictEqual(c.fMeasure.getValue(), "2");
	assert.strictEqual(c.fBeat.getValue(), "1.7500");
	assert.strictEqual(c.fQn.getValue(), "4.750000");
	assert.strictEqual(c.fSec.getValue(), "2.375000");
	assert.ok(sv.status().indexOf("curve point 2/3") >= 0);
});

test("applies an edited beat and value", function () {
	var sv = mock.load(EDITOR, "en-us"), c = sv.ctx;
	sv.curve().add(0, -6); sv.curve().add(4.75 * Q, -7.5); sv.curve().add(8 * Q, 3);
	sv.select("loudness", [4.75 * Q]); sv.tick();
	c.fBeat.setValue("3.5"); c.fValue.setValue("-3"); c.bApply.fire(); sv.tick();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -6], [6.5, -3], [8, 3]]);
	assert.deepStrictEqual(sv.selected.loudness, [6.5 * Q]);
});

test("applies an edited quarter-note position and clamps the value", function () {
	var sv = mock.load(EDITOR, "en-us"), c = sv.ctx;
	sv.curve().add(0, 0); sv.curve().add(2 * Q, 0);
	sv.select("loudness", [2 * Q]); sv.tick();
	c.fQn.setValue("3"); c.fValue.setValue("99"); c.bApply.fire(); sv.tick();
	assert.deepStrictEqual(pts(sv.curve()), [[0, 0], [3, 12]]);
});

test("previous / next point moves the selection along the curve", function () {
	var sv = mock.load(EDITOR, "en-us"), c = sv.ctx;
	sv.curve().add(0, 1); sv.curve().add(Q, 2); sv.curve().add(2 * Q, 3);
	sv.select("loudness", [Q]); sv.tick();
	c.bNext.fire(); sv.tick();
	assert.strictEqual(c.fValue.getValue(), "3.0000");
	c.bPrev.fire(); sv.tick(); c.bPrev.fire(); sv.tick();
	assert.strictEqual(c.fValue.getValue(), "1.0000");
});

test("keeps the last values while dragging instead of clearing", function () {
	var sv = mock.load(EDITOR, "en-us"), c = sv.ctx;
	sv.curve().add(Q, 2); sv.select("loudness", [Q]); sv.tick();
	sv.setDragging(true); sv.select("loudness", []); sv.tick();
	assert.strictEqual(c.fValue.getValue(), "2.0000");
	assert.ok(sv.status().indexOf("dragging") >= 0);
});

console.log("Param Point Batch");

function batchWith(points) {
	var sv = mock.load(BATCH, "en-us");
	points.forEach(function (p) { sv.curve().add(p[0] * Q, p[1]); });
	sv.select("loudness", points.map(function (p) { return p[0] * Q; }));
	sv.tick();
	return sv;
}
var FOUR = [[0, -6], [1, -3], [1.5, 0], [4, 6]];

test("statistics in the status box", function () {
	var s = batchWith(FOUR).status();
	assert.ok(s.indexOf("4 point(s) selected") >= 0 && s.indexOf("Min -6.000") >= 0 && s.indexOf("Avg -0.750") >= 0, s);
});

test("set one value", function () {
	var sv = batchWith(FOUR); sv.ctx.setVal.setValue("-2"); sv.ctx.bSet.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -2], [1, -2], [1.5, -2], [4, -2]]);
});

test("linear transition recalculates middle points", function () {
	var sv = batchWith(FOUR); sv.ctx.bRecalc.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -6], [1, -3], [1.5, -1.5], [4, 6]]);
});

test("cosine transition generates points by density", function () {
	var sv = batchWith([[0, 0], [4, 6]]);
	sv.curve().add(0.3 * Q, 1);
	sv.ctx.shape.setValue(1); sv.ctx.density.setValue("1"); sv.ctx.bGenerate.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, 0], [1, 0.879], [2, 3], [3, 5.121], [4, 6]]);
});

test("scale around the average and around a given center", function () {
	var sv = batchWith(FOUR); sv.ctx.factor.setValue("2"); sv.ctx.center.setValue("0"); sv.ctx.bScale.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -12], [1, -6], [1.5, 0], [4, 12]]);
	sv = batchWith([[0, 1], [1, 3]]); sv.ctx.factor.setValue("2"); sv.ctx.center.setValue(""); sv.ctx.bScale.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, 0], [1, 4]]);
});

test("quantize merges points on the same grid line and fixes the selection", function () {
	var sv = batchWith([[0, -6], [1.1, -3], [1.2, 0], [3.9, 6]]);
	sv.ctx.grid.setValue(0); sv.ctx.bQuant.fire(); sv.tick();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -6], [1, 0], [4, 6]]);
	assert.strictEqual(sv.selected.loudness.length, 3);
});

test("space evenly between ends", function () {
	var sv = batchWith(FOUR); sv.ctx.bSpace.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, -6], [1.333, -3], [2.667, 0], [4, 6]]);
});

console.log("Param Curve Tools");

test("playhead readout and insert keeps the curve shape", function () {
	var sv = mock.load(TOOLS, "en-us");
	sv.curve().add(0, 0); sv.curve().add(4 * Q, 6); sv.tick();
	assert.ok(sv.status().indexOf("Loudness = 3.7500 dB") >= 0, sv.status());
	sv.ctx.bInsert.fire();
	assert.deepStrictEqual(pts(sv.curve()), [[0, 0], [2.5, 3.75], [4, 6]]);
});

test("simplify the whole curve when nothing is selected", function () {
	var sv = mock.load(TOOLS, "en-us");
	[0, 1, 2, 3, 4].forEach(function (x) { sv.curve().add(x * Q, x); }); sv.tick();
	sv.ctx.bSimplify.fire();
	assert.ok(sv.curve().pts.length < 5);
});

test("copy to another group with range conversion", function () {
	var sv = mock.load(TOOLS, "en-us");
	sv.curve().add(0, -48); sv.curve().add(4 * Q, 12);
	sv.select("loudness", [0, 4 * Q]); sv.tick();
	sv.ctx.tgtParam.setValue(3); sv.ctx.tgtGroup.setValue(1); sv.ctx.dq.setValue("8"); sv.ctx.mapRange.setValue(true);
	sv.ctx.bCopy.fire();
	assert.deepStrictEqual(pts(sv.chorus.getParameter("tension")), [[0, -1], [4, 1]]);
});

console.log("Localization");

[EDITOR, BATCH, TOOLS].forEach(function (file) {
	var short = path.basename(file);
	test(short + ": no panel refresh before translations are loaded (title stays translated)", function () {
		var sv = mock.load(file, "zh-cn");
		sv.curve().add(0, 0); sv.tick(3);
		sv.titlesAtRefresh.forEach(function (r) {
			assert.ok(r.ready, "refreshSidePanel() was called while the script was still loading");
		});
		assert.ok(/[^\x00-\x7f]/.test(sv.ctx.getSidePanelSectionState().title), "title is not translated");
	});
	test(short + ": name in getClientInfo is ASCII in every language", function () {
		["zh-cn", "zh-tw", "ja-jp", "en-us"].forEach(function (lang) {
			var sv = mock.load(file, lang); sv.tick();
			assert.ok(!/[^\x00-\x7f]/.test(sv.ctx.getClientInfo().name));
		});
	});
});

test("titles in each language", function () {
	var expect = {
		"zh-cn": ["参数点精确编辑", "参数点批量调整", "参数曲线工具"],
		"zh-tw": ["參數點精確編輯", "參數點批次調整", "參數曲線工具"],
		"ja-jp": ["パラメータ点の精密編集", "パラメータ点の一括調整", "パラメータカーブツール"],
		"en-us": ["Param Point Editor", "Param Point Batch", "Param Curve Tools"],
		"de-de": ["Param Point Editor", "Param Point Batch", "Param Curve Tools"]
	};
	Object.keys(expect).forEach(function (lang) {
		[EDITOR, BATCH, TOOLS].forEach(function (file, i) {
			var sv = mock.load(file, lang); sv.tick();
			assert.strictEqual(sv.ctx.getSidePanelSectionState().title, expect[lang][i], lang);
		});
	});
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
