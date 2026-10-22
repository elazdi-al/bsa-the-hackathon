//! Pixel-art stress test of the 2-of-3 MPC wallet protocol, rendered with fframes.
//!
//!     cargo run --release                        # out.mp4, 1080p60
//!     cargo run --release -- frame 40s,1m10s     # PNG stills
//!     cargo run --release -- render --range S06  # one scenario
//!
//! Needs `brew install nasm x264`: FFmpeg is compiled from source (see .cargo/config.toml).

mod board;
mod px;
mod screens;
mod sfx;

use std::{borrow::Cow, collections::HashMap, process::ExitCode};

use fframes::{
    AudioData, AudioMap, AudioMixOptions, AudioTimestamp, AudioTrack, DynamicMediaProvider, Duration, EncoderOptions,
    FFramesContext, Frame, RenderOptions, Scene, Scenes, Svgr, Video, media::PreloadedAudioData,
};

use board::{A, Act::*, B, Board, Out, P, R, S, Spec, St, Who::*};
use px::Svg;
use screens::{Intro, Outro};

pub const FPS: usize = 60;
/// Length of the pixel-block dissolve between scenes, in seconds.
pub const DISS: f32 = 0.3;

#[derive(Debug, Clone, Copy)]
pub struct Cue {
    pub t: f32,
    pub name: &'static str,
    pub pan: f32,
}

const TX: Out = Out { icon: "check", label: "TX EXECUTED", good: Some(true) };

pub static SPECS: [Spec; 11] = [
    Spec {
        title: "ALL SYSTEMS NOMINAL",
        sub: "PHONE, SWISSQUOTE AND PASSKEY ARE ALL AVAILABLE.",
        fail: &[],
        home: None,
        runs: &[(User, Spend, None)],
        out: TX,
        pass: true,
        lead: Some("BASELINE: "),
        fix: "P+S PRODUCE THE MPC SIGNATURE, PASSKEY A APPROVES THE EXACT OPERATION. NO RECOVERY KEY, NO DELAY.",
    },
    Spec {
        title: "SWISSQUOTE OFFLINE",
        sub: "THE BANK'S SIGNING SERVICE IS DOWN.",
        fail: &[(S, St::Off, "OFFLINE")],
        home: None,
        runs: &[(User, Spend, None)],
        out: TX,
        pass: true,
        lead: None,
        fix: "BACKUP SHARE B. P+B+A IS AN ORDINARY TRANSACTION: NO SWISSQUOTE, NO RECOVERY KEY, NO DELAY.",
    },
    Spec {
        title: "PHONE LOST, PASSKEY SURVIVES",
        sub: "THE PHONE IS GONE, A BACKUP PASSKEY IS NOT.",
        fail: &[(P, St::Lost, "LOST")],
        home: None,
        runs: &[(User, Spend, None)],
        out: TX,
        pass: true,
        lead: None,
        fix: "THE SURVIVING PASSKEY. S+B FORM THE QUORUM AND A STILL PROVES THE USER. A NEW PHONE SHARE GOES THROUGH DELAYED MAINTENANCE.",
    },
    Spec {
        title: "PHONE + ALL PASSKEYS LOST",
        sub: "NO PHONE SHARE, NO PASSKEY. ONLY THE RECOVERY KEY IS LEFT.",
        fail: &[(P, St::Lost, "LOST"), (A, St::Lost, "ALL LOST")],
        home: None,
        runs: &[(User, Recover, None)],
        out: Out { icon: "check", label: "RECOVERED", good: Some(true) },
        pass: true,
        lead: None,
        fix: "RECOVERY KEY R. S+B+R REGISTER ONE EXACT REPLACEMENT ON-CHAIN, 48H CANCELLABLE DELAY, THEN NEW SHARES AND PASSKEY. SAME ADDRESS.",
    },
    Spec {
        title: "PROVIDERS COLLUDE",
        sub: "SWISSQUOTE AND THE BACKUP SERVICE SIGN TOGETHER AGAINST THE USER.",
        fail: &[(S, St::Evil, "HOSTILE"), (B, St::Evil, "HOSTILE")],
        home: None,
        runs: &[(Atk, Spend, None), (Atk, Recover, None)],
        out: Out { icon: "shield", label: "ATTACK BLOCKED", good: Some(true) },
        pass: true,
        lead: None,
        fix: "THE WALLET CONTRACT. THEIR MPC SIGNATURE IS VALID BUT NEVER ENOUGH: SPENDING NEEDS PASSKEY A, RECOVERY NEEDS R.",
    },
    Spec {
        title: "R STOLEN + QUORUM HOSTILE",
        sub: "THE ATTACKER HOLDS THE RECOVERY KEY AND CONTROLS S+B.",
        fail: &[(S, St::Evil, "HOSTILE"), (B, St::Evil, "HOSTILE"), (R, St::Stolen, "STOLEN")],
        home: None,
        runs: &[(Atk, Recover, Some(14.))],
        out: Out { icon: "shield", label: "RECOVERY CANCELLED", good: Some(true) },
        pass: true,
        lead: None,
        fix: "THE 48H WINDOW. SPENDING LOCKS WHILE PENDING; PASSKEY A VETOES WITH NO MPC, NO PROVIDER, FROM ANY CLIENT, BEFORE THE DEADLINE.",
    },
    Spec {
        title: "PROVIDERS REFUSE, HOME COPY",
        sub: "SWISSQUOTE AND THE BACKUP SERVICE BOTH DENY SERVICE.",
        fail: &[(S, St::Off, "REFUSES"), (B, St::Off, "REFUSES")],
        home: Some(St::Ok),
        runs: &[(User, Spend, None)],
        out: TX,
        pass: true,
        lead: None,
        fix: "THE OPTIONAL HOME COPY OF B (THE SAME SHARE, NOT A 4TH). P+B+A SPENDS WITHOUT ANY PROVIDER.",
    },
    Spec {
        title: "PROVIDERS REFUSE, NO HOME COPY",
        sub: "THE SAME DENIAL, BUT NO LOCAL COPY OF B EXISTS.",
        fail: &[(S, St::Off, "REFUSES"), (B, St::Off, "REFUSES")],
        home: Some(St::NoCopy),
        runs: &[(User, Spend, None)],
        out: Out { icon: "lock", label: "ACCESS BLOCKED", good: Some(false) },
        pass: false,
        lead: None,
        fix: "ONLY 1 OF 3 SHARES. FUNDS ARE SAFE BUT FROZEN: PROVIDERS CAN DENY SERVICE, NEVER MOVE FUNDS. FIX: KEEP A HOME COPY OF B.",
    },
    Spec {
        title: "PHONE + SECOND SHARE LOST",
        sub: "THE PHONE IS GONE AND BACKUP SHARE B IS DESTROYED.",
        fail: &[(P, St::Lost, "LOST"), (B, St::Lost, "DESTROYED")],
        home: None,
        runs: &[(User, Recover, None)],
        out: Out { icon: "cross", label: "INSUFFICIENT SHARES", good: Some(false) },
        pass: false,
        lead: None,
        fix: "ONLY S REMAINS. R AUTHORIZES RECOVERY BUT CANNOT RECREATE LOST SHARES. NO QUORUM, NO WAY BACK.",
    },
    Spec {
        title: "ALL PASSKEYS + R LOST",
        sub: "THE SHARES ARE FINE. EVERY USER CREDENTIAL IS GONE.",
        fail: &[(A, St::Lost, "ALL LOST"), (R, St::Lost, "LOST")],
        home: None,
        runs: &[(User, Spend, None), (User, Recover, None)],
        out: Out { icon: "cross", label: "NO USER AUTHORITY", good: Some(false) },
        pass: false,
        lead: None,
        fix: "NOBODY CAN SPEND OR RECOVER. PREVENTION: KEEP R IN SEPARATE CUSTODY, NEVER ONLY ON THE PHONE.",
    },
    Spec {
        title: "A STOLEN + QUORUM HOSTILE",
        sub: "THE ATTACKER HOLDS A PASSKEY AND CONTROLS S+B.",
        fail: &[(S, St::Evil, "HOSTILE"), (B, St::Evil, "HOSTILE"), (A, St::Stolen, "STOLEN")],
        home: None,
        runs: &[(Atk, Spend, None)],
        out: Out { icon: "skull", label: "ATTACKER SPENDS", good: Some(false) },
        pass: false,
        lead: None,
        fix: "BOTH FACTORS BREACHED, QUORUM AND PASSKEY. ORDINARY SPENDS HAVE NO DELAY, SO NOTHING IN THE PROTOCOL CAN STOP IT.",
    },
];

