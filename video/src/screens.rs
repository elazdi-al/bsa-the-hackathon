//! Title screen and final results table.

use crate::board::{cue, fade_out};
use crate::px::*;
use crate::sfx::POP;
use crate::{Cue, DISS, SPECS};

const L1: &str = "MPC WALLET";
const L2: &str = "STRESS TEST";
const SUB: &str = "2-OF-3 MPC  +  PASSKEY  +  RECOVERY KEY  +  ERC-4337 WALLET";
const ICONS: [(&str, &str); 6] =
    [("phone", "P"), ("bank", "S"), ("server", "B"), ("finger", "A"), ("key", "R"), ("vault", "W")];
const SUB_AT: f32 = 1.2;
const ICONS_AT: f32 = 2.0;
const START_AT: f32 = 3.6;

fn letter_at(i: usize) -> f32 {
    0.15 + i as f32 * 0.045
}

#[derive(Debug)]
pub struct Intro {
    pub name: &'static str,
    pub dur: f32,
    pub cues: Vec<Cue>,
}

impl Intro {
    pub fn new() -> Intro {
        let mut cues = vec![cue(0., "title", 240)];
        for (i, ch) in L1.chars().chain(L2.chars()).enumerate() {
            if ch != ' ' {
                cues.push(cue(letter_at(i), POP[i % 12], 240));
            }
        }
        for i in (0..SUB.len()).step_by(3) {
            cues.push(cue(SUB_AT + i as f32 / 90., "type", 60 + i as i32 * 6));
        }
        for i in 0..ICONS.len() {
            cues.push(cue(ICONS_AT + i as f32 * 0.1, POP[i * 2], 130 + i as i32 * 44));
        }
        cues.push(cue(START_AT, "start", 240));
        Intro { name: "INTRO", dur: START_AT + 0.9, cues }
    }

    pub fn draw(&self, t: f32, svg: &mut Svg) {
        for (s, c, y, base) in [(L1, WHITE, 56, 0), (L2, CYAN, 94, L1.len())] {
            let x0 = 240 - tw(s, 4) / 2;
            for (i, ch) in s.chars().enumerate() {
                let at = letter_at(base + i);
                if t >= at {
                    let fresh = t - at < 0.06;
                    let y = if fresh { y - 2 } else { y };
                    svg.text(x0 + i as i32 * 24, y, &ch.to_string(), if fresh { ICE } else { c }, 4);
                }
            }
        }
        let n = (((t - SUB_AT) * 90.).max(0.) as usize).min(SUB.len());
        svg.text(240 - tw(SUB, 1) / 2, 140, &SUB[..n], TEXT, 1);
        for (i, (spr, letter)) in ICONS.iter().enumerate() {
            if t >= ICONS_AT + i as f32 * 0.1 {
                let x = 130 + i as i32 * 44;
                svg.sprite(spr, x, 172, BLUE, 1);
                svg.ctext(x + 1, 184, letter, DIM, 1);
            }
        }
        if t >= ICONS_AT + 0.8 {
            let on = if t < START_AT { blink(t, 2.) } else { blink(t, 14.) };
            if on {
                svg.ctext(240, 218, "PRESS START", if t < START_AT { DIM } else { WHITE }, 1);
            }
        }
        fade_out(svg, t, self.dur);
    }
}

#[derive(Debug)]
pub struct Outro {
    pub name: &'static str,
    pub dur: f32,
    pub cues: Vec<Cue>,
    summary_at: f32,
    rules_at: f32,
    final_at: f32,
}

const FINAL: &str = "AN MPC QUORUM ALONE NEVER MOVES FUNDS.";

fn row_at(i: usize) -> f32 {
    0.5 + i as f32 * 0.18
}

impl Outro {
    pub fn new() -> Outro {
        let mut cues = vec![cue(0., "title", 240)];
        for i in 0..SPECS.len() {
            cues.push(cue(row_at(i), POP[i % 12], 240));
        }
        let summary_at = row_at(SPECS.len()) + 0.4;
        let rules_at = summary_at + 0.6;
        let final_at = rules_at + 0.8;
        cues.push(cue(summary_at, "select", 240));
        cues.push(cue(rules_at, "select", 240));
        for i in (0..FINAL.len()).step_by(2) {
            cues.push(cue(final_at + i as f32 / 40., "type", 13 + i as i32 * 12));
        }
        let typed = final_at + FINAL.len() as f32 / 40.;
        cues.push(cue(typed, "victory", 240));
        Outro { name: "RESULTS", dur: typed + 4. + DISS, cues, summary_at, rules_at, final_at }
    }

    pub fn draw(&self, t: f32, svg: &mut Svg) {
        svg.ctext(240, 10, "RESULTS", WHITE, 2);
        for (i, sp) in SPECS.iter().enumerate() {
            if t < row_at(i) {
                break;
            }
            let y = 34 + i as i32 * 13;
            let col = crate::board::outcome_col(sp.out.good);
            let fresh = t - row_at(i) < 0.08;
            svg.text(22, y, &format!("{:02}", i + 1), BLUE, 1);
            svg.text(40, y, sp.title, if fresh { WHITE } else { TEXT }, 1);
            let dots: Vec<_> = (40 + tw(sp.title, 1) + 6..294).step_by(4).map(|x| (x, y + 6)).collect();
            svg.pixels(dots, FAINT);
            svg.text(300, y, sp.out.label, col, 1);
            let badge = if sp.pass { "PASS" } else { "LIMIT" };
            svg.rtext(462, y, badge, if sp.pass { CYAN } else { MAG }, 1);
        }
        if t >= self.summary_at {
            let pass = SPECS.iter().filter(|s| s.pass).count();
            let a = format!("{pass} HANDLED");
            let b = format!("{} KNOWN LIMITS", SPECS.len() - pass);
            let x0 = 240 - tw(&format!("{a}  /  {b}"), 1) / 2;
            svg.text(x0, 186, &a, CYAN, 1);
            svg.text(x0 + 6 * a.len() as i32, 186, "  /  ", DIM, 1);
            svg.text(x0 + 6 * (a.len() as i32 + 5), 186, &b, MAG, 1);
        }
        if t >= self.rules_at {
            svg.ctext(240, 202, "SPEND = MPC + A        RECOVER = MPC + R + 48H", TEXT, 1);
        }
        let n = (((t - self.final_at) * 40.).max(0.) as usize).min(FINAL.len());
        svg.text(240 - tw(FINAL, 2) / 2, 226, &FINAL[..n], WHITE, 2);
        fade_out(svg, t, self.dur);
    }
}
