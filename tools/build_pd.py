#!/usr/bin/env python3
"""Writes the Pure Data patch in pd/: the control panel (takt.pd), its engine,
and the six synth voices (pd/voices/). Pd files number their objects and wire
them by number, which is easy to get wrong by hand; this builds them from a
description instead. Edit here and rerun, or edit the patch in Pd directly.

    python3 tools/build_pd.py
"""

import os, re

OUT = os.path.join(os.path.dirname(__file__), '..', 'pd')


class Patch:
    """One Pd canvas: objects are numbered in the order they are added."""

    def __init__(self, w=900, h=640, name=None):
        self.lines, self.conns, self.n, self.w, self.h, self.name = [], [], 0, w, h, name

    def _add(self, line):
        self.lines.append(line)
        self.n += 1
        return self.n - 1

    def obj(self, x, y, text): return self._add(f'#X obj {x} {y} {text};')
    def msg(self, x, y, text): return self._add(f'#X msg {x} {y} {text};')
    def text(self, x, y, text):
        # Commas and semicolons separate messages in Pd files; in a comment they are escaped.
        text = re.sub(r'(?<!\\)([,;])', r' \\\1', text)
        return self._add(f'#X text {x} {y} {text};')
    def num(self, x, y, w, label='-', rcv='-', snd='-', lo=0, hi=0):
        return self._add(f'#X floatatom {x} {y} {w} {lo} {hi} 0 {label} {rcv} {snd} 0;')
    def sym(self, x, y, w, label='-', rcv='-', snd='-'):
        return self._add(f'#X symbolatom {x} {y} {w} 0 0 0 {label} {rcv} {snd} 0;')
    def sub(self, x, y, child):
        body = [f'#N canvas 60 60 {child.w} {child.h} {child.name} 0;', *child.lines,
                *[f'#X connect {a} {o} {b} {i};' for a, o, b, i in child.conns], f'#X restore {x} {y} pd {child.name}']
        self.lines.append('\n'.join(body) + ';')
        self.n += 1
        return self.n - 1
    def c(self, a, o, b, i=0): self.conns.append((a, o, b, i))
    def chain(self, *ids):
        for a, b in zip(ids, ids[1:]): self.c(a, 0, b, 0)

    def save(self, path, declare=None):
        head = [f'#N canvas 40 40 {self.w} {self.h} 12;']
        if declare:
            head.append(f'#X declare {declare};')
        with open(path, 'w') as f:
            f.write('\n'.join(head + self.lines + [f'#X connect {a} {o} {b} {i};' for a, o, b, i in self.conns]) + '\n')


# ---------------------------------------------------------------- the voices
# Every voice takes one list, freq midi pan amp late pos, and has two signal
# outlets, left and right. Shared controls arrive by name: takt-att and
# takt-rel scale the envelope, takt-bright is the low-pass, takt-detune the
# cents per minute late.

def voice(name, about, att, rel, gain, gen):
    p = Patch(640, 520)
    inl = p.obj(20, 20, 'inlet')
    up = p.obj(20, 50, 'unpack f f f f f f')
    fx = p.obj(20, 90, 'expr \\$f1*pow(2 \\, min(\\$f2*\\$f3 \\, 60)/1200)')
    rd = p.obj(260, 60, 'r takt-detune')
    p.c(inl, 0, up); p.c(up, 0, fx, 0); p.c(up, 4, fx, 1); p.c(rd, 0, fx, 2)
    # Envelope: rise to the note's loudness in `att` ms, fall away over `rel` ms.
    amp = p.obj(260, 140, f'* {gain}')
    pk = p.obj(260, 170, f'pack 0 {att} {rel}')
    ra = p.obj(380, 100, 'r takt-att'); ma = p.obj(380, 130, f'* {att}')
    rr = p.obj(480, 100, 'r takt-rel'); mr = p.obj(480, 130, f'* {rel}')
    em = p.msg(260, 200, '\\$1 \\$2 \\, 0 \\$3 \\$2')
    env = p.obj(260, 230, 'vline~')
    p.c(up, 3, amp); p.c(amp, 0, pk, 0); p.chain(ra, ma); p.c(ma, 0, pk, 1); p.chain(rr, mr); p.c(mr, 0, pk, 2)
    p.chain(pk, em, env)
    sig = gen(p, fx, env)                       # the sound, before the envelope
    shaped = p.obj(20, 330, '*~')
    lop = p.obj(20, 360, 'lop~ 3200'); rb = p.obj(120, 330, 'r takt-bright')
    p.c(sig, 0, shaped, 0); p.c(env, 0, shaped, 1); p.c(shaped, 0, lop, 0); p.c(rb, 0, lop, 1)
    # Equal-power pan: where the train is, left to right.
    cl = p.obj(380, 300, 'expr cos((\\$f1+1)*0.785398)'); sn = p.obj(380, 330, 'expr sin((\\$f1+1)*0.785398)')
    p.c(up, 2, cl); p.c(up, 2, sn)
    L = p.obj(20, 400, '*~ 0'); R = p.obj(160, 400, '*~ 0')
    p.c(lop, 0, L, 0); p.c(lop, 0, R, 0); p.c(cl, 0, L, 1); p.c(sn, 0, R, 1)
    p.c(L, 0, p.obj(20, 450, 'outlet~')); p.c(R, 0, p.obj(160, 450, 'outlet~'))
    p.text(380, 20, f'{name}: {about}')
    p.save(os.path.join(OUT, 'voices', f'takt-{name}.pd'))


