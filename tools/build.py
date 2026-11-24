#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 morokoshibito. Licensed under the GNU GPL v3; see LICENSE.
"""Build the SV2 side panel scripts.

src/common.js          shared helpers, inserted at //@@COMMON@@
src/<Name>.js          one file per side panel
src/i18n/<lang>.json   English text -> translated text

Output: scripts/SV2_<Name>.js (UTF-8, LF), ready to copy into the SV scripts folder.

Checks (the build fails on any of them):
  * every T("...") string and parameter name/unit has a translation in every language
  * placeholders %1, %2 ... match between English and the translation
  * getClientInfo() contains only ASCII (SV rejects SidePanelSection names with non-ASCII)
  * no SV.T / T( / SV.refreshSidePanel at the top level of a script

Usage:  python3 tools/build.py          build
        python3 tools/build.py --check  check only, write nothing
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
OUT = os.path.join(ROOT, "scripts")
PANELS = ["ParamPointEditor", "ParamPointBatch", "ParamCurveTools"]
LANGS = ["zh-cn", "zh-tw", "ja-jp"]   # every other language shows English

T_CALL = re.compile(r'\bT\("((?:[^"\\]|\\.)*)"')
PLACEHOLDER = re.compile(r"%\d")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def js_str(s):
    return s.replace("\\", "\\\\").replace('"', '\\"')


def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"(^|[^:\"'])//[^\n]*", r"\1", src)


def strings_used(common, body):
    common, body = strip_comments(common), strip_comments(body)
    used = []
    names = re.findall(r'name: "([^"]+)"', common)
    units = [u for u in re.findall(r'unit: "([^"]*)"', common) if u]
    for s in T_CALL.findall(common) + T_CALL.findall(body) + names + units:
        s = s.encode("utf-8").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s
        if s not in used:
            used.append(s)
    return used


def top_level_code(src):
    """Return the source with every function body removed (depth-0 code only)."""
    out, depth, i = [], 0, 0
    in_str = None
    while i < len(src):
        ch = src[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str:
                in_str = None
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = len(src) if j < 0 else j
            continue
        elif src.startswith("/*", i):
            i = src.find("*/", i) + 2
            continue
        elif ch in "\"'":
            in_str = ch
        elif ch == "{":
            # only function bodies count; object literals at depth 0 are top-level code
            head = src[max(0, i - 80):i]
            if depth > 0 or re.search(r"function\s*[\w$]*\s*\([^)]*\)\s*$", head):
                depth += 1
                i += 1
                continue
        elif ch == "}" and depth > 0:
            depth -= 1
            i += 1
            continue
        if depth == 0:
            out.append(ch)
        i += 1
    return "".join(out)


def build(check_only):
    common = read(os.path.join(SRC, "common.js"))
    tables = {lang: json.loads(read(os.path.join(SRC, "i18n", lang + ".json"))) for lang in LANGS}
    errors = []

    for name in PANELS:
        body = read(os.path.join(SRC, name + ".js"))
        if "//@@COMMON@@" not in body:
            errors.append("%s: missing //@@COMMON@@ marker" % name)
            continue
        used = strings_used(common, body)

        for lang in LANGS:
            table = tables[lang]
            for s in used:
                if s not in table:
                    errors.append("%s [%s] missing translation: %r" % (name, lang, s))
                elif sorted(PLACEHOLDER.findall(s)) != sorted(PLACEHOLDER.findall(table[s])):
                    errors.append("%s [%s] placeholder mismatch: %r -> %r" % (name, lang, s, table[s]))

        info = re.search(r"function getClientInfo\(\)\s*\{.*?\n\}", body, re.S)
        if not info:
            errors.append("%s: getClientInfo() not found" % name)
        elif re.search(r"[^\x00-\x7f]", info.group(0)) or "T(" in info.group(0):
            errors.append("%s: getClientInfo() must be plain ASCII and must not call T()" % name)

        top = top_level_code(common + "\n" + body)
        for bad in ("SV.T(", "refreshSidePanel"):
            if bad in top:
                errors.append("%s: %s at the top level runs before translations are loaded" % (name, bad))
        if re.search(r"(?<![\w.])T\(", top.replace("function T(", "")):
            errors.append("%s: T() at the top level runs before translations are loaded" % name)

        blocks = []
        for lang in LANGS:
            pairs = ",\n".join('\t\t\t["%s", "%s"]' % (js_str(s), js_str(tables[lang].get(s, s))) for s in used)
            blocks.append('\tif (langCode == "%s") {\n\t\treturn [\n%s\n\t\t];\n\t}' % (lang, pairs))
        translations = (
            "\n// ------------------------------------------------------------------ translations\n"
            "// Generated by tools/build.py from src/i18n/*.json. Edit those files, not this block.\n"
            "// zh-cn, zh-tw and ja-jp are translated; every other language shows English.\n"
            "function getTranslations(langCode) {\n" + "\n".join(blocks) + "\n\treturn [];\n}\n")
        header = "// Generated by tools/build.py from src/. Do not edit by hand.\n"
        out = header + body.replace("//@@COMMON@@", common.rstrip()) + translations

        if not check_only:
            os.makedirs(OUT, exist_ok=True)
            with open(os.path.join(OUT, "SV2_%s.js" % name), "w", encoding="utf-8", newline="\n") as f:
                f.write(out)
        print("%-18s %3d strings  %s" % (name, len(used), "checked" if check_only else "built"))

    for lang, table in tables.items():
        all_used = set()
        for name in PANELS:
            all_used.update(strings_used(common, read(os.path.join(SRC, name + ".js"))))
        unused = sorted(set(table) - all_used)
        if unused:
            print("note [%s]: %d unused translation(s): %s" % (lang, len(unused), unused))

    if errors:
        print("\n".join("ERROR " + e for e in errors), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    build("--check" in sys.argv)