fn audio_map(cues: &[Cue]) -> AudioMap<'_> {
    AudioMap(Some(
        cues.iter()
            .map(|c| {
                AudioTrack::new(c.name, AudioTimestamp::Second(c.t)..AudioTimestamp::Eof).pan(c.pan)
            })
            .collect(),
    ))
}

macro_rules! scene {
    ($t:ty) => {
        impl Scene for $t {
            fn duration(&self) -> Duration<'_> {
                Duration::Frames((self.dur * FPS as f32).round() as usize)
            }

            fn render_frame<'a>(&'a self, frame: Frame, _ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
                let mut svg = Svg::new();
                self.draw(frame.index as f32 / FPS as f32, &mut svg);
                Svgr::from(svg.finish())
            }

            fn audio(&self) -> AudioMap<'_> {
                audio_map(&self.cues)
            }

            fn name(&self) -> &'static str {
                self.name
            }
        }
    };
}

scene!(Intro);
scene!(Board);
scene!(Outro);

struct Movie {
    scenes: Vec<Box<dyn Scene>>,
}

impl Video for Movie {
    const FPS: usize = FPS;
    const WIDTH: usize = 1920;
    const HEIGHT: usize = 1080;

    fn duration(&self) -> Duration<'_> {
        Duration::Auto
    }

    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }

    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(self.scenes.iter().map(|s| s.as_ref() as &dyn Scene).collect::<Vec<_>>())
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        // Scenes never overlap, so the active scene's SVG is the whole frame.
        ctx.render_scenes(&frame)
    }
}

fn main() -> ExitCode {
    let mut scenes: Vec<Box<dyn Scene>> = vec![Box::new(Intro::new()), Box::new(Board::legend())];
    for (i, sp) in SPECS.iter().enumerate() {
        scenes.push(Box::new(Board::scenario(i + 1, sp)));
    }
    scenes.push(Box::new(Outro::new()));

    let audio = sfx::bank()
        .into_iter()
        .map(|(name, samples)| {
            let data = PreloadedAudioData { samples: Cow::Owned(samples), sample_rate: sfx::SR, right: None };
            (name.to_string(), AudioData::Preloaded(data))
        })
        .collect();
    let media = DynamicMediaProvider::new(audio, HashMap::new(), HashMap::new(), HashMap::new(), vec![]);
    let movie = Movie { scenes };
    let options = RenderOptions {
        media: Some(&media),
        video_encoder_options: EncoderOptions {
            codec_params: Some(&[("crf", "16"), ("tune", "animation"), ("preset", "medium")]),
            ..Default::default()
        },
        audio_mix: AudioMixOptions { master_gain_db: 9., ..Default::default() },
        ..Default::default()
    };
    fframes::cli::new(&movie, options).run()
}