def pluck(p, f, env):
    a = p.obj(20, 130, 'osc~'); m = p.obj(120, 130, '* 2'); b = p.obj(120, 160, 'osc~'); g = p.obj(120, 190, '*~ 0.25')
    s = p.obj(20, 260, '+~')
    p.c(f, 0, a); p.c(f, 0, m); p.chain(m, b, g); p.c(a, 0, s, 0); p.c(g, 0, s, 1)
    return s


def pad(p, f, env):
    m1 = p.obj(20, 130, '* 0.997'); m2 = p.obj(110, 130, '* 1.003'); m3 = p.obj(200, 130, '* 0.5')
    a = p.obj(20, 160, 'phasor~'); b = p.obj(110, 160, 'phasor~'); sub = p.obj(200, 160, 'osc~')
    ab = p.obj(20, 190, '+~'); ctr = p.obj(20, 215, '-~ 1'); half = p.obj(20, 240, '*~ 0.5'); sg = p.obj(200, 190, '*~ 0.6')
    s = p.obj(20, 265, '+~'); soft = p.obj(20, 290, 'lop~ 1600')
    for m in (m1, m2, m3): p.c(f, 0, m)
    p.chain(m1, a); p.chain(m2, b); p.chain(m3, sub, sg)
    p.c(a, 0, ab, 0); p.c(b, 0, ab, 1); p.chain(ab, ctr, half); p.c(half, 0, s, 0); p.c(sg, 0, s, 1); p.chain(s, soft)
    return soft


def bell(p, f, env):
    # FM: a modulator at 3.5 times the pitch, its depth falling with the note.
    mr = p.obj(110, 130, '* 3.5'); mod = p.obj(110, 160, 'osc~')
    dm = p.obj(200, 130, '* 1.6'); depth = p.obj(110, 190, '*~ 0')
    fall = p.obj(110, 220, '*~'); car_f = p.obj(20, 240, '+~ 0'); car = p.obj(20, 270, 'osc~')
    p.c(f, 0, mr); p.chain(mr, mod, depth); p.c(f, 0, dm); p.c(dm, 0, depth, 1)
    p.c(depth, 0, fall, 0); p.c(env, 0, fall, 1); p.c(fall, 0, car_f, 0); p.c(f, 0, car_f, 1); p.chain(car_f, car)
    return car


def glass(p, f, env):
    a = p.obj(20, 130, 'osc~'); m = p.obj(120, 130, '* 3'); b = p.obj(120, 160, 'osc~'); g = p.obj(120, 190, '*~ 0.12')
    s = p.obj(20, 260, '+~')
    p.c(f, 0, a); p.c(f, 0, m); p.chain(m, b, g); p.c(a, 0, s, 0); p.c(g, 0, s, 1)
    return s


def mallet(p, f, env):
    a = p.obj(20, 130, 'osc~'); m = p.obj(120, 130, '* 4'); b = p.obj(120, 160, 'osc~'); g = p.obj(120, 190, '*~ 0.35')
    s = p.obj(20, 260, '+~')
    p.c(f, 0, a); p.c(f, 0, m); p.chain(m, b, g); p.c(a, 0, s, 0); p.c(g, 0, s, 1)
    return s


def breath(p, f, env):
    n = p.obj(20, 130, 'noise~'); bp = p.obj(20, 170, 'bp~ 440 30'); g = p.obj(20, 210, '*~ 20')
    p.c(n, 0, bp, 0); p.c(f, 0, bp, 1); p.chain(bp, g)
    return g


