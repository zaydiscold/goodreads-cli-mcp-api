// Side-effect-free package entry point. The Commander program remains the bin
// entry at dist/index.js; importing the package must never parse argv or exit.
export * from "./engine.js";
