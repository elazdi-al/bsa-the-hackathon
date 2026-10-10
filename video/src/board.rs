//! The protocol board: shares P S B (+ home copy of B) and credentials A R on the left, the
//! 2-of-3 MPC combiner in the middle, wallet W with its four gates and the outcome on the right.
//! A scene is compiled up front into timed tracks; drawing a frame only reads them.

use std::sync::LazyLock;

use crate::px::*;
use crate::sfx::{BLIP, POP};
use crate::{Cue, DISS, SPECS};

pub const P: usize = 0;
pub const S: usize = 1;
pub const B: usize = 2;
pub const L: usize = 3;
pub const A: usize = 4;
pub const R: usize = 5;
const COMB: usize = 6;
const WALLET: usize = 7;
const OUT: usize = 8;
const EM: usize = 6; // edge combiner -> MPC gate
const EO: usize = 7; // edge wallet -> outcome

const HX: i32 = 95;
const HB: i32 = 11;
const HY: [i32; 6] = [40, 68, 96, 124, 162, 190];
const CX: i32 = 188;
const CY: i32 = 82;
const CR: i32 = 12;
const GX: i32 = 278;
const GY: [i32; 4] = [78, 100, 122, 144];
const WB: (i32, i32, i32, i32) = (262, 30, 388, 202);
const OB: (i32, i32, i32, i32) = (402, 60, 474, 132);

