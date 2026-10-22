//! Pixel canvas. Every frame is drawn on a 480x270 grid and emitted as SVG rects and
//! unit-square paths; the root viewBox scales it 4x to 1080p with crisp edges.

use std::fmt::Write;

/// A colour in OKLCH: perceptual lightness 0..1, chroma, hue in degrees. Converted to sRGB
/// only when written to the SVG (resvg has no `oklch()`), so mixes stay perceptually even.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Color(pub f32, pub f32, pub f32);

impl Color {
    pub fn srgb(self) -> [u8; 3] {
        let (l, c, h) = (self.0, self.1, self.2.to_radians());
        let (a, b) = (c * h.cos(), c * h.sin());
        let l_ = (l + 0.396_337_78 * a + 0.215_803_76 * b).powi(3);
        let m_ = (l - 0.105_561_35 * a - 0.063_854_17 * b).powi(3);
        let s_ = (l - 0.089_484_18 * a - 1.291_485_5 * b).powi(3);
        [
            4.076_741_7 * l_ - 3.307_711_6 * m_ + 0.230_969_94 * s_,
            -1.268_438 * l_ + 2.609_757_4 * m_ - 0.341_319_4 * s_,
            -0.004_196_086 * l_ - 0.703_418_6 * m_ + 1.707_614_7 * s_,
        ]
        .map(|v| {
            let v = v.clamp(0., 1.);
            let e = if v <= 0.003_130_8 { 12.92 * v } else { 1.055 * v.powf(1. / 2.4) - 0.055 };
            (e * 255.).round() as u8
        })
    }
}

// Frost: neutral near-white surfaces and grey text, colour only where it means something:
// green = valid / passed, red = failed / attacker, amber = pending.
// Text tiers clear 4.5:1 on BG and CARD; NODE and WAIT are graphics-only (~3:1).
pub const BG: Color = Color(0.975, 0.002, 250.);
pub const CARD: Color = Color(0.995, 0., 0.);
pub const SHADOW: Color = Color(0.91, 0.003, 250.);
pub const GRID: Color = Color(0.935, 0.002, 250.);
pub const LINE: Color = Color(0.86, 0.004, 250.);
pub const NODE: Color = Color(0.64, 0.006, 250.);
pub const FAINT: Color = Color(0.74, 0.004, 250.);
pub const DIM: Color = Color(0.54, 0.006, 250.);
pub const TEXT: Color = Color(0.4, 0.008, 250.);
pub const INK: Color = Color(0.24, 0.01, 250.);
pub const OK: Color = Color(0.5, 0.14, 148.);
pub const OK_SOFT: Color = Color(0.83, 0.08, 150.);
pub const OK_TINT: Color = Color(0.955, 0.03, 150.);
pub const BAD: Color = Color(0.55, 0.19, 25.);
pub const BAD_SOFT: Color = Color(0.84, 0.06, 25.);
pub const BAD_TINT: Color = Color(0.955, 0.022, 25.);
pub const WAIT: Color = Color(0.7, 0.14, 70.);
pub const WAIT_INK: Color = Color(0.52, 0.11, 65.);

pub const W: i32 = 480;
pub const H: i32 = 270;

/// Interpolates in OKLCH along the shorter hue arc; a grey end takes the other end's hue.
pub fn mix(a: Color, b: Color, k: f32) -> Color {
    let k = k.clamp(0., 1.);
    let dh = (b.2 - a.2 + 540.) % 360. - 180.;
    let h = if a.1 < 0.02 {
        b.2
    } else if b.1 < 0.02 {
        a.2
    } else {
        a.2 + dh * k
    };
    Color(a.0 + (b.0 - a.0) * k, a.1 + (b.1 - a.1) * k, h)
}

/// Deterministic 0..1 noise for glitches and the block dissolve.
pub fn hash(a: i32, b: i32, c: i32) -> f32 {
    let mut h = (a as u32).wrapping_mul(374_761_393)
        ^ (b as u32).wrapping_mul(668_265_263)
        ^ (c as u32).wrapping_mul(2_246_822_519);
    h = (h ^ (h >> 13)).wrapping_mul(1_274_126_177);
    (h ^ (h >> 16)) as f32 / u32::MAX as f32
}

pub fn tw(s: &str, sc: i32) -> i32 {
    (s.chars().count() as i32 * 6 - 1) * sc
}

pub fn blink(t: f32, hz: f32) -> bool {
    (t * hz) as i32 % 2 == 0
}