SYNTHS = [  # name, description, attack ms, release ms, gain, generator
    ('pluck', 'a fundamental and a soft octave, plucked', 4, 2200, 0.12, pluck),
    ('pad', 'two detuned saws and a sub, slow to rise and fall (ambient)', 900, 6000, 0.06, pad),
    ('bell', 'FM, a bright strike that mellows', 2, 4000, 0.10, bell),
    ('glass', 'pure sines with a faint twelfth, long', 30, 5000, 0.10, glass),
    ('mallet', 'a marimba-like knock with its fourth partial', 1, 700, 0.14, mallet),
    ('breath', 'noise tuned through a narrow filter, airy', 250, 2500, 0.10, breath),
]
NAMES = ['Pluck', 'Ambient pad', 'Bell', 'Glass', 'Mallet', 'Breath']

# ------------------------------------------------------------------- presets
CONTROLS = [  # key, label, low, high, log, what it is
    ('vol', 'Volume', 0, 1, 0), ('att', 'Attack', 0.2, 4, 0), ('rel', 'Release', 0.2, 4, 0),
    ('bright', 'Brightness', 300, 9000, 1), ('detune', 'Late\\ detune', 0, 8, 0),
    ('dtime', 'Delay\\ time', 50, 1500, 0), ('dfb', 'Delay\\ feedback', 0, 0.85, 0), ('dmix', 'Delay\\ mix', 0, 0.8, 0),
    ('rmix', 'Reverb\\ mix', 0, 1, 0), ('rsize', 'Reverb\\ size', 0, 98, 0), ('rdamp', 'Reverb\\ damping', 0, 90, 0),
]
PRESETS = [  # name, synth, att, rel, bright, detune, dtime, dfb, dmix, rmix, rsize, rdamp
    ('Clean pluck', 0, 1, 1, 3200, 1.5, 375, 0.3, 0.25, 0.2, 70, 40),
    ('Ambient', 1, 1.5, 2, 1800, 1, 750, 0.55, 0.35, 0.65, 92, 30),
    ('Echo chamber', 3, 1, 1.5, 4000, 1.5, 500, 0.7, 0.5, 0.4, 85, 50),
    ('Bells in a hall', 2, 1, 1.3, 6000, 2, 300, 0.2, 0.15, 0.55, 90, 20),
    ('Dry percussion', 4, 1, 0.6, 5000, 3, 200, 0.1, 0.1, 0.08, 40, 60),
    ('Night breath', 5, 1.2, 1.5, 2500, 1, 900, 0.5, 0.3, 0.7, 94, 35),
]


