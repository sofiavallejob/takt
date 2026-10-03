// Takt in SuperCollider: the trains as OSC, played on a small synth.
//
// 1. Start the bridge, pointed at SuperCollider's port (57120):
//      node tools/osc-bridge.mjs --port 8080 --to 57120
// 2. In SuperCollider: select everything in this file and press Cmd+Enter (Ctrl+Enter).
// 3. In Takt: Advanced > Output, port 8080, Connect.
//
// Messages (see the README, "OSC out"):
//   /takt/pluck  freq midi pan amp late pos kind line
//   /takt/click  pan line
//   /takt/hour   root chord
//   /takt/state  moving late cancelled lean clock network mode

(
s.waitForBoot {
	// One plucked string: a sine and a soft octave, detuned as the train is late.
	SynthDef(\taktPluck, { |freq = 440, amp = 0.3, pan = 0, late = 0, bright = 3200|
		var detune = ((late * 1.5).min(50) / 100).midiratio;   // 1.5 cents a minute late, up to 50
		var env = EnvGen.kr(Env.perc(0.004, 2.2), doneAction: 2);
		var sig = SinOsc.ar(freq * detune) + (SinOsc.ar(freq * 2 * detune) * 0.25);
		Out.ar(\fx.kr(0), Pan2.ar(LPF.ar(sig, bright) * env * amp * 0.12, pan));
	}).add;

	// A cancelled train: a click of filtered noise.
	SynthDef(\taktClick, { |pan = 0|
		var env = EnvGen.kr(Env.perc(0, 0.06), doneAction: 2);
		Out.ar(\fx.kr(0), Pan2.ar(BPF.ar(WhiteNoise.ar, 1800, 0.25) * env * 0.5, pan));
	}).add;

	// The hour: the new chord's root, low and long.
	SynthDef(\taktHour, { |root = 45|
		var env = EnvGen.kr(Env.perc(0.03, 5), doneAction: 2);
		Out.ar(\fx.kr(0), (SinOsc.ar((root - 12).midicps) * env * 0.18).dup);
	}).add;

	// A room: everything goes through a reverb to the speakers.
	~bus = Bus.audio(s, 2);
	SynthDef(\taktRoom, { |mix = 0.35, room = 0.8|
		var dry = In.ar(~bus, 2);
		Out.ar(0, FreeVerb2.ar(dry[0], dry[1], mix, room, 0.4));
	}).add;
	s.sync;
	~room = Synth.tail(s, \taktRoom);

	OSCdef(\taktPluck, { |m| Synth(\taktPluck, [\freq, m[1], \pan, m[3], \amp, m[4], \late, m[5], \fx, ~bus]) }, '/takt/pluck');
	OSCdef(\taktClick, { |m| Synth(\taktClick, [\pan, m[1], \fx, ~bus]) }, '/takt/click');
	OSCdef(\taktHour, { |m| Synth(\taktHour, [\root, m[1], \fx, ~bus]) }, '/takt/hour');
	OSCdef(\taktState, { |m| ("% trains moving in %, % late".format(m[1].asInteger, m[6], (m[2] * 100).round(1).asString ++ "%")).postln }, '/takt/state');

	"Takt: listening for the trains on port %.".format(NetAddr.langPort).postln;
};
)

// To stop: Cmd+. (Ctrl+.) stops the sound; this removes the listeners.
// OSCdef.freeAll;
