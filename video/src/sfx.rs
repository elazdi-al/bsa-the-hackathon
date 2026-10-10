//! Chiptune sound effects synthesized in memory: band-limited pulse waves (additive, so no
//! aliasing hiss), sample-and-hold noise, short envelopes. Scenes cue them by name.

use std::f32::consts::PI;

pub const SR: u32 = 48_000;

fn midi(n: f32) -> f32 {
    440. * 2f32.powf((n - 69.) / 12.)
}

fn env(i: usize, n: usize, decay: f32) -> f32 {
    let t = i as f32 / SR as f32;
    let left = (n - i) as f32 / SR as f32;
    (-decay * t).exp() * (t / 0.002).min(1.) * (left / 0.006).min(1.)
}

/// Pulse wave sweeping exponentially from `f0` to `f1`. `duty` 0.5 is a square.
fn pulse(f0: f32, f1: f32, dur: f32, duty: f32, vol: f32, decay: f32) -> Vec<f32> {
    let n = (dur * SR as f32) as usize;
    let mut ph = 0f32;
    (0..n)
        .map(|i| {
            let f = f0 * (f1 / f0).powf(i as f32 / n as f32);
            ph += 2. * PI * f / SR as f32;
            let mut y = 0.;
            let mut k = 1;
            while k as f32 * f < 14_000. && k < 48 {
                y += 4. / (PI * k as f32) * (PI * k as f32 * duty).sin() * (k as f32 * ph).cos();
                k += 1;
            }
            y * vol * env(i, n, decay)
        })
        .collect()
}

fn sine(f0: f32, f1: f32, dur: f32, vol: f32, decay: f32) -> Vec<f32> {
    let n = (dur * SR as f32) as usize;
    let mut ph = 0f32;
    (0..n)
        .map(|i| {
            ph += 2. * PI * f0 * (f1 / f0).powf(i as f32 / n as f32) / SR as f32;
            ph.sin() * vol * env(i, n, decay)
        })
        .collect()
}

/// NES-style noise: random values held for `SR / rate` samples.
fn noise(dur: f32, rate: f32, vol: f32, decay: f32, seed: u32) -> Vec<f32> {
    let n = (dur * SR as f32) as usize;
    let hold = (SR as f32 / rate).max(1.) as usize;
    let mut s = seed.wrapping_mul(2_654_435_761).max(1);
    let mut v = 0.;
    (0..n)
        .map(|i| {
            if i % hold == 0 {
                s ^= s << 13;
                s ^= s >> 17;
                s ^= s << 5;
                v = s as f32 / u32::MAX as f32 * 2. - 1.;
            }
            v * vol * env(i, n, decay)
        })
        .collect()
}

fn over(parts: Vec<(f32, Vec<f32>)>) -> Vec<f32> {
    let at = |o: f32| (o * SR as f32) as usize;
    let n = parts.iter().map(|(o, p)| at(*o) + p.len()).max().unwrap_or(0);
    let mut y = vec![0.; n];
    for (o, p) in parts {
        for (i, s) in p.into_iter().enumerate() {
            y[at(o) + i] += s;
        }
    }
    y
}

fn seq(notes: &[f32], step: f32, dur: f32, duty: f32, vol: f32, decay: f32) -> Vec<f32> {
    over(
        notes
            .iter()
            .enumerate()
            .map(|(i, &m)| (i as f32 * step, pulse(midi(m), midi(m), dur, duty, vol, decay)))
            .collect(),
    )
}

pub const POP: [&str; 12] = [
    "pop0", "pop1", "pop2", "pop3", "pop4", "pop5", "pop6", "pop7", "pop8", "pop9", "pop10", "pop11",
];
pub const BLIP: [&str; 3] = ["blip0", "blip1", "blip2"];

