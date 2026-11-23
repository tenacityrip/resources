#!/usr/bin/env node
/** Fails when a translation is missing, unknown, or changes a placeholder, tag or color code. */
import { check } from "./lib.mjs";

const errors = check();
for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log("Translations match English.");
