import assert from "node:assert/strict";
import { test } from "node:test";
import { check, flatten, mismatch, parseLang, unflatten } from "../scripts/lib.mjs";

test("lang files keep = in values and skip comments", () => {
    assert.deepEqual([...parseLang("# c\r\na = x=y\n\nb\n")], [["a", "x=y"]]);
});

test("json round-trips through the flat form", () => {
    const shape = { a: { b: "x", c: ["1", { d: "2" }] } };
    assert.deepEqual(unflatten(shape, flatten(shape)), shape);
});

test("translations must keep placeholders, tags and color codes", () => {
    assert.equal(mismatch("Hi {name}", "Hallo {name}"), null);
    assert.match(mismatch("Hi {name}", "Hallo {nom}"), /tokens differ/);
    assert.match(mismatch("<a>Docs</a>", "Doku"), /tokens differ/);
    assert.match(mismatch("§aon", "an"), /tokens differ/);
    assert.match(mismatch("Docs", '<img src="x">'), /stray markup/);
    assert.match(mismatch("Docs", "{count, plural, other {x}}"), /tokens differ|stray braces/);
    assert.match(mismatch("Docs", " "), /empty/);
});

test("check reports missing and unknown keys", () => {
    const catalog = { en: new Map([["a", "A"]]), label: () => "x", read: () => new Map([["b", "B"]]) };
    assert.deepEqual(check([catalog], ["de"]), ["x: missing a", "x: unknown b"]);
});