const NAMES: [(&str, &str, &str); 6] = [
    ("P", "PHONE", "phone"),
    ("S", "SWISSQUOTE", "bank"),
    ("B", "BACKUP SVC", "server"),
    ("B", "HOME COPY", "home"),
    ("A", "PASSKEY", "finger"),
    ("R", "RECOVERY", "key"),
];
const GATES: [&str; 4] = ["MPC 2-OF-3", "PASSKEY A", "RECOVERY R", "DELAY 48H"];
const COUNT: [&str; 4] = ["0/3", "1/3", "2/3", "3/3"];

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum St {
    Ok,
    Off,
    Lost,
    Evil,
    Stolen,
    NoCopy,
    Hidden,
    New,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Who {
    User,
    Atk,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Act {
    Spend,
    Recover,
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum G {
    Idle,
    Na,
    Req,
    Check,
    Pass,
    Fail,
}

#[derive(Clone, Copy, Debug)]
pub struct Out {
    pub icon: &'static str,
    pub label: &'static str,
    pub good: Option<bool>,
}

pub struct Spec {
    pub title: &'static str,
    pub sub: &'static str,
    pub fail: &'static [(usize, St, &'static str)],
    pub home: Option<St>,
    /// Who acts, what they attempt, and the hour at which the user vetoes a pending recovery.
    pub runs: &'static [(Who, Act, Option<f32>)],
    pub out: Out,
    pub pass: bool,
    pub lead: Option<&'static str>,
    pub fix: &'static str,
}

#[derive(Debug)]
struct Track<T>(Vec<(f32, T)>);

impl<T> Default for Track<T> {
    fn default() -> Self {
        Track(Vec::new())
    }
}

impl<T> Track<T> {
    fn set(&mut self, t: f32, v: T) {
        self.0.push((t, v));
    }

    /// Latest value set at or before `t`, with the time it was set.
    fn at(&self, t: f32) -> Option<(f32, &T)> {
        let mut best: Option<(f32, &T)> = None;
        for (tt, v) in &self.0 {
            if *tt <= t && best.is_none_or(|(b, _)| *tt >= b) {
                best = Some((*tt, v));
            }
        }
        best
    }

    fn get(&self, t: f32) -> Option<&T> {
        self.at(t).map(|(_, v)| v)
    }
}

#[derive(Debug)]
struct Pulse {
    t0: f32,
    t1: f32,
    edge: usize,
    col: Rgb,
    rev: bool,
    stop: f32,
}

#[derive(Debug, Clone, Copy)]
struct Timer {
    t0: f32,
    t1: f32,
    stop: Option<f32>,
    col: Rgb,
}

#[derive(Debug)]
struct Typed {
    t0: f32,
    x: i32,
    y: i32,
    lines: Vec<String>,
    lead: usize,
    lcol: Rgb,
    col: Rgb,
    cps: f32,
    until: Option<f32>,
}

fn bres(mut x0: i32, mut y0: i32, x1: i32, y1: i32) -> Vec<(i32, i32)> {
    let (dx, dy) = ((x1 - x0).abs(), -(y1 - y0).abs());
    let (sx, sy) = (if x0 < x1 { 1 } else { -1 }, if y0 < y1 { 1 } else { -1 });
    let mut err = dx + dy;
    let mut pts = vec![];
    loop {
        pts.push((x0, y0));
        if x0 == x1 && y0 == y1 {
            return pts;
        }
        let e2 = 2 * err;
        if e2 >= dy {
            err += dy;
            x0 += sx;
        }
        if e2 <= dx {
            err += dx;
            y0 += sy;
        }
    }
}

static EDGES: LazyLock<[Vec<(i32, i32)>; 8]> = LazyLock::new(|| {
    let to_comb = |h: usize| {
        let (sx, sy) = (HX + HB + 1, HY[h]);
        let (dx, dy) = ((CX - sx) as f32, (CY - sy) as f32);
        let k = (CR + 2) as f32 / (dx * dx + dy * dy).sqrt();
        bres(sx, sy, CX - (dx * k).round() as i32, CY - (dy * k).round() as i32)
    };
    [
        to_comb(P),
        to_comb(S),
        to_comb(B),
        to_comb(L),
        bres(HX + HB + 1, HY[A], GX - 7, GY[1]),
        bres(HX + HB + 1, HY[R], GX - 7, GY[2]),
        bres(CX + CR + 2, CY, GX - 7, GY[0]),
        bres(WB.2 + 1, 96, OB.0 - 1, 96),
    ]
});

static GRID_PATH: LazyLock<String> = LazyLock::new(|| {
    let mut d = String::new();
    for y in (26..200).step_by(12) {
        for x in (6..W).step_by(12) {
            d.push_str(&format!("M{x} {y}h1v1h-1z"));
        }
    }
    d
});

pub fn outcome_col(good: Option<bool>) -> Rgb {
    match good {
        Some(true) => CYAN,
        Some(false) => MAG,
        None => WHITE,
    }
}

pub fn shake_at(shakes: &[(f32, f32, f32)], t: f32) -> (i32, i32) {
    for &(t0, d, amp) in shakes {
        if t >= t0 && t < t0 + d {
            let a = amp * (1. - (t - t0) / d);
            let f = (t * 60.) as i32;
            let j = |s| ((hash(f, s, 3) * 2. - 1.) * a).round() as i32;
            return (j(1), j(2));
        }
    }
    (0, 0)
}

/// Pixel-block dissolve to black over the last `DISS` seconds of a scene.
pub fn fade_out(svg: &mut Svg, t: f32, dur: f32) {
    let p = (t - (dur - DISS)) / DISS;
    if p > 0. {
        svg.path(&Svg::blocks_path(6, |n| n < p), BLACK);
    }
}

pub fn cue(t: f32, name: &'static str, x: i32) -> Cue {
    Cue { t, name, pan: (x as f32 / W as f32 * 2. - 1.) * 0.55 }
}

#[derive(Debug)]
pub struct Board {
    pub name: &'static str,
    num: Option<usize>,
    title: &'static str,
    sub: &'static str,
    card_end: f32,
    pub dur: f32,
    pub cues: Vec<Cue>,
    state: [(St, &'static str); 6],
    hst: [Track<(St, &'static str)>; 6],
    vis: [f32; 9],
    act: [Track<Option<&'static str>>; 6],
    hl: [Track<bool>; 9],
    ghl: [Track<bool>; 4],
    lit: [Track<Option<(f32, f32, Rgb)>>; 8],
    pulses: Vec<Pulse>,
    comb: Track<(&'static str, Rgb)>,
    gates: [Track<(G, &'static str, Rgb)>; 4],
    rule: Track<&'static str>,
    cred: Track<&'static str>,
    frozen: Track<bool>,
    req: Track<Option<(&'static str, Rgb)>>,
    timer: Track<Option<Timer>>,
    out: Track<Option<Out>>,
    who: Track<Option<Who>>,
    wflash: Track<Rgb>,
    badge: Track<&'static str>,
    failing: Track<Vec<String>>,
    typed: Vec<Typed>,
    shakes: Vec<(f32, f32, f32)>,
}

impl Board {
    fn new(name: &'static str, num: Option<usize>, title: &'static str, sub: &'static str) -> Board {
        assert_glyphs(title);
        assert_glyphs(sub);
        let mut b = Board {
            name,
            num,
            title,
            sub,
            card_end: 0.,
            dur: 0.,
            cues: vec![],
            state: [(St::Ok, ""); 6],
            hst: Default::default(),
            vis: [f32::INFINITY; 9],
            act: Default::default(),
            hl: Default::default(),
            ghl: Default::default(),
            lit: Default::default(),
            pulses: vec![],
            comb: Track::default(),
            gates: Default::default(),
            rule: Track::default(),
            cred: Track::default(),
            frozen: Track::default(),
            req: Track::default(),
            timer: Track::default(),
            out: Track::default(),
            who: Track::default(),
            wflash: Track::default(),
            badge: Track::default(),
            failing: Track::default(),
            typed: vec![],
            shakes: vec![],
        };
        for h in 0..6 {
            if h == L {
                b.seth(h, -1., St::Hidden, "");
            } else {
                b.seth(h, -1., St::Ok, "READY");
            }
        }
        for g in &mut b.gates {
            g.set(-1., (G::Idle, "", NODE));
        }
        b.comb.set(-1., ("--", NODE));
        b.rule.set(-1., "IDLE");
        b.cred.set(-1., "V1");
        if num.is_some() {
            b.cues.push(cue(0., "title", 240));
            for i in (0..title.len()).step_by(2) {
                b.cues.push(cue(0.2 + i as f32 / 60., "type", 120 + i as i32 * 8));
            }
            let sub_at = 0.3 + title.len() as f32 / 60.;
            b.card_end = sub_at + sub.len() as f32 / 110. + 0.8 + DISS;
            b.cues.push(cue(b.card_end - DISS, "whoosh", 240));
        }
        b
    }

    fn seth(&mut self, h: usize, t: f32, st: St, tag: &'static str) {
        self.state[h] = (st, tag);
        self.hst[h].set(t, (st, tag));
    }

    fn cue(&mut self, t: f32, name: &'static str, x: i32) {
        self.cues.push(cue(t, name, x));
    }

    fn pulse(&mut self, t0: f32, t1: f32, edge: usize, col: Rgb) {
        self.pulses.push(Pulse { t0, t1, edge, col, rev: false, stop: 1. });
        self.lit[edge].set(t0, Some((t0, t1, mix(col, EDGE, 0.5))));
    }

    fn shake(&mut self, t: f32, dur: f32, amp: f32) {
        self.shakes.push((t, dur, amp));
    }

    /// Types `lead` + `body` into the info panel; returns when the last character lands.
    fn type_block(&mut self, t0: f32, y: i32, lead: &str, body: &str, lcol: Rgb, hold: Option<f32>) -> f32 {
        let full = format!("{lead}{body}");
        assert!(full.is_ascii());
        assert_glyphs(&full);
        let lines = wrap(&full, 76);
        let cps = 80.;
        let mut i = 0;
        for line in &lines {
            for (ci, ch) in line.chars().enumerate() {
                if ch != ' ' && i % 3 == 0 {
                    self.cue(t0 + i as f32 / cps, "type", 10 + ci as i32 * 6);
                }
                i += 1;
            }
        }
        let end = t0 + i as f32 / cps;
        let until = hold.map(|h| end + h);
        self.typed.push(Typed { t0, x: 10, y, lines, lead: lead.len(), lcol, col: ICE, cps, until });
        end
    }

    fn t0(&self) -> f32 {
        if self.num.is_some() { self.card_end - DISS + 0.1 } else { 0.3 }
    }

    fn build(&mut self, t: f32) -> f32 {
        for (i, v) in [P, S, B, L, A, R, COMB, WALLET, OUT].into_iter().enumerate() {
            let tv = t + i as f32 * 0.05;
            self.vis[v] = tv;
            if v >= 6 || self.state[v].0 != St::Hidden {
                self.cue(tv, POP[i], 120);
            }
        }
        t + 9. * 0.05 + 0.15
    }

    fn fail_phase(&mut self, t: f32, fail: &[(usize, St, &'static str)]) -> f32 {
        self.failing.set(t, vec![]);
        if fail.is_empty() {
            self.cue(t, "select", 64);
            return t + 0.4;
        }
        let mut chips = vec![];
        for (i, &(h, st, tag)) in fail.iter().enumerate() {
            let tf = t + i as f32 * 0.4;
            self.seth(h, tf, st, tag);
            let snd = if matches!(st, St::Evil | St::Stolen) { "evil" } else { "glitch" };
            self.cue(tf, snd, HX);
            chips.push(format!("{} {}", NAMES[h].0, tag));
            self.failing.set(tf, chips.clone());
            self.shake(tf, 0.15, 1.);
        }
        t + fail.len() as f32 * 0.4 + 0.3
    }

    /// One attempt by the user or the attacker. `fin` replaces the default outcome on the
    /// scenario's last attempt.
    fn run(&mut self, mut t: f32, who: Who, act: Act, cancel_at: Option<f32>, fin: Option<Out>) -> f32 {
        let atk = who == Who::Atk;
        let col = if atk { MAG } else { CYAN };
        let spend = act == Act::Spend;
        for h in 0..6 {
            self.act[h].set(t, None);
        }
        for e in 0..8 {
            self.lit[e].set(t, None);
        }
        self.out.set(t, None);
        self.who.set(t, Some(who));
        self.comb.set(t, ("0/3", NODE));
        self.rule.set(t, if spend { "SPEND = MPC + A" } else { "RECOVER = MPC+R+48H" });
        let need = if spend { [true, true, false, false] } else { [true, false, true, true] };
        for (g, need) in self.gates.iter_mut().zip(need) {
            g.set(t, if need { (G::Req, "", col) } else { (G::Na, "--", col) });
        }
        self.cue(t, "select", 430);
        t += 0.4;

        // Shares answer the signing request; unavailable ones never do.
        let usable = |st: St| if atk { st == St::Evil } else { matches!(st, St::Ok | St::New) };
        let signers: Vec<usize> = (0..4).filter(|&h| usable(self.state[h].0)).take(2).collect();
        let dead: Vec<usize> = if atk {
            vec![]
        } else {
            (0..4).filter(|&h| matches!(self.state[h].0, St::Off | St::Lost)).collect()
        };
        for (i, &h) in signers.iter().enumerate() {
            let t0 = t + i as f32 * 0.15;
            self.act[h].set(t0, Some("SIGNING"));
            self.pulse(t0, t0 + 0.55, h, col);
            self.cue(t0, "pulse", HX);
            self.comb.set(t0 + 0.55, (COUNT[i + 1], col));
            self.cue(t0 + 0.55, BLIP[i], CX);
        }
        for (i, &h) in dead.iter().enumerate() {
            let t0 = t + 0.1 + i as f32 * 0.12;
            self.pulses.push(Pulse { t0, t1: t0 + 0.45, edge: h, col: MAG, rev: true, stop: 0.8 });
            self.cue(t0 + 0.38, "deny", HX);
        }
        t += 0.55 + 0.15 * signers.len().max(1) as f32 + 0.15;

        let mpc_ok = signers.len() >= 2;
        if mpc_ok {
            self.pulse(t, t + 0.35, EM, col);
            self.gates[0].set(t + 0.35, (G::Pass, "✓", col));
            self.cue(t + 0.35, "pass", GX);
        } else {
            self.comb.set(t, (COUNT[signers.len()], MAG));
            self.gates[0].set(t, (G::Fail, COUNT[signers.len()], MAG));
            self.cue(t, "fail", CX);
            self.shake(t, 0.2, 1.);
        }
        t += 0.5;

        let (cred, gi) = if spend { (A, 1) } else { (R, 2) };
        let cst = self.state[cred].0;
        let cred_ok = if atk { cst == St::Stolen } else { matches!(cst, St::Ok | St::New | St::Stolen) };
        if cred_ok {
            self.act[cred].set(t, Some(if spend { "APPROVED" } else { "SIGNED" }));
            self.pulse(t, t + 0.45, cred, col);
            self.cue(t, "pulse", HX);
            self.gates[gi].set(t + 0.45, (G::Pass, "✓", col));
            self.cue(t + 0.45, "pass", GX);
        } else {
            self.gates[gi].set(t, (G::Check, "...", col));
            self.gates[gi].set(t + 0.35, (G::Fail, "✗", MAG));
            self.cue(t + 0.35, "fail", GX);
        }
        t += 0.7;

        if !(mpc_ok && cred_ok) {
            let rejected = if atk {
                Out { icon: "shield", label: "REJECTED", good: Some(true) }
            } else {
                Out { icon: "cross", label: "REJECTED", good: Some(false) }
            };
            self.stamp(t, fin.unwrap_or(rejected));
            return t + 0.8;
        }
        if spend {
            self.stamp(t, fin.unwrap_or(Out { icon: "check", label: "TX EXECUTED", good: Some(!atk) }));
            return t + 0.8;
        }

        // Recovery: the request is stored on-chain, spending freezes, the 48h delay starts.
        const T: f32 = 2.6;
        self.gates[3].set(t, (G::Check, "...", col));
        self.frozen.set(t, true);
        self.req.set(t, Some(("REQUEST PENDING", col)));
        self.wflash.set(t, col);
        self.cue(t, "register", GX);
        self.out.set(t, Some(Out { icon: "hourglass", label: "PENDING", good: None }));
        self.timer.set(t, Some(Timer { t0: t, t1: t + T, stop: cancel_at, col }));
        let stop_h = cancel_at.unwrap_or(48.);
        for k in 1..=(stop_h / 4.) as usize {
            self.cue(t + T * (k * 4) as f32 / 48., if k % 2 == 0 { "tick0" } else { "tick1" }, GX);
        }
        if let Some(ch) = cancel_at {
            let tc = t + T * ch / 48.;
            self.act[A].set(tc - 0.45, Some("VETO"));
            self.pulse(tc - 0.45, tc, A, CYAN);
            self.cue(tc - 0.45, "pulse", HX);
            self.gates[1].set(tc, (G::Pass, "VETO", CYAN));
            self.gates[3].set(tc, (G::Fail, "✗", MAG));
            self.cue(tc, "cancel", GX);
            self.req.set(tc, Some(("REQUEST CANCELLED", CYAN)));
            self.frozen.set(tc + 0.3, false);
            self.stamp(tc + 0.5, fin.unwrap_or(Out { icon: "shield", label: "CANCELLED", good: Some(true) }));
            return tc + 1.3;
        }
        let te = t + T;
        self.gates[3].set(te, (G::Pass, "✓", col));
        self.cue(te, "pass", GX);
        for h in 0..6 {
            self.act[h].set(te, None);
        }
        self.req.set(te + 0.3, Some(("FINALIZED", CYAN)));
        self.cred.set(te + 0.3, "V2");
        self.frozen.set(te + 0.3, false);
        self.cue(te + 0.3, "new", HX);
        for (i, h) in [P, S, B, A].into_iter().enumerate() {
            let tn = te + 0.35 + i as f32 * 0.12;
            self.seth(h, tn, St::New, "NEW");
            self.cue(tn, POP[5 + i * 2], HX);
        }
        self.stamp(te + 0.95, fin.unwrap_or(Out { icon: "check", label: "RECOVERED", good: Some(!atk) }));
        te + 1.7
    }

    fn stamp(&mut self, t: f32, o: Out) {
        let col = outcome_col(o.good);
        self.pulses.push(Pulse { t0: t - 0.2, t1: t, edge: EO, col, rev: false, stop: 1. });
        self.out.set(t, Some(o));
        self.wflash.set(t, col);
        let bad = o.good == Some(false);
        self.cue(t, if bad { "bad" } else { "good" }, 438);
        if bad {
            self.shake(t, 0.3, 2.);
        }
    }

    pub fn scenario(num: usize, sp: &Spec) -> Board {
        let name = Box::leak(format!("S{num:02}").into_boxed_str());
        let mut b = Board::new(name, Some(num), sp.title, sp.sub);
        if let Some(st) = sp.home {
            b.seth(L, -1., st, if st == St::Ok { "READY" } else { "NO COPY" });
        }
        let mut t = b.build(b.t0());
        t = b.fail_phase(t, sp.fail);
        for (i, &(who, act, cancel_at)) in sp.runs.iter().enumerate() {
            let last = i + 1 == sp.runs.len();
            t = b.run(t, who, act, cancel_at, last.then_some(sp.out));
        }
        b.badge.set(t, if sp.pass { "PASS" } else { "LIMIT" });
        b.cue(t, "select", 460);
        let lead = sp.lead.unwrap_or(if sp.pass { "RESOLVED BY: " } else { "KNOWN LIMIT: " });
        let end = b.type_block(t + 0.2, 223, lead, sp.fix, if sp.pass { CYAN } else { MAG }, None);
        b.dur = end + 1.2 + sp.fix.len() as f32 / 32. + DISS;
        b
    }

    /// "How it works": the board with every part introduced in turn.
    pub fn legend() -> Board {
        let mut b = Board::new("HOW", None, "HOW IT WORKS", "");
        let hold = Some(2.6);
        let mut t = b.build(b.t0()) + 0.2;

        let group = [P, S, B, COMB];
        for v in group {
            b.hl[v].set(t, true);
        }
        let end = b.type_block(
            t,
            212,
            "P S B: ",
            "THREE MPC SHARES: ON THE PHONE, AT SWISSQUOTE, AT A BACKUP SERVICE. ANY 2 OF 3 PRODUCE THE MPC SIGNATURE.",
            CYAN,
            hold,
        );
        for (i, h) in [P, S].into_iter().enumerate() {
            let t0 = t + 0.6 + i as f32 * 0.15;
            b.act[h].set(t0, Some("SIGNING"));
            b.pulse(t0, t0 + 0.55, h, CYAN);
            b.cue(t0, "pulse", HX);
            b.comb.set(t0 + 0.55, (COUNT[i + 1], CYAN));
            b.cue(t0 + 0.55, BLIP[i], CX);
        }
        t = end + 2.6;
        for v in group {
            b.hl[v].set(t, false);
        }
        t += 0.15;

        b.hl[A].set(t, true);
        b.ghl[0].set(t, true);
        b.ghl[1].set(t, true);
        b.rule.set(t, "SPEND = MPC + A");
        b.who.set(t, Some(Who::User));
        for (i, g) in b.gates.iter_mut().enumerate() {
            g.set(t, if i < 2 { (G::Req, "", CYAN) } else { (G::Na, "--", CYAN) });
        }
        let end = b.type_block(
            t,
            212,
            "A: ",
            "THE USER'S PASSKEY. EVERY ORDINARY SPEND NEEDS MPC + A, BOTH BOUND TO THE EXACT OPERATION.",
            CYAN,
            hold,
        );
        b.pulse(t + 0.5, t + 0.85, EM, CYAN);
        b.gates[0].set(t + 0.85, (G::Pass, "✓", CYAN));
        b.cue(t + 0.85, "pass", GX);
        b.act[A].set(t + 0.8, Some("APPROVED"));
        b.pulse(t + 0.8, t + 1.25, A, CYAN);
        b.cue(t + 0.8, "pulse", HX);
        b.gates[1].set(t + 1.25, (G::Pass, "✓", CYAN));
        b.cue(t + 1.25, "pass", GX);
        b.stamp(t + 1.9, Out { icon: "check", label: "TX EXECUTED", good: Some(true) });
        t = end + 2.6;
        b.hl[A].set(t, false);
        b.ghl[0].set(t, false);
        b.ghl[1].set(t, false);
        t += 0.15;

        b.hl[R].set(t, true);
        b.ghl[2].set(t, true);
        b.ghl[3].set(t, true);
        b.rule.set(t, "RECOVER = MPC+R+48H");
        b.out.set(t, None);
        for h in 0..6 {
            b.act[h].set(t, None);
        }
        b.lit[A].set(t, None);
        b.lit[EO].set(t, None);
        b.gates[1].set(t, (G::Na, "--", CYAN));
        b.gates[2].set(t, (G::Req, "", CYAN));
        b.gates[3].set(t, (G::Req, "", CYAN));
        let end = b.type_block(
            t,
            212,
            "R: ",
            "A SEPARATE RECOVERY KEY, KEPT OFF THE PHONE. RECOVERY NEEDS MPC + R, THEN A CANCELLABLE 48H ON-CHAIN DELAY.",
            CYAN,
            hold,
        );
        b.act[R].set(t + 0.6, Some("SIGNED"));
        b.pulse(t + 0.6, t + 1.05, R, CYAN);
        b.cue(t + 0.6, "pulse", HX);
        b.gates[2].set(t + 1.05, (G::Pass, "✓", CYAN));
        b.cue(t + 1.05, "pass", GX);
        b.gates[3].set(t + 1.4, (G::Check, "48H", CYAN));
        b.cue(t + 1.4, "register", GX);
        t = end + 2.6;
        b.hl[R].set(t, false);
        b.ghl[2].set(t, false);
        b.ghl[3].set(t, false);
        t += 0.15;

        b.hl[WALLET].set(t, true);
        b.who.set(t, None);
        b.rule.set(t, "IDLE");
        b.comb.set(t, ("--", NODE));
        for h in 0..6 {
            b.act[h].set(t, None);
        }
        for e in 0..8 {
            b.lit[e].set(t, None);
        }
        for g in &mut b.gates {
            g.set(t, (G::Idle, "", NODE));
        }
        let end = b.type_block(
            t,
            212,
            "W: ",
            "AN ERC-4337 SMART WALLET HOLDS THE FUNDS AND ENFORCES BOTH RULES. NO PROVIDER OVERRIDE: NO ADMIN, UPGRADE OR MODULE BYPASS.",
            CYAN,
            hold,
        );
        t = end + 2.6;
        b.hl[WALLET].set(t, false);
        t += 0.15;

        let end = b.type_block(
            t,
            212,
            ">> ",
            "11 SCENARIOS. WATCH WHICH PIECES FAIL, AND WHAT RESOLVES EACH ONE.",
            WHITE,
            None,
        );
        b.cue(end, "start", 240);
        b.dur = end + 1.6 + DISS;
        b
    }

    pub fn draw(&self, t: f32, svg: &mut Svg) {
        let (dx, dy) = shake_at(&self.shakes, t);
        svg.raw(&format!(r#"<g transform="translate({dx} {dy})">"#));
        if self.num.is_some() && t < self.card_end {
            let p = (t - (self.card_end - DISS)) / DISS;
            if p <= 0. {
                self.draw_card(t, svg);
            } else {
                self.draw_board(t, svg);
                let clip = Svg::blocks_path(6, |n| n >= p);
                svg.raw(&format!(r#"<clipPath id="card"><path d="{clip}"/></clipPath><g clip-path="url(#card)">"#));
                svg.rect(0, 0, W, H, BLACK);
                self.draw_card(t, svg);
                svg.raw("</g>");
            }
        } else {
            self.draw_board(t, svg);
            fade_out(svg, t, self.dur);
        }
        svg.raw("</g>");
    }

    fn draw_card(&self, t: f32, svg: &mut Svg) {
        for (x, y, w, h) in [
            (40, 58, 10, 1),
            (40, 58, 1, 10),
            (430, 58, 10, 1),
            (439, 58, 1, 10),
            (40, 165, 10, 1),
            (40, 156, 1, 10),
            (430, 165, 10, 1),
            (439, 156, 1, 10),
        ] {
            svg.rect(x, y, w, h, NODE);
        }
        svg.ctext(240, 72, &format!("SCENARIO {:02}", self.num.unwrap_or(0)), BLUE, 2);
        let n = (((t - 0.2) * 60.).max(0.) as usize).min(self.title.len());
        svg.text(240 - tw(self.title, 2) / 2, 98, &self.title[..n], WHITE, 2);
        let sub_at = 0.3 + self.title.len() as f32 / 60.;
        let m = (((t - sub_at) * 110.).max(0.) as usize).min(self.sub.len());
        svg.text(240 - tw(self.sub, 1) / 2, 134, &self.sub[..m], TEXT, 1);
    }

    fn draw_board(&self, t: f32, svg: &mut Svg) {
        svg.path(&GRID_PATH, GRID);
        self.draw_header(t, svg);
        for e in 0..8 {
            self.draw_edge(e, t, svg);
        }
        for p in &self.pulses {
            draw_pulse(p, t, svg);
        }
        self.draw_comb(t, svg);
        self.draw_wallet(t, svg);
        self.draw_out(t, svg);
        for h in 0..6 {
            self.draw_holder(h, t, svg);
        }
        self.draw_panel(t, svg);
    }

    fn draw_header(&self, t: f32, svg: &mut Svg) {
        match self.num {
            Some(n) => {
                svg.text(8, 6, &format!("{n:02}/{:02}", SPECS.len()), BLUE, 1);
                svg.text(44, 6, self.title, WHITE, 1);
            }
            None => svg.text(8, 6, self.title, WHITE, 1),
        }
        if let Some((ts, &b)) = self.badge.at(t) {
            let col = if b == "PASS" { CYAN } else { MAG };
            let w = tw(b, 1);
            if t - ts < 0.1 {
                svg.rect(466 - w, 3, w + 8, 13, col);
                svg.rtext(470, 6, b, BLACK, 1);
            } else {
                svg.border(466 - w, 3, 473, 15, col);
                svg.rtext(470, 6, b, col, 1);
            }
        }
        svg.rect(4, 19, 472, 1, EDGE);
    }

    fn holder_state(&self, h: usize, t: f32) -> (f32, St, &'static str) {
        self.hst[h].at(t).map_or((-1., St::Ok, ""), |(ts, &(st, tag))| (ts, st, tag))
    }

    fn draw_edge(&self, e: usize, t: f32, svg: &mut Svg) {
        let src = match e {
            0..=5 => e,
            EM => COMB,
            _ => OUT,
        };
        if t < self.vis[src] {
            return;
        }
        let st = if e < 6 { self.holder_state(e, t).1 } else { St::Ok };
        if st == St::Hidden {
            return;
        }
        let pts = &EDGES[e];
        let dotted = matches!(st, St::Off | St::Lost | St::NoCopy);
        let base = if matches!(st, St::Off | St::Lost) { MAG_DIM } else { EDGE };
        svg.pixels(pts.iter().enumerate().filter(|(i, _)| !dotted || i % 3 == 0).map(|(_, &p)| p), base);
        if let Some(&Some((t0, t1, c))) = self.lit[e].get(t) {
            let n = (((t - t0) / (t1 - t0)).clamp(0., 1.) * pts.len() as f32) as usize;
            svg.pixels(pts[..n].iter().copied(), c);
        }
    }

    fn draw_comb(&self, t: f32, svg: &mut Svg) {
        if t < self.vis[COMB] {
            return;
        }
        let &(txt, col) = self.comb.get(t).unwrap_or(&("--", NODE));
        let hl = self.hl[COMB].get(t).copied().unwrap_or(false) && blink(t, 6.);
        let ring = if hl || t - self.vis[COMB] < 0.08 { WHITE } else { col };
        svg.ring(CX, CY, CR, 2, ring, FILL);
        svg.ctext(CX + 1, CY - 3, txt, if col == NODE { DIM } else { WHITE }, 1);
        svg.ctext(CX + 1, CY - CR - 11, "MPC", DIM, 1);
    }

    fn draw_wallet(&self, t: f32, svg: &mut Svg) {
        if t < self.vis[WALLET] {
            return;
        }
        let (x0, y0, x1, y1) = WB;
        let mut oc = NODE;
        if let Some((ts, &c)) = self.wflash.at(t)
            && t - ts < 0.3
            && blink(t - ts, 20.)
        {
            oc = c;
        }
        if self.hl[WALLET].get(t).copied().unwrap_or(false) && blink(t, 6.) || t - self.vis[WALLET] < 0.08 {
            oc = WHITE;
        }
        svg.border(x0, y0, x1, y1, oc);
        svg.sprite("vault", x0 + 12, y0 + 11, BLUE, 1);
        svg.text(x0 + 24, y0 + 5, "W SMART WALLET", WHITE, 1);
        svg.text(x0 + 24, y0 + 14, "ERC-4337", DIM, 1);
        svg.text(x0 + 6, y0 + 27, self.rule.get(t).copied().unwrap_or("IDLE"), TEXT, 1);
        svg.rect(x0 + 4, y0 + 37, x1 - x0 - 7, 1, EDGE);
        for i in 0..4 {
            self.draw_gate(i, t, svg);
        }
        svg.rect(x0 + 4, 158, x1 - x0 - 7, 1, EDGE);
        svg.text(x0 + 6, 164, "CRED", DIM, 1);
        svg.text(x0 + 36, 164, self.cred.get(t).copied().unwrap_or("V1"), WHITE, 1);
        let frozen = self.frozen.get(t).copied().unwrap_or(false);
        if frozen {
            svg.rtext(x1 - 5, 164, "SPEND FROZEN", MAG, 1);
        } else {
            svg.rtext(x1 - 5, 164, "SPEND OPEN", DIM, 1);
        }
        match self.req.get(t) {
            Some(&Some((s, c))) => svg.text(x0 + 6, 176, s, c, 1),
            _ => svg.text(x0 + 6, 176, "NO PENDING REQUEST", FAINT, 1),
        }
        if let Some(&Some(tm)) = self.timer.get(t) {
            let mut hrs = ((t - tm.t0) / (tm.t1 - tm.t0)).clamp(0., 1.) * 48.;
            if let Some(stop) = tm.stop {
                hrs = hrs.min(stop);
            }
            let (bx0, bx1) = (x0 + 6, x1 - 30);
            svg.border(bx0, 188, bx1, 194, EDGE);
            let fw = ((bx1 - bx0 - 1) as f32 * hrs / 48.) as i32;
            let stopped = tm.stop.is_some_and(|s| hrs >= s);
            svg.rect(bx0 + 1, 189, fw, 5, if stopped { DIM } else { tm.col });
            svg.rtext(x1 - 5, 188, &format!("{:02}H", hrs as i32), if stopped { CYAN } else { WHITE }, 1);
        }
    }

    fn draw_gate(&self, i: usize, t: f32, svg: &mut Svg) {
        let gy = GY[i];
        let (ts, &(g, mark, col)) = self.gates[i].at(t).unwrap_or((-1., &(G::Idle, "", NODE)));
        let (mut oc, mut fc, lc, mc) = match g {
            G::Na => (EDGE, FILL, FAINT, FAINT),
            G::Idle => (NODE, FILL, DIM, DIM),
            G::Req => (NODE, FILL, TEXT, DIM),
            G::Check => (if blink(t, 12.) { WHITE } else { NODE }, FILL, WHITE, WHITE),
            G::Pass => (col, col, ICE, col),
            G::Fail => (MAG, MAG_DIM, MAG, MAG),
        };
        if matches!(g, G::Pass | G::Fail) && t - ts < 0.08 {
            fc = WHITE;
        }
        if self.ghl[i].get(t).copied().unwrap_or(false) && blink(t, 6.) {
            oc = WHITE;
        }
        svg.ring(GX, gy, 5, 1, oc, fc);
        svg.text(GX + 10, gy - 3, GATES[i], lc, 1);
        svg.rtext(WB.2 - 5, gy - 3, mark, mc, 1);
    }

    fn draw_out(&self, t: f32, svg: &mut Svg) {
        if t < self.vis[OUT] {
            return;
        }
        if let Some(&Some(w)) = self.who.get(t) {
            let (spr, lab, c) = match w {
                Who::User => ("user", "USER", CYAN),
                Who::Atk => ("skull", "ATTACKER", MAG),
            };
            svg.sprite(spr, 410, 44, c, 1);
            svg.text(420, 41, lab, c, 1);
        }
        let (x0, y0, x1, y1) = OB;
        let (mx, my) = ((x0 + x1) / 2 + 1, (y0 + y1) / 2);
        match self.out.at(t) {
            Some((ts, Some(o))) => {
                let col = outcome_col(o.good);
                let age = t - ts;
                svg.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, if age < 0.06 { col } else { FILL });
                svg.border(x0, y0, x1, y1, col);
                svg.sprite(o.icon, mx, my, col, if age < 0.08 { 4 } else { 3 });
                for (i, ln) in wrap(o.label, 12).iter().enumerate() {
                    svg.ctext(mx, y1 + 7 + i as i32 * 10, ln, col, 1);
                }
            }
            _ => {
                svg.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, FILL);
                svg.border(x0, y0, x1, y1, if t - self.vis[OUT] < 0.08 { WHITE } else { NODE });
                svg.ctext(mx, my - 3, "?", FAINT, 1);
            }
        }
        svg.pixels([(x0, y0), (x1, y0), (x0, y1), (x1, y1)], BLACK);
    }

    fn draw_holder(&self, h: usize, t: f32, svg: &mut Svg) {
        let vt = self.vis[h];
        if t < vt {
            return;
        }
        let (ts, st, tag) = self.holder_state(h, t);
        if st == St::Hidden {
            return;
        }
        let (letter, name, icon) = NAMES[h];
        let cy = HY[h];
        let mut cx = HX;
        let age = t - ts;
        let bad = matches!(st, St::Off | St::Lost | St::Evil | St::Stolen);
        if bad && ts >= 0. && age < 0.4 {
            let f = (t * 60.) as i32;
            let r = |k: i32| hash(f, h as i32, k);
            cx += [-3, -2, -1, 1, 2, 3][(r(1) * 6.) as usize % 6];
            for k in 0..3 {
                let gx = HX - 22 + (r(10 + k) * 30.) as i32;
                let gy = cy - 12 + (r(20 + k) * 24.) as i32;
                svg.rect(gx, gy, 4 + (r(30 + k) * 12.) as i32, 1, MAG);
            }
        }
        let act = self.act[h].get(t).copied().flatten();
        let atk = matches!(st, St::Evil | St::Stolen);
        let (mut oc, mut ic, mut tc, mut fc, mut dashed, mut show) = (NODE, BLUE, DIM, FILL, false, true);
        match st {
            St::Off => (oc, ic, tc, dashed) = (MAG_DIM, MAG_DIM, MAG, true),
            St::Lost => (oc, tc, show) = (MAG, MAG, false),
            St::Evil => (oc, ic, tc, fc) = (MAG, MAG, MAG, EVIL),
            St::Stolen => (oc, ic, tc) = (MAG, MAG, MAG),
            St::NoCopy => (oc, tc, dashed, show) = (EDGE, DIM, true, false),
            St::New => (oc, ic, tc) = (CYAN, CYAN, CYAN),
            St::Ok | St::Hidden => {}
        }
        let mut tag = tag;
        if let Some(a) = act {
            oc = if atk { MAG } else { CYAN };
            ic = if atk { PINK } else { ICE };
            tc = oc;
            tag = a;
        }
        if self.hl[h].get(t).copied().unwrap_or(false) && blink(t, 6.) || t - vt < 0.08 {
            oc = WHITE;
        }
        if ts >= 0. && age < 0.08 {
            fc = WHITE;
        }
        let (x0, y0, x1, y1) = (cx - HB, cy - HB, cx + HB, cy + HB);
        svg.rect(x0, y0, 2 * HB + 1, 2 * HB + 1, fc);
        if dashed {
            let mut pts = vec![];
            for x in (x0..=x1).step_by(2) {
                pts.extend([(x, y0), (x, y1)]);
            }
            for y in (y0..=y1).step_by(2) {
                pts.extend([(x0, y), (x1, y)]);
            }
            svg.pixels(pts, oc);
        } else {
            svg.border(x0, y0, x1, y1, oc);
        }
        svg.pixels([(x0, y0), (x1, y0), (x0, y1), (x1, y1)], BLACK);
        if show {
            svg.sprite(icon, cx, cy, ic, 1);
        } else if st == St::Lost {
            svg.sprite("cross", cx, cy, MAG, 1);
        }
        if atk {
            svg.rect(x1 - 4, y0 - 4, 9, 9, BLACK);
            svg.sprite("skull_s", x1, y0, MAG, 1);
        }
        let letter = if st == St::New { format!("{letter}'") } else { letter.to_string() };
        svg.text(8, cy - 8, &letter, WHITE, 1);
        svg.text(8 + 6 * (letter.len() as i32 + 1), cy - 8, name, TEXT, 1);
        svg.text(8, cy + 2, tag, tc, 1);
    }

    fn draw_panel(&self, t: f32, svg: &mut Svg) {
        svg.border(4, 204, 475, 267, EDGE);
        if let Some(f) = self.failing.get(t) {
            svg.text(10, 210, "FAILING:", DIM, 1);
            if f.is_empty() {
                svg.text(64, 210, "NOTHING", CYAN, 1);
            }
            let mut x = 64;
            for c in f {
                svg.text(x, 210, c, MAG, 1);
                x += tw(c, 1) + 14;
            }
        }
        for ty in &self.typed {
            if t < ty.t0 || ty.until.is_some_and(|u| t >= u) {
                continue;
            }
            let n = ((t - ty.t0) * ty.cps) as usize;
            let mut i = 0;
            for (li, line) in ty.lines.iter().enumerate() {
                let y = ty.y + li as i32 * 11;
                let take = n.saturating_sub(i).min(line.len());
                let lead = ty.lead.saturating_sub(i).min(take);
                svg.text(ty.x, y, &line[..lead], ty.lcol, 1);
                svg.text(ty.x + 6 * lead as i32, y, &line[lead..take], ty.col, 1);
                i += line.len();
                if take < line.len() {
                    if blink(t, 8.) {
                        svg.rect(ty.x + 6 * take as i32, y, 5, 7, ICE);
                    }
                    break;
                }
            }
        }
    }
}

fn draw_pulse(p: &Pulse, t: f32, svg: &mut Svg) {
    let pts = &EDGES[p.edge];
    let n = pts.len() as i32;
    let k = (t - p.t0) / (p.t1 - p.t0);
    if k < 0. || k > 1. + 18. / n as f32 {
        return;
    }
    let head = (k * (n - 1) as f32) as i32;
    let lim = (p.stop * (n - 1) as f32) as i32;
    for j in 0..16 {
        let i = head - j;
        if i < 0 {
            break;
        }
        if i > lim || i >= n || (j > 4 && j % 2 == 1) {
            continue;
        }
        let (x, y) = pts[if p.rev { n - 1 - i } else { i } as usize];
        let c = match j {
            0 => WHITE,
            1 | 2 => mix(ICE, p.col, 0.4),
            _ => mix(p.col, EDGE, j as f32 / 16.),
        };
        if j == 0 {
            svg.pixels([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], p.col);
        }
        svg.rect(x, y, 1, 1, c);
    }
}