def engine():
    """Everything that makes sound: OSC in, the six synths, delay, reverb, out."""
    e = Patch(1100, 700, 'engine')
    e.text(20, 10, 'OSC from the bridge (UDP) -> the selected synth -> delay -> reverb -> out');
    net = e.obj(20, 40, 'netreceive -u -b 9000')
    lm = e.msg(200, 10, 'listen \\$1'); rp = e.obj(200, -20, 'r takt-port')
    e.chain(rp, lm); e.c(lm, 0, net)
    parse = e.obj(20, 70, 'oscparse'); trim = e.obj(20, 100, 'list trim')
    rt = e.obj(20, 130, 'route takt'); rk = e.obj(20, 160, 'route pluck click hour state')
    e.chain(net, parse, trim, rt, rk)
    # Notes: to whichever synth is selected, round robin over its voices.
    tb = e.obj(20, 200, 't a b'); blink = e.obj(120, 230, 's takt-blink')
    pre = e.obj(20, 230, 'list prepend 0'); rs = e.obj(150, 200, 'r takt-synth')
    sel = e.obj(20, 260, 'route 0 1 2 3 4 5')
    e.c(rk, 0, tb); e.c(tb, 1, blink); e.c(tb, 0, pre, 0); e.c(rs, 0, pre, 1); e.chain(pre, sel)
    busL = e.obj(20, 420, '*~ 1'); busR = e.obj(160, 420, '*~ 1')
    for k, (name, *_rest) in enumerate(SYNTHS):
        x = 20 + k * 150
        nx = e.obj(x, 300, 'list prepend next'); tr = e.obj(x, 325, 'list trim')
        cl = e.obj(x, 355, f'clone 10 takt-{name}')
        e.c(sel, k, nx); e.chain(nx, tr, cl); e.c(cl, 0, busL); e.c(cl, 1, busR)
    # A cancelled train: a short burst of filtered noise.
    cu = e.obj(950, 160, 'unpack f s'); cm = e.msg(950, 190, '0.5 \\, 0 60'); cv = e.obj(950, 220, 'vline~')
    cn = e.obj(1040, 190, 'noise~'); cx = e.obj(1040, 250, '*~'); cb = e.obj(1040, 280, 'bp~ 1800 4')
    e.c(rk, 1, cu); e.chain(cu, cm, cv); e.c(cn, 0, cx, 0); e.c(cv, 0, cx, 1); e.chain(cx, cb); e.c(cb, 0, busL); e.c(cb, 0, busR)
    # The hour: the new chord's root, low and long.
    hu = e.obj(950, 320, 'unpack f s'); hm = e.obj(950, 350, '- 12'); hf = e.obj(950, 375, 'mtof'); ho = e.obj(950, 400, 'osc~')
    he = e.msg(1040, 350, '0.18 30 \\, 0 5000 30'); hv = e.obj(1040, 380, 'vline~'); hx = e.obj(950, 430, '*~')
    e.c(rk, 2, hu); e.chain(hu, hm, hf, ho); e.c(hu, 0, he); e.chain(he, hv); e.c(ho, 0, hx, 0); e.c(hv, 0, hx, 1)
    e.c(hx, 0, busL); e.c(hx, 0, busR)
    # The whole network, once a second, to the panel.
    su = e.obj(950, 470, 'unpack f f f f f s s')
    e.c(rk, 3, su); e.c(su, 0, e.obj(950, 500, 's takt-trains')); e.c(su, 1, e.obj(1060, 500, 's takt-late'))
    e.c(su, 5, e.obj(950, 530, 's takt-network'))
    # Delay: a ping-pong-ish stereo echo, the right side a little longer.
    rdt = e.obj(320, 440, 'r takt-dtime'); rwide = e.obj(430, 440, '* 1.33')
    rfb = e.obj(540, 440, 'r takt-dfb'); rmx = e.obj(650, 440, 'r takt-dmix')
    out = {}
    for side, bus, x in (('L', busL, 20), ('R', busR, 300)):
        dw = e.obj(x, 520, f'delwrite~ takt-delay-{side} 3000')
        dr = e.obj(x, 480, f'delread~ takt-delay-{side} 400')
        fb = e.obj(x + 170, 480, '*~ 0'); mix = e.obj(x + 170, 510, '*~ 0')
        e.c(bus, 0, dw); e.c(dr, 0, fb, 0); e.c(fb, 0, dw); e.c(dr, 0, mix, 0)
        e.c(rfb, 0, fb, 1); e.c(rmx, 0, mix, 1)
        e.c(rdt if side == 'L' else rwide, 0, dr, 0)
        out[side] = (bus, mix)
    e.c(rdt, 0, rwide)
    # Reverb: Pd's own rev3~. Dry and echo go in; the wet mix comes out.
    rev = e.obj(20, 580, 'rev3~ 100 80 3000 30')
    rsz = e.obj(250, 550, 'r takt-rsize'); rdp = e.obj(360, 550, 'r takt-rdamp'); rwm = e.obj(470, 550, 'r takt-rmix')
    for k, side in enumerate('LR'):
        bus, mix = out[side]
        e.c(bus, 0, rev, k); e.c(mix, 0, rev, k)
    e.c(rsz, 0, rev, 3); e.c(rdp, 0, rev, 5)
    wL = e.obj(20, 610, '*~ 0'); wR = e.obj(160, 610, '*~ 0')
    e.c(rev, 0, wL, 0); e.c(rev, 1, wR, 0); e.c(rwm, 0, wL, 1); e.c(rwm, 0, wR, 1)
    # Out: dry + echo + reverb, at the volume, never past full scale.
    vol = e.obj(600, 600, 'r takt-vol')
    mL = e.obj(320, 640, '*~ 0'); mR = e.obj(460, 640, '*~ 0')
    for side, m, w in (('L', mL, wL), ('R', mR, wR)):
        bus, mix = out[side]
        e.c(bus, 0, m, 0); e.c(mix, 0, m, 0); e.c(w, 0, m, 0); e.c(vol, 0, m, 1)
    cL = e.obj(320, 670, 'clip~ -1 1'); cR = e.obj(460, 670, 'clip~ -1 1'); dac = e.obj(320, 700, 'dac~ 1 2')
    e.chain(mL, cL); e.chain(mR, cR); e.c(cL, 0, dac, 0); e.c(cR, 0, dac, 1)
    # A level meter for the panel.
    lv = e.obj(600, 700, 'env~ 4096'); e.c(cL, 0, lv); e.c(lv, 0, e.obj(600, 730, 's takt-level'))
    lb = e.obj(800, 10, 'loadbang'); dsp = e.msg(800, 40, '\\; pd dsp 1'); e.chain(lb, dsp)
    return e


