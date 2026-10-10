//! Pixel canvas. Every frame is drawn on a 480x270 grid and emitted as SVG rects and
//! unit-square paths; the root viewBox scales it 4x to 1080p with crisp edges.

use std::fmt::Write;

pub type Rgb = (u8, u8, u8);

pub const BLACK: Rgb = (0, 0, 0);
pub const GRID: Rgb = (13, 18, 36);
pub const EDGE: Rgb = (26, 37, 72);
pub const NODE: Rgb = (62, 90, 158);
pub const FILL: Rgb = (7, 11, 26);
pub const BLUE: Rgb = (66, 140, 255);
pub const CYAN: Rgb = (104, 212, 255);
pub const ICE: Rgb = (214, 243, 255);
pub const WHITE: Rgb = (245, 247, 255);
pub const TEXT: Rgb = (164, 180, 218);
pub const DIM: Rgb = (82, 96, 140);
pub const FAINT: Rgb = (44, 54, 90);
pub const MAG: Rgb = (255, 48, 114);
pub const MAG_DIM: Rgb = (110, 20, 54);
pub const PINK: Rgb = (255, 150, 185);
pub const EVIL: Rgb = (44, 6, 22);

pub const W: i32 = 480;
pub const H: i32 = 270;

pub fn mix(a: Rgb, b: Rgb, k: f32) -> Rgb {
    let k = k.clamp(0., 1.);
    let l = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * k).round() as u8;
    (l(a.0, b.0), l(a.1, b.1), l(a.2, b.2))
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
        s.push_str(r##"<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 480 270" shape-rendering="crispEdges"><rect width="480" height="270" fill="#000"/>"##);
        Svg(s)
    }

    pub fn finish(mut self) -> String {
        self.0.push_str("</svg>");
        self.0
    }

    pub fn raw(&mut self, s: &str) {
        self.0.push_str(s);
    }

    fn fill(&mut self, c: Rgb) {
        let _ = write!(self.0, r##" fill="#{:02x}{:02x}{:02x}"/>"##, c.0, c.1, c.2);
    }

    pub fn rect(&mut self, x: i32, y: i32, w: i32, h: i32, c: Rgb) {
        if w <= 0 || h <= 0 {
            return;
        }
        let _ = write!(self.0, r#"<rect x="{x}" y="{y}" width="{w}" height="{h}""#);
        self.fill(c);
    }

    /// One pixel wide outline, inclusive corners.
    pub fn border(&mut self, x0: i32, y0: i32, x1: i32, y1: i32, c: Rgb) {
        let mut d = String::new();
        let w = x1 - x0 + 1;
        let h = y1 - y0 + 1;
        let _ = write!(d, "M{x0} {y0}h{w}v1h-{w}zM{x0} {y1}h{w}v1h-{w}zM{x0} {y0}h1v{h}h-1zM{x1} {y0}h1v{h}h-1z");
        self.path(&d, c);
    }

    pub fn path(&mut self, d: &str, c: Rgb) {
        if d.is_empty() {
            return;
        }
        let _ = write!(self.0, r#"<path d="{d}""#);
        self.fill(c);
    }

    pub fn pixels(&mut self, pts: impl IntoIterator<Item = (i32, i32)>, c: Rgb) {
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

    pub fn text(&mut self, x: i32, y: i32, s: &str, c: Rgb, sc: i32) {
        let mut d = String::new();
        for (i, ch) in s.chars().enumerate() {
            Self::bitmap(&mut d, glyph(ch), x + i as i32 * 6 * sc, y, sc);
        }
        self.path(&d, c);
    }

    pub fn ctext(&mut self, cx: i32, y: i32, s: &str, c: Rgb, sc: i32) {
        self.text(cx - tw(s, sc) / 2, y, s, c, sc);
    }

    pub fn rtext(&mut self, rx: i32, y: i32, s: &str, c: Rgb, sc: i32) {
        self.text(rx - tw(s, sc), y, s, c, sc);
    }

    pub fn sprite(&mut self, name: &str, cx: i32, cy: i32, c: Rgb, sc: i32) {
        let rows = sprite(name);
        let w = rows.split_whitespace().next().map_or(0, str::len) as i32 * sc;
        let h = rows.split_whitespace().count() as i32 * sc;
        let mut d = String::new();
        Self::bitmap(&mut d, rows, cx - w / 2, cy - h / 2, sc);
        self.path(&d, c);
    }

    pub fn disc(&mut self, cx: i32, cy: i32, r: i32, c: Rgb) {
        let mut d = String::new();
        for dy in -r..=r {
            let hw = ((r as f32 + 0.5).powi(2) - (dy * dy) as f32).sqrt().floor() as i32;
            let _ = write!(d, "M{} {}h{}v1h-{}z", cx - hw, cy + dy, 2 * hw + 1, 2 * hw + 1);
        }
        self.path(&d, c);
    }

    pub fn ring(&mut self, cx: i32, cy: i32, r: i32, width: i32, outline: Rgb, fill: Rgb) {
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