pub struct Svg(String);

impl Svg {
    pub fn new() -> Self {
        let mut s = String::with_capacity(1 << 16);
        s.push_str(r##"<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 480 270" shape-rendering="crispEdges">"##);
        let mut svg = Svg(s);
        svg.rect(0, 0, W, H, BG);
        svg
    }

    pub fn finish(mut self) -> String {
        self.0.push_str("</svg>");
        self.0
    }

    pub fn raw(&mut self, s: &str) {
        self.0.push_str(s);
    }

    fn fill(&mut self, c: Color) {
        let [r, g, b] = c.srgb();
        let _ = write!(self.0, r##" fill="#{r:02x}{g:02x}{b:02x}"/>"##);
    }

    pub fn rect(&mut self, x: i32, y: i32, w: i32, h: i32, c: Color) {
        if w <= 0 || h <= 0 {
            return;
        }
        let _ = write!(self.0, r#"<rect x="{x}" y="{y}" width="{w}" height="{h}""#);
        self.fill(c);
    }

    /// One pixel wide outline, inclusive corners.
    pub fn border(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, c: Color) {
        let mut d = String::new();
        let w = x1 - x0 + 1;
        let h = y1 - y0 + 1;
        let _ = write!(d, "M{x0} {y0}h{w}v1h-{w}zM{x0} {y1}h{w}v1h-{w}zM{x0} {y0}h1v{h}h-1zM{x1} {y0}h1v{h}h-1z");
        self.path(&d, c);
    }

    pub fn path(&mut self, d: &str, c: Color) {
        if d.is_empty() {
            return;
        }
        let _ = write!(self.0, r#"<path d="{d}""#);
        self.fill(c);
    }

    pub fn pixels(&mut self, pts: impl IntoIterator<Item = (i32, i32)>, c: Color) {
        let mut d = String::new();
        for (x, y) in pts {
            let _ = write!(d, "M{x} {y}h1v1h-1z");
        }
        self.path(&d, c);
    }

    /// `#` cells of `rows` as runs of `sc`-sized squares.
    fn bitmap(d: &mut String, rows: &str, x: i32, y: i32, sc: i32) {
        for (j, row) in rows.split_whitespace().enumerate() {
            let b = row.as_bytes();
            let mut i = 0;
            while i < b.len() {
                if b[i] != b'#' {
                    i += 1;
                    continue;
                }
                let s = i;
                while i < b.len() && b[i] == b'#' {
                    i += 1;
                }
                let w = (i - s) as i32 * sc;
                let _ = write!(d, "M{} {}h{w}v{sc}h-{w}z", x + s as i32 * sc, y + j as i32 * sc);
            }
        }
    }

    pub fn text(&mut self, x: i32, y: i32, s: &str, c: Color, sc: i32) {
        let mut d = String::new();
        for (i, ch) in s.chars().enumerate() {
            Self::bitmap(&mut d, glyph(ch), x + i as i32 * 6 * sc, y, sc);
        }
        self.path(&d, c);
    }

    pub fn ctext(&mut self, cx: i32, y: i32, s: &str, c: Color, sc: i32) {
        self.text(cx - tw(s, sc) / 2, y, s, c, sc);
    }

    pub fn rtext(&mut self, rx: i32, y: i32, s: &str, c: Color, sc: i32) {
        self.text(rx - tw(s, sc), y, s, c, sc);
    }

    pub fn sprite(&mut self, name: &str, cx: i32, cy: i32, c: Color, sc: i32) {
        let rows = sprite(name);
        let w = rows.split_whitespace().next().map_or(0, str::len) as i32 * sc;
        let h = rows.split_whitespace().count() as i32 * sc;
        let mut d = String::new();
        Self::bitmap(&mut d, rows, cx - w / 2, cy - h / 2, sc);
        self.path(&d, c);
    }

    pub fn disc(&mut self, cx: i32, cy: i32, r: i32, c: Color) {
        let mut d = String::new();
        for dy in -r..=r {
            let hw = ((r as f32 + 0.5).powi(2) - (dy * dy) as f32).sqrt().floor() as i32;
            let _ = write!(d, "M{} {}h{}v1h-{}z", cx - hw, cy + dy, 2 * hw + 1, 2 * hw + 1);
        }
        self.path(&d, c);
    }

    /// Raised card: fill, 1px border, rounded corners, a 2px shadow lip underneath.
    pub fn card(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, fill: Color, border: Color) {
        self.rect(x0 + 1, y1 + 1, x1 - x0 - 1, 2, SHADOW);
        self.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, fill);
        self.border(x0, y0, x1, y1, border);
        self.pixels([(x0, y0), (x1, y0), (x0, y1), (x1, y1)], BG);
    }

    pub fn ring(&mut self, cx: i32, cy: i32, r: i32, width: i32, outline: Color, fill: Color) {
        self.disc(cx, cy, r, outline);
        self.disc(cx, cy, r - width, fill);
    }

    /// Squares of `cell` px where `keep(noise)` holds; the noise is fixed per cell.
    pub fn blocks_path(cell: i32, keep: impl Fn(f32) -> bool) -> String {
        let mut d = String::new();
        for by in 0..H / cell {
            let mut bx = 0;
            while bx < W / cell {
                if !keep(hash(bx, by, 7)) {
                    bx += 1;
                    continue;
                }
                let s = bx;
                while bx < W / cell && keep(hash(bx, by, 7)) {
                    bx += 1;
                }
                let w = (bx - s) * cell;
                let _ = write!(d, "M{} {}h{w}v{cell}h-{w}z", s * cell, by * cell);
            }
        }
        d
    }
}

pub fn wrap(s: &str, width: usize) -> Vec<String> {
    let mut lines = vec![String::new()];
    for word in s.split(' ') {
        let cur = lines.last_mut().unwrap();
        if !cur.is_empty() && cur.len() + 1 + word.len() > width {
            lines.push(word.to_string());
        } else {
            if !cur.is_empty() {
                cur.push(' ');
            }
            cur.push_str(word);
        }
    }
    lines
}

pub fn assert_glyphs(s: &str) {
    for ch in s.chars() {
        assert!(ch == ' ' || !glyph(ch).is_empty(), "no pixel glyph for {ch:?} in {s:?}");
    }
}

/// 5x7 pixel font. Unknown characters render blank; `assert_glyphs` catches them at build time.
pub fn glyph(c: char) -> &'static str {
    match c {
        'A' => ".###. #...# #...# ##### #...# #...# #...#",
        'B' => "####. #...# #...# ####. #...# #...# ####.",
        'C' => ".###. #...# #.... #.... #.... #...# .###.",
        'D' => "####. #...# #...# #...# #...# #...# ####.",
        'E' => "##### #.... #.... ####. #.... #.... #####",
        'F' => "##### #.... #.... ####. #.... #.... #....",
        'G' => ".###. #...# #.... #.### #...# #...# .####",
        'H' => "#...# #...# #...# ##### #...# #...# #...#",
        'I' => ".###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.",
        'J' => "..### ...#. ...#. ...#. ...#. #..#. .##..",
        'K' => "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
        'L' => "#.... #.... #.... #.... #.... #.... #####",
        'M' => "#...# ##.## #.#.# #.#.# #...# #...# #...#",
        'N' => "#...# #...# ##..# #.#.# #..## #...# #...#",
        'O' => ".###. #...# #...# #...# #...# #...# .###.",
        'P' => "####. #...# #...# ####. #.... #.... #....",
        'Q' => ".###. #...# #...# #...# #.#.# #..#. .##.#",
        'R' => "####. #...# #...# ####. #.#.. #..#. #...#",
        'S' => ".#### #.... #.... .###. ....# ....# ####.",
        'T' => "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
        'U' => "#...# #...# #...# #...# #...# #...# .###.",
        'V' => "#...# #...# #...# #...# #...# .#.#. ..#..",
        'W' => "#...# #...# #...# #.#.# #.#.# #.#.# .#.#.",
        'X' => "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
        'Y' => "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
        'Z' => "##### ....# ...#. ..#.. .#... #.... #####",
        '0' => ".###. #...# #..## #.#.# ##..# #...# .###.",
        '1' => "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
        '2' => ".###. #...# ....# ...#. ..#.. .#... #####",
        '3' => "##### ...#. ..#.. ...#. ....# #...# .###.",
        '4' => "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
        '5' => "##### #.... ####. ....# ....# #...# .###.",
        '6' => "..##. .#... #.... ####. #...# #...# .###.",
        '7' => "##### ....# ...#. ..#.. .#... .#... .#...",
        '8' => ".###. #...# #...# .###. #...# #...# .###.",
        '9' => ".###. #...# #...# .#### ....# ...#. .##..",
        '.' => "..... ..... ..... ..... ..... .##.. .##..",
        ',' => "..... ..... ..... ..... .##.. ..#.. .#...",
        ':' => "..... .##.. .##.. ..... .##.. .##.. .....",
        ';' => "..... .##.. .##.. ..... .##.. ..#.. .#...",
        '!' => "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
        '?' => ".###. #...# ....# ...#. ..#.. ..... ..#..",
        '\'' => "..#.. ..#.. .#... ..... ..... ..... .....",
        '-' => "..... ..... ..... .###. ..... ..... .....",
        '+' => "..... ..#.. ..#.. ##### ..#.. ..#.. .....",
        '/' => "..... ....# ...#. ..#.. .#... #.... .....",
        '(' => "...#. ..#.. .#... .#... .#... ..#.. ...#.",
        ')' => ".#... ..#.. ...#. ...#. ...#. ..#.. .#...",
        '=' => "..... ..... ##### ..... ##### ..... .....",
        '>' => ".#... ..#.. ...#. ....# ...#. ..#.. .#...",
        '<' => "...#. ..#.. .#... #.... .#... ..#.. ...#.",
        '✓' => "..... ....# ...## #.##. ###.. .#... .....",
        '✗' => "..... #...# .#.#. ..#.. .#.#. #...# .....",
        _ => "",
    }
}

pub fn sprite(name: &str) -> &'static str {
    match name {
        "phone" => "
            .#######.
            #.......#
            #.#####.#
            #.#...#.#
            #.#...#.#
            #.#...#.#
            #.#####.#
            #.......#
            #...#...#
            #.......#
            .#######.",
        "bank" => "
            .....#.....
            ...##.##...
            .##.....##.
            ###########
            .#..#.#..#.
            .#..#.#..#.
            .#..#.#..#.
            .#..#.#..#.
            ...........
            ###########",
        "server" => "
            ###########
            #.........#
            #.#.#...#.#
            #.........#
            ###########
            #.........#
            #.#.#...#.#
            #.........#
            ###########",
        "home" => "
            .....#.....
            ....#.#....
            ...#...#...
            ..#.....#..
            .#.......#.
            ###.....###
            ..#.###.#..
            ..#.#.#.#..
            ..#.#.#.#..
            ..#######..",
        "finger" => "
            ...#####...
            ..#.....#..
            .#..###..#.
            #..#...#..#
            #.#..#..#.#
            #.#.#.#.#.#
            #.#.#.#.#.#
            ..#.#.#.#..
            .#..#.#..#.
            ...#..#....
            .....#.....",
        "key" => "
            .###.......
            #...#......
            #.#.#######
            #...#...#.#
            .###....#.#",
        "vault" => "
            #############
            #...........#
            #..#######..#
            #..#.....#..#
            #..#..#..#..#
            #..#.###.#..#
            #..#..#..#..#
            #..#.....#..#
            #..#######..#
            #...........#
            #############
            .##.......##.",
        "skull" => "
            ..#####..
            .#######.
            #..###..#
            #..###..#
            ####.####
            .#######.
            ..#.#.#..
            ..#####..",
        "skull_s" => "
            .###.
            #.#.#
            #####
            .###.
            .#.#.",
        "user" => "
            ..###..
            .#####.
            .#####.
            ..###..
            .......
            .#####.
            #######
            #######",
        "hourglass" => "
            #########
            .#.....#.
            .#.....#.
            ..#...#..
            ...#.#...
            ....#....
            ...#.#...
            ..#.#.#..
            .#.###.#.
            .#######.
            #########",
        "check" => "
            ..........#
            .........##
            ........##.
            #......##..
            ##....##...
            .##..##....
            ..####.....
            ...##......",
        "cross" => "
            ##.....##
            ###...###
            .###.###.
            ..#####..
            ...###...
            ..#####..
            .###.###.
            ###...###
            ##.....##",
        "shield" => "
            .....#.....
            ...##.##...
            .##.....##.
            #.........#
            #....#....#
            #...###...#
            #..#####..#
            #....#....#
            .#...#...#.
            ..#.....#..
            ...##.##...
            .....#.....",
        "lock" => "
            ...#####...
            ..##...##..
            ..#.....#..
            ..#.....#..
            ###########
            ###########
            ####...####
            #####.#####
            #####.#####
            ###########
            ###########",
        _ => "",
    }
}