def presets():
    p = Patch(700, 400, 'presets')
    r = p.obj(20, 20, 'r takt-preset')
    sel = p.obj(20, 50, 'select ' + ' '.join(str(i) for i in range(len(PRESETS))))
    p.chain(r, sel)
    keys = ['synth', 'att', 'rel', 'bright', 'detune', 'dtime', 'dfb', 'dmix', 'rmix', 'rsize', 'rdamp']
    for i, (name, *vals) in enumerate(PRESETS):
        body = ' '.join(f'\\; takt-{k}-set {v}' for k, v in zip(keys, vals))
        m = p.msg(20, 90 + i * 45, body)
        p.c(sel, i, m)
    return p


def panel():
    p = Patch(900, 640)
    p.obj(700, 600, 'declare -path voices')
    p.text(20, 14, 'TAKT: the trains as OSC \\, played here.')
    p.text(20, 36, '1) Start the bridge: node tools/osc-bridge.mjs --port 8080 --to 9000 (or your own ports).')
    p.text(20, 56, '2) In Takt: Advanced > Output \\, the bridge port \\, Connect. 3) Pick a synth or a preset below.')
    p.num(130, 90, 6, 'OSC\\ port\\ (UDP)', 'takt-port-set', 'takt-port', 1, 65535)
    p.obj(300, 88, 'bng 18 120 50 0 empty takt-blink notes 24 9 0 12 #fcfcfc #000000 #000000')
    p.num(420, 90, 6, 'trains', 'takt-trains'); p.num(560, 90, 6, 'late', 'takt-late')
    p.sym(700, 90, 18, '-', 'takt-network')
    p.num(130, 118, 6, 'level\\ dB', 'takt-level')
    p.text(20, 160, 'SYNTH'); p.text(260, 160, 'PRESET')
    p.obj(20, 185, f'vradio 20 1 0 {len(NAMES)} takt-synth takt-synth-set empty 0 -10 0 12 #dfdfdf #000000 #000000 0')
    for i, n in enumerate(NAMES):
        p.text(46, 186 + i * 20, n)
    p.obj(260, 185, f'vradio 20 1 0 {len(PRESETS)} takt-preset takt-preset-set empty 0 -10 0 12 #dfdfdf #000000 #000000 0')
    for i, (n, *_r) in enumerate(PRESETS):
        p.text(286, 186 + i * 20, n)
    p.text(520, 160, 'SOUND \\, ECHO \\, ROOM')
    for i, (k, label, lo, hi, log) in enumerate(CONTROLS):
        y = 190 + i * 34
        p.obj(520, y, f'hsl 180 16 {lo} {hi} {log} 0 takt-{k} takt-{k}-set {label} -2 -9 0 12 #dfdfdf #000000 #000000 0 1')
        p.num(710, y, 7, '-', f'takt-{k}')
    p.text(20, 330, 'Attack and Release scale each synth\'s own envelope (1 = as designed).')
    p.text(20, 350, 'Late detune: cents out of tune for every minute a train is late.')
    p.text(20, 370, 'Sends from the bridge: /takt/pluck /takt/click /takt/hour /takt/state.')
    p.text(20, 390, 'Your own synth: any abstraction with one inlet (freq midi pan amp late pos)')
    p.text(20, 410, 'and two outlet~s \\, in voices/. See README \\, "OSC out".')
    p.sub(20, 450, engine())
    p.sub(120, 450, presets())
    lb = p.obj(20, 500, 'loadbang')
    init = p.msg(20, 530, '\\; takt-port-set 9000 \\; takt-vol-set 0.7 \\; takt-preset-set 0')
    p.chain(lb, init)
    p.save(os.path.join(OUT, 'takt.pd'), declare='-path voices')


if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'voices'), exist_ok=True)
    for name, about, att, rel, gain, gen in SYNTHS:
        voice(name, about, att, rel, gain, gen)
    panel()
    print('wrote pd/takt.pd, pd/voices/takt-*.pd')