pub fn bank() -> Vec<(&'static str, Vec<f32>)> {
    let pentatonic = [0., 2., 4., 7., 9., 12., 14., 16., 19., 21., 24., 26.];
    let mut b: Vec<(&'static str, Vec<f32>)> = POP
        .iter()
        .zip(pentatonic)
        .map(|(&name, st)| (name, pulse(midi(72. + st), midi(72. + st), 0.05, 0.25, 0.09, 45.)))
        .collect();
    for (i, &name) in BLIP.iter().enumerate() {
        let m = midi(84. + 4. * i as f32);
        b.push((name, pulse(m, m, 0.07, 0.5, 0.11, 32.)));
    }
    b.extend([
        ("type", pulse(2300., 2300., 0.012, 0.5, 0.035, 250.)),
        ("pulse", pulse(500., 1400., 0.07, 0.25, 0.07, 20.)),
        ("deny", pulse(300., 140., 0.09, 0.125, 0.08, 15.)),
        ("tick0", pulse(1150., 1150., 0.02, 0.5, 0.05, 120.)),
        ("tick1", pulse(1500., 1500., 0.02, 0.5, 0.05, 120.)),
        ("pass", seq(&[76., 80., 83., 88.], 0.035, 0.07, 0.5, 0.1, 28.)),
        ("select", seq(&[84., 91.], 0.04, 0.06, 0.25, 0.08, 30.)),
        ("register", seq(&[72., 79., 84.], 0.06, 0.1, 0.25, 0.1, 18.)),
        ("new", seq(&[84., 88., 91., 96.], 0.03, 0.06, 0.25, 0.07, 30.)),
        ("start", seq(&[79., 84., 88., 91., 96.], 0.04, 0.08, 0.25, 0.1, 20.)),
        (
            "fail",
            over(vec![
                (0., seq(&[58., 51.], 0.085, 0.13, 0.125, 0.13, 10.)),
                (0., noise(0.12, 3000., 0.05, 20., 1)),
            ]),
        ),
        (
            "glitch",
            over(
                (0..6)
                    .map(|i| {
                        let rate = [2000., 9000., 4000., 12000., 3000., 7000.][i];
                        (i as f32 * 0.035, noise(0.03, rate, 0.06, 10., i as u32 + 3))
                    })
                    .chain([(0., pulse(1200., 90., 0.22, 0.125, 0.08, 8.))])
                    .collect(),
            ),
        ),
        (
            "evil",
            over(vec![
                (0., seq(&[62., 61., 56., 50.], 0.07, 0.14, 0.125, 0.12, 9.)),
                (0., sine(55., 50., 0.4, 0.14, 6.)),
            ]),
        ),
        (
            "cancel",
            over(vec![
                (0., pulse(2000., 160., 0.26, 0.25, 0.13, 6.)),
                (0., noise(0.15, 9000., 0.05, 25., 2)),
            ]),
        ),
        (
            "good",
            over(vec![
                (0., sine(160., 48., 0.2, 0.3, 12.)),
                (0., seq(&[72., 76., 79., 84.], 0.05, 0.12, 0.5, 0.11, 14.)),
            ]),
        ),
        (
            "bad",
            over(vec![
                (0., sine(140., 40., 0.25, 0.32, 9.)),
                (0., seq(&[67., 63., 60., 54.], 0.07, 0.14, 0.125, 0.12, 10.)),
                (0., noise(0.2, 2000., 0.06, 12., 3)),
            ]),
        ),
        (
            "title",
            over(vec![
                (0., seq(&[72., 79., 76., 84.], 0.09, 0.13, 0.25, 0.1, 12.)),
                (0., seq(&[48., 55.], 0.18, 0.2, 0.5, 0.09, 8.)),
            ]),
        ),
        (
            "whoosh",
            over(
                [1500., 3000., 6000., 12000.]
                    .iter()
                    .enumerate()
                    .map(|(i, &r)| (i as f32 * 0.05, noise(0.12, r, 0.03, 8., 9 + i as u32)))
                    .collect(),
            ),
        ),
        (
            "victory",
            over(vec![
                (0., seq(&[72., 76., 79., 84., 79., 84., 88.], 0.09, 0.16, 0.25, 0.1, 8.)),
                (0., seq(&[48., 52., 55., 60.], 0.16, 0.2, 0.5, 0.08, 6.)),
            ]),
        ),
    ]);
    b
}
