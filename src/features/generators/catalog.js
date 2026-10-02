// Generator catalogue ported from STL Studio (stl-studio/generators.js, the owner's own
// OpenSCAD sources). Kept as plain data so both studios render identical models.
// Parametric generators. Each one is plain OpenSCAD with Customizer-style annotations:
//   name = value; // [min:step:max] Label
//   name = "key"; // [key:Label, key2:Label 2]
// The app turns those into controls and passes changes with -D, so the same parser works for AI output.
// echo("INFO: ...") lines are shown to the user as computed facts about the part.

const FONT_TABLE = `
function font_name(k) =
  k == "archivo"  ? "Archivo Black" :
  k == "anton"    ? "Anton" :
  k == "bebas"    ? "Bebas Neue" :
  k == "blackops" ? "Black Ops One" :
  k == "pacifico" ? "Pacifico" :
  k == "sans"     ? "Liberation Sans:style=Bold" :
  k == "serif"    ? "Liberation Serif:style=Bold" :
  k == "mono"     ? "Liberation Mono:style=Bold" :
  k == "stencil"  ? "Allerta Stencil" :
  k == "cairo"    ? "Cairo:style=Black" :
  k == "tajawal"  ? "Tajawal:style=ExtraBold" :
  k == "lalezar"  ? "Lalezar" :
  k == "naskh"    ? "Noto Naskh Arabic:style=Bold" : "Liberation Sans:style=Bold";
function has_arabic(s) = len([for (c = s) if (ord(c) >= 1536 && ord(c) <= 1791) 1]) > 0;
`;

const FONT_OPTS = 'archivo:Archivo Black, anton:Anton, bebas:Bebas Neue, blackops:Black Ops One, pacifico:Pacifico (script), sans:Sans Bold, serif:Serif Bold, mono:Mono Bold, stencil:Allerta Stencil, cairo:Cairo (Arabic + English), tajawal:Tajawal (Arabic), lalezar:Lalezar (Arabic), naskh:Noto Naskh (Arabic)';

import { MORE_1 } from './catalogMore1.js';
import { MORE_2 } from './catalogMore2.js';
import { LASER } from './catalogLaser.js';

export const CATEGORIES = [
  { id: 'org', name: 'Organization' },
  { id: 'box', name: 'Boxes, Enclosures & Gridfinity' },
  { id: 'mech', name: 'Mechanical' },
  { id: 'fast', name: 'Fasteners' },
  { id: 'hard', name: 'Hardware' },
  { id: 'house', name: 'Household' },
  { id: 'adapt', name: 'Adapters & Mounts' },
  { id: 'elec', name: 'Cable & Electronics' },
  { id: 'shop', name: 'Workshop' },
  { id: 'desk', name: 'Desk & Stands' },
  { id: 'peg', name: 'Pegboard (SKÅDIS)' },
  { id: 'text', name: 'Names & Text' },
  { id: 'acc', name: 'Accessories' },
  { id: 'toys', name: 'Toys & Games' },
  { id: 'laser', name: 'Laser cutting (export SVG / DXF)' },
];

export const GENERATORS = [
// ───────────────────────────────── TEXT ─────────────────────────────────
{
  id: 'dual-letter', cat: 'text', name: 'Dual-Letter Illusion',
  desc: 'Two words in one object: read one from the front, the other from the side. Supports symbols like hearts and stars.',
  scad: `/* [Words] */
word_front = "LOVE"; // Word read from the front (letters, numbers, symbols like ♥ ★ or emoji)
word_side = "YOU♥"; // Word read from the right side (type ♥ ★ ● ◆ ▲ ■ ✚ or any emoji)
font = "archivo"; // [${FONT_OPTS}] Font

/* [Size] */
letter_height = 30; // [10:1:120] Letter height (mm)
letter_width = 24; // [8:1:120] Letter block width (mm)
gap = 2; // [0:0.5:20] Gap between letters (mm)
stretch_letters = true; // Stretch every letter to fill its block (best illusion)

/* [Base] */
base = true; // Add a base plate
base_thickness = 3; // [1:0.5:10] Base thickness (mm)
base_margin = 4; // [0:0.5:20] Base margin around letters (mm)

/* [Fix floating parts] */
support_post = false; // Add a thin post so pieces that would float are attached to the base
post_width = 2; // [1:0.2:6] Post width (mm)

/* [Hidden] */
$fn = 48;
${FONT_TABLE}
n = max(len(word_front), len(word_side));
off_a = floor((n - len(word_front)) / 2);
off_b = floor((n - len(word_side)) / 2);
function ch(w, i, o) = (i - o >= 0 && i - o < len(w)) ? w[i - o] : " ";
step = letter_width + gap;
z0 = base ? base_thickness - 0.01 : 0;
// symbols and emoji (code point >= U+2000) come from the monochrome emoji font,
// a few basic shapes are drawn as vectors: ★ ● ◆ ▲ ■ ✚
function is_vec(c) = ord(c) == 9733 || ord(c) == 9679 || ord(c) == 9670 || ord(c) == 9650 || ord(c) == 9632 || ord(c) == 10010;
function is_sym(c) = ord(c) >= 8192;
function fname(c) = is_sym(c) ? "Noto Emoji:style=Bold" : font_name(font);
module vec2d(c) {
  o = ord(c);
  if (o == 9733) polygon([for (i = [0 : 9]) let(a = 90 + i * 36, r = (i % 2 == 0) ? 5 : 2.1) [r * cos(a), r * sin(a)]]);
  else if (o == 9679) circle(d = 10, $fn = 64);
  else if (o == 9670) rotate(45) square(7.1, center = true);
  else if (o == 9650) polygon([[-5, -4], [5, -4], [0, 4.5]]);
  else if (o == 9632) square(9, center = true);
  else if (o == 10010) union() { square([10, 3.4], center = true); square([3.4, 10], center = true); }
}

module glyph(c) {
  if (c != " ") {
    if (is_vec(c)) resize([letter_width, letter_height]) vec2d(c);
    else if (stretch_letters || is_sym(c))
      resize([letter_width, letter_height]) text(c, size = 10, font = fname(c), halign = "center", valign = "center");
    else
      translate([0, letter_height / 2]) resize([0, letter_height], auto = true)
        text(c, size = 10, font = fname(c), halign = "center", valign = "center");
  }
}

module pair(a, b) {
  intersection() {
    // front word: lies in XZ, extruded along Y
    rotate([90, 0, 0]) linear_extrude(letter_width * 1.5, center = true) glyph(a);
    // side word: lies in YZ, extruded along X
    rotate([90, 0, 90]) linear_extrude(letter_width * 1.5, center = true) glyph(b);
  }
  if (support_post) translate([-post_width / 2, -post_width / 2, -letter_height / 2]) cube([post_width, post_width, letter_height]);
}

for (i = [0 : n - 1]) {
  a = ch(word_front, i, off_a);
  b = ch(word_side, i, off_b);
  if (a != " " && b != " ")
    translate([i * step, i * step, z0 + letter_height / 2]) pair(a, b);
}
if (base)
  hull() for (i = [0, n - 1])
    translate([i * step, i * step, 0]) cylinder(r = letter_width * 0.72 + base_margin, h = base_thickness);

if (len(word_front) != len(word_side))
  echo("INFO: Words have different lengths - positions without a partner letter are left empty. Add a symbol such as ♥ to balance them.");
echo(str("INFO: Letter blocks: ", n, " x ", letter_width, " mm, diagonal spacing ", step, " mm"));
`},
{
  id: 'name-sign', cat: 'text', name: 'Name Sign',
  desc: 'Desk or door plate with raised text, border and optional screw holes. Arabic supported.',
  scad: `/* [Text] */
line1 = "Abdullah"; // First line
line2 = "Electronics Lab"; // Second line (leave empty for one line)
font = "archivo"; // [${FONT_OPTS}] Font
size1 = 14; // [4:0.5:60] Line 1 text height (mm)
size2 = 7; // [3:0.5:40] Line 2 text height (mm)
line_gap = 5; // [0:0.5:30] Gap between lines (mm)
text_height = 2; // [0.4:0.2:8] Raised text height (mm)

/* [Plate] */
width = 150; // [30:1:400] Plate width (mm)
height = 50; // [15:1:200] Plate height (mm)
thickness = 3; // [1:0.5:12] Plate thickness (mm)
corner_radius = 5; // [0:0.5:30] Corner radius (mm)
border = 2; // [0:0.5:10] Raised border width (0 = none)
holes = false; // Add two screw holes
hole_d = 4; // [2:0.5:8] Screw hole diameter (mm)
stand = false; // Add a rear desk stand

/* [Hidden] */
$fn = 48;
${FONT_TABLE}
module rrect(w, h, r) { offset(r) offset(-r) square([w, h], center = true); }
module label(t, s) {
  text(t, size = s, font = font_name(font), halign = "center", valign = "center",
       direction = has_arabic(t) ? "rtl" : "ltr", script = has_arabic(t) ? "arabic" : "latin");
}
two = len(line2) > 0;
y1 = two ? (size2 + line_gap) / 2 : 0;
y2 = two ? -(size1 + line_gap) / 2 : 0;
hx = width / 2 - max(corner_radius, hole_d) - border - 2;

difference() {
  linear_extrude(thickness) rrect(width, height, min(corner_radius, height / 2 - 0.01));
  if (holes) for (s = [-1, 1]) translate([s * hx, 0, -1]) {
    cylinder(d = hole_d, h = thickness + 2);
    translate([0, 0, thickness - hole_d / 2 + 1]) cylinder(d1 = hole_d, d2 = hole_d * 2 + 0.5, h = hole_d / 2 + 0.01);
  }
}
translate([0, 0, thickness - 0.01]) linear_extrude(text_height + 0.01) {
  translate([0, y1]) label(line1, size1);
  if (two) translate([0, y2]) label(line2, size2);
  if (border > 0) difference() {
    rrect(width - 2, height - 2, max(0.01, min(corner_radius, height / 2 - 0.01) - 1));
    rrect(width - 2 - 2 * border, height - 2 - 2 * border, max(0.01, min(corner_radius, height / 2 - 0.01) - 1 - border));
  }
}
if (stand)
  translate([0, -height / 2 + 0.01, 0]) rotate([0, 0, 0])
    hull() {
      translate([-width * 0.3, 0, 0]) cube([width * 0.6, 0.01, thickness]);
      translate([-width * 0.3, -thickness, 0]) cube([width * 0.6, thickness, height * 0.45]);
    }
echo(str("INFO: Plate ", width, " x ", height, " x ", thickness, " mm, total height with text ", thickness + text_height, " mm"));
`},
{
  id: 'keychain', cat: 'text', name: 'Keychain Tag',
  desc: 'Name keychain whose outline follows the text, with a key-ring loop.',
  scad: `/* [Text] */
txt = "NEO"; // Text
font = "archivo"; // [${FONT_OPTS}] Font
text_size = 12; // [4:0.5:40] Text height (mm)
spacing = 1.0; // [0.8:0.05:1.5] Letter spacing

/* [Body] */
style = "outline"; // [outline:Follows the letters, pill:Rounded bar]
padding = 3; // [1:0.5:10] Border around the text (mm)
base_thickness = 2.4; // [1:0.2:6] Base thickness (mm)
text_mode = "raised"; // [raised:Raised, engraved:Engraved, flush:Two-color flush]
text_depth = 1.2; // [0.4:0.2:4] Text height or depth (mm)

/* [Ring] */
ring_d = 5; // [2:0.5:10] Ring hole diameter (mm)
ring_wall = 2.5; // [1.2:0.2:6] Wall around the ring hole (mm)

/* [Hidden] */
$fn = 48;
${FONT_TABLE}
module t2d() text(txt, size = text_size, font = font_name(font), halign = "left", valign = "center", spacing = spacing,
  direction = has_arabic(txt) ? "rtl" : "ltr", script = has_arabic(txt) ? "arabic" : "latin");
rr = ring_d / 2 + ring_wall;
module body2d() {
  if (style == "outline") offset(r = padding) t2d();
  else hull() offset(r = padding) t2d();
  hull() {
    translate([-rr + padding * 0.2, 0]) circle(r = rr);
    translate([0, 0]) circle(r = min(rr, text_size / 2 + padding));
  }
}
difference() {
  linear_extrude(base_thickness) body2d();
  translate([-rr + padding * 0.2, 0, -1]) cylinder(d = ring_d, h = base_thickness + 2);
  if (text_mode == "engraved") translate([0, 0, base_thickness - text_depth]) linear_extrude(text_depth + 1) t2d();
  if (text_mode == "flush") translate([0, 0, base_thickness - text_depth]) linear_extrude(text_depth + 1) offset(0.01) t2d();
}
if (text_mode == "raised") translate([0, 0, base_thickness - 0.01]) linear_extrude(text_depth + 0.01) t2d();
if (text_mode == "flush") color("white") translate([0, 0, base_thickness - text_depth]) linear_extrude(text_depth) t2d();
echo("INFO: For two-color flush text, pause the print at the layer where the text starts, or use a multi-material slicer split.");
`},
{
  id: 'stamp', cat: 'text', name: 'Rubber-Style Stamp',
  desc: 'Mirrored raised text on a block with a round handle. Print in TPU or PLA.',
  scad: `/* [Text] */
txt = "APPROVED"; // Stamp text
font = "archivo"; // [${FONT_OPTS}] Font
text_size = 10; // [3:0.5:40] Text height (mm)
relief = 2; // [0.6:0.2:5] Raised relief height (mm)
border = true; // Add a border frame

/* [Block] */
width = 70; // [15:1:200] Stamp face width (mm)
depth = 25; // [10:1:150] Stamp face depth (mm)
block_h = 8; // [3:0.5:30] Block thickness (mm)
handle_d = 22; // [10:1:50] Handle diameter (mm)
handle_h = 35; // [10:1:100] Handle height (mm)

/* [Hidden] */
$fn = 64;
${FONT_TABLE}
// Built face-down, handle up: the text is mirrored so the print reads correctly.
translate([0, 0, relief]) {
  linear_extrude(block_h) offset(2) offset(-2) square([width, depth], center = true);
  translate([0, 0, block_h - 0.01]) cylinder(d1 = handle_d * 0.7, d2 = handle_d * 0.55, h = handle_h * 0.6);
  translate([0, 0, block_h + handle_h * 0.6 - 0.02]) scale([1, 1, 0.8]) sphere(d = handle_d);
}
linear_extrude(relief + 0.01) mirror([1, 0]) {
  text(txt, size = text_size, font = font_name(font), halign = "center", valign = "center",
       direction = has_arabic(txt) ? "rtl" : "ltr", script = has_arabic(txt) ? "arabic" : "latin");
  if (border) difference() {
    offset(1) offset(-1) square([width - 2, depth - 2], center = true);
    offset(1) offset(-1) square([width - 5, depth - 5], center = true);
  }
}
echo("INFO: Print handle-up. The relief is mirrored so impressions read correctly.");
`},
{
  id: 'stencil', cat: 'text', name: 'Stencil',
  desc: 'Paint or spray stencil cut from your text. Use a stencil font so letter islands stay attached.',
  scad: `/* [Text] */
txt = "GARAGE"; // Stencil text
font = "stencil"; // [${FONT_OPTS}] Font
text_size = 30; // [5:1:150] Text height (mm)
spacing = 1.05; // [0.8:0.05:1.6] Letter spacing

/* [Plate] */
margin = 10; // [3:1:50] Margin around text (mm)
thickness = 1.2; // [0.4:0.2:4] Plate thickness (mm)
corner_radius = 4; // [0:0.5:20] Corner radius (mm)

/* [Hidden] */
${FONT_TABLE}
module t2d() text(txt, size = text_size, font = font_name(font), halign = "center", valign = "center", spacing = spacing,
  direction = has_arabic(txt) ? "rtl" : "ltr", script = has_arabic(txt) ? "arabic" : "latin");
linear_extrude(thickness) difference() {
  offset(r = corner_radius) offset(delta = margin - corner_radius) hull() t2d();
  t2d();
}
if (font != "stencil") echo("INFO: Closed letters (O, A, B, R...) lose their centers unless you use a stencil font.");
`},
{
  id: 'cookie-cutter', cat: 'text', name: 'Cookie Cutter',
  desc: 'Classic shape or text cutter with a thin cutting edge and a reinforcing flange.',
  scad: `/* [Shape] */
shape = "heart"; // [circle:Circle, heart:Heart, star:Star, hexagon:Hexagon, text:Text]
size = 60; // [20:1:150] Overall size (mm)
txt = "A"; // Text (when shape = Text)
font = "archivo"; // [${FONT_OPTS}] Font

/* [Walls] */
height = 14; // [6:0.5:30] Cutter height (mm)
wall = 0.8; // [0.4:0.1:2] Cutting wall thickness (mm)
flange_w = 4; // [0:0.5:10] Flange width (mm)
flange_h = 2; // [0:0.2:4] Flange thickness (mm)

/* [Hidden] */
$fn = 96;
${FONT_TABLE}
module heart(s) {
  r = s / 4.1;
  translate([0, -s * 0.17]) rotate(45) union() {
    square(2 * r * 0.95, center = true);
    translate([0, r * 0.95]) circle(r * 0.95);
    translate([r * 0.95, 0]) circle(r * 0.95);
  }
}
module star(s, points = 5) {
  polygon([for (i = [0 : 2 * points - 1]) let(a = 90 + i * 180 / points, rr = (i % 2 == 0) ? s / 2 : s / 4.6) [rr * cos(a), rr * sin(a)]]);
}
module shape2d() {
  if (shape == "circle") circle(d = size);
  else if (shape == "heart") heart(size);
  else if (shape == "star") star(size);
  else if (shape == "hexagon") circle(d = size, $fn = 6);
  else resize([0, size], auto = true) text(txt, size = 10, font = font_name(font), halign = "center", valign = "center");
}
linear_extrude(height) difference() { offset(r = wall) shape2d(); shape2d(); }
if (flange_h > 0) linear_extrude(flange_h) difference() { offset(r = wall + flange_w) shape2d(); offset(r = 0.01) shape2d(); }
echo(str("INFO: Cutting wall ", wall, " mm - print with 2 perimeters of ", wall / 2, " mm or a 0.4 mm nozzle at 2 lines."));
`},

// ───────────────────────────────── BOXES ─────────────────────────────────
{
  id: 'project-box', cat: 'box', name: 'Project Box + Lid',
  desc: 'Electronics enclosure with corner screw posts, inset lid, vents and a cable hole.',
  scad: `/* [Inside size] */
inner_x = 80; // [20:1:300] Inside length (mm)
inner_y = 50; // [20:1:300] Inside width (mm)
inner_z = 30; // [10:1:200] Inside height (mm)

/* [Walls] */
wall = 2; // [1.2:0.2:5] Wall thickness (mm)
floor_t = 2; // [1:0.2:5] Floor thickness (mm)
corner_r = 3; // [0:0.5:15] Outer corner radius (mm)

/* [Lid & screws] */
lid_t = 2; // [1:0.2:5] Lid thickness (mm)
screw = "m3"; // [m2:M2, m25:M2.5, m3:M3, m4:M4]
screw_mode = "tap"; // [tap:Self-tapping pilot, insert:Heat-set insert]
fit = 0.3; // [0:0.05:0.8] Lid lip clearance (mm)

/* [Features] */
vents = true; // Vent slots on the lid
cable_hole = true; // Cable hole on the -X wall
cable_d = 8; // [3:0.5:25] Cable hole diameter (mm)
part = "both"; // [both:Box and lid, box:Box only, lid:Lid only]

/* [Hidden] */
$fn = 48;
sd = screw == "m2" ? 2 : screw == "m25" ? 2.5 : screw == "m3" ? 3 : 4;
pilot = screw_mode == "tap" ? sd * 0.85 : (screw == "m2" ? 3.2 : screw == "m25" ? 3.6 : screw == "m3" ? 4.2 : 5.6);
post_d = max(sd * 2.4, pilot + 3);
ox = inner_x + 2 * wall; oy = inner_y + 2 * wall; oz = inner_z + floor_t;
px = inner_x / 2 - post_d / 2 + 0.01; py = inner_y / 2 - post_d / 2 + 0.01;
module rrect(x, y, r) { offset(r) offset(-r) square([x, y], center = true); }

module box() {
  difference() {
    linear_extrude(oz) rrect(ox, oy, corner_r);
    translate([0, 0, floor_t]) linear_extrude(oz) rrect(inner_x, inner_y, max(0.01, corner_r - wall));
    if (cable_hole) translate([-ox / 2 - 1, 0, floor_t + inner_z / 2]) rotate([0, 90, 0]) cylinder(d = cable_d, h = wall + 2);
  }
  for (sx = [-1, 1], sy = [-1, 1]) translate([sx * px, sy * py, 0]) difference() {
    union() {
      cylinder(d = post_d, h = oz - lid_t);
      // gusset to the corner walls
      translate([sx * post_d / 4, sy * post_d / 4, 0]) linear_extrude(oz - lid_t) square(post_d / 2, center = true);
    }
    translate([0, 0, floor_t]) cylinder(d = pilot, h = oz);
  }
}
module lid() {
  difference() {
    union() {
      linear_extrude(lid_t) rrect(ox, oy, corner_r);
      // locating lip
      translate([0, 0, lid_t - 0.01]) linear_extrude(2) difference() {
        rrect(inner_x - 2 * fit, inner_y - 2 * fit, max(0.01, corner_r - wall));
        rrect(inner_x - 2 * fit - 2.4, inner_y - 2 * fit - 2.4, max(0.01, corner_r - wall - 1.2));
        for (sx = [-1, 1], sy = [-1, 1]) translate([sx * px, sy * py]) circle(d = post_d + 2 * fit + 0.4);
      }
    }
    for (sx = [-1, 1], sy = [-1, 1]) translate([sx * px, sy * py, -1]) {
      cylinder(d = sd + 0.4, h = lid_t + 5);
      cylinder(d1 = sd * 2 + 0.4, d2 = sd + 0.4, h = sd * 0.6 + 1);
    }
    if (vents) for (i = [-2 : 2]) translate([i * 5, 0, -1]) linear_extrude(lid_t + 2) rrect(2, inner_y * 0.5, 0.99);
  }
}
if (part != "lid") box();
if (part != "box") translate([part == "both" ? ox + 10 : 0, 0, 0]) lid();
echo(str("INFO: Outside ", ox, " x ", oy, " x ", oz + 0, " mm (box) + ", lid_t, " mm lid; screw ", screw, " ", screw_mode == "tap" ? "pilot " : "insert hole ", pilot, " mm"));
echo(str("INFO: Screw length needed about ", lid_t + min(oz - lid_t - floor_t, 10), " mm."));
`},
{
  id: 'board-case', cat: 'box', name: 'Board Tray (Arduino / Pi)',
  desc: 'Open-top tray with standoffs matching popular board hole patterns.',
  scad: `/* [Board] */
board = "uno"; // [uno:Arduino Uno, mega:Arduino Mega 2560, pi4:Raspberry Pi 4 / 3B+, pizero:Raspberry Pi Zero, custom:Custom 4 holes]
custom_x = 60; // [10:0.5:200] Custom board length (mm)
custom_y = 40; // [10:0.5:200] Custom board width (mm)
custom_inset = 3.5; // [1:0.1:10] Custom hole inset from edges (mm)
custom_hole = 3; // [2:0.1:4] Custom screw size (mm)

/* [Tray] */
clearance = 2; // [0.5:0.5:10] Gap board to wall (mm)
wall = 2; // [1.2:0.2:5] Wall thickness (mm)
floor_t = 2; // [1:0.2:5] Floor thickness (mm)
standoff_h = 5; // [2:0.5:20] Standoff height (mm)
wall_h = 12; // [3:1:60] Wall height above floor (mm)
open_side = true; // Leave the -X end open for USB / power
corner_r = 3; // [0:0.5:10] Outer corner radius (mm)

/* [Hidden] */
$fn = 40;
// Hole coordinates from the official board drawings (mm, origin = board corner)
bx = board == "uno" ? 68.6 : board == "mega" ? 101.6 : board == "pi4" ? 85 : board == "pizero" ? 65 : custom_x;
by = board == "uno" ? 53.3 : board == "mega" ? 53.3 : board == "pi4" ? 56 : board == "pizero" ? 30 : custom_y;
holes =
  board == "uno"    ? [[14.0, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]] :
  board == "mega"   ? [[14.0, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5], [90.2, 50.7], [96.5, 2.5]] :
  board == "pi4"    ? [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]] :
  board == "pizero" ? [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]] :
  [[custom_inset, custom_inset], [custom_x - custom_inset, custom_inset], [custom_inset, custom_y - custom_inset], [custom_x - custom_inset, custom_y - custom_inset]];
hs = board == "uno" || board == "mega" ? 3.2 : board == "custom" ? custom_hole : 2.5;
ix = bx + 2 * clearance; iy = by + 2 * clearance;
ox = ix + 2 * wall; oy = iy + 2 * wall;
module rrect(x, y, r) { offset(r) offset(-r) square([x, y], center = true); }
difference() {
  linear_extrude(floor_t + wall_h) rrect(ox, oy, corner_r);
  translate([0, 0, floor_t]) linear_extrude(wall_h + 1) rrect(ix, iy, max(0.01, corner_r - wall));
  if (open_side) translate([-ox / 2 - 1, -iy / 2 + 4, floor_t + standoff_h - 1]) cube([wall + 2, iy - 8, wall_h + 2]);
}
translate([-bx / 2, -by / 2, 0]) for (h = holes) translate([h[0], h[1], 0]) difference() {
  cylinder(d = hs * 2.2, h = floor_t + standoff_h);
  translate([0, 0, floor_t * 0.5]) cylinder(d = hs * 0.85, h = floor_t + standoff_h);
}
echo(str("INFO: Board ", bx, " x ", by, " mm, ", len(holes), " standoffs for M", hs == 3.2 ? 3 : hs, " self-tapping screws. Tray outside ", ox, " x ", oy, " mm."));
`},
{
  id: 'gridfinity-bin', cat: 'box', name: 'Gridfinity Bin',
  desc: 'Bin on the 42 mm Gridfinity grid with optional dividers, magnet holes and stacking lip.',
  scad: `/* [Size] */
units_x = 2; // [1:1:8] Grid units in X (42 mm each)
units_y = 1; // [1:1:8] Grid units in Y (42 mm each)
units_z = 6; // [2:1:20] Height units (7 mm each)

/* [Inside] */
div_x = 1; // [1:1:10] Compartments along X
div_y = 1; // [1:1:10] Compartments along Y
wall = 1.2; // [0.8:0.2:3] Wall thickness (mm)
scoop = false; // Finger scoop on the front wall

/* [Features] */
magnets = false; // 6 x 2 mm magnet holes in the feet
stacking_lip = true; // Add the stacking lip

/* [Hidden] */
$fn = 40;
g = 42; h_unit = 7; clr = 0.5; r_top = 3.75;
bx = units_x * g - clr; by = units_y * g - clr; bz = units_z * h_unit;
foot_h = 4.75;
module rr(x, y, r) { offset(r) offset(-r) square([x, y], center = true); }
module foot() {
  // Gridfinity base profile: 0.8 mm 45-degree, 1.8 mm straight, 2.15 mm 45-degree
  hull() {
    linear_extrude(0.01) rr(g - clr - 2 * 2.95, g - clr - 2 * 2.95, 0.8);
    translate([0, 0, 0.8]) linear_extrude(1.8) rr(g - clr - 2 * 2.15, g - clr - 2 * 2.15, 1.6);
    translate([0, 0, foot_h - 0.01]) linear_extrude(0.01) rr(g - clr, g - clr, r_top);
  }
}
floor_z = foot_h + 1.2;
difference() {
  union() {
    for (i = [0 : units_x - 1], j = [0 : units_y - 1])
      translate([(i - (units_x - 1) / 2) * g, (j - (units_y - 1) / 2) * g, 0]) foot();
    translate([0, 0, foot_h - 0.01]) linear_extrude(bz - foot_h + 0.01) rr(bx, by, r_top);
    if (stacking_lip) translate([0, 0, bz - 0.01]) difference() {
      linear_extrude(4.4) rr(bx, by, r_top);
      // inner lip profile: 0.7 mm chamfer at top, straight 1.8 mm, 45-degree back to the wall
      hull() {
        translate([0, 0, 4.4 - 0.7]) linear_extrude(0.71) rr(bx - 2 * 0.1, by - 2 * 0.1, r_top - 0.1);
        translate([0, 0, 4.4 - 0.7 - 1.8]) linear_extrude(0.01) rr(bx - 2 * 0.8, by - 2 * 0.8, r_top - 0.8);
      }
      translate([0, 0, 4.4 - 2.5 - 1.9]) hull() {
        linear_extrude(0.01) rr(bx - 2 * 2.6, by - 2 * 2.6, max(0.5, r_top - 2.6));
        translate([0, 0, 1.9 + 0.01]) linear_extrude(0.01) rr(bx - 2 * 0.8, by - 2 * 0.8, r_top - 0.8);
      }
      translate([0, 0, -1]) linear_extrude(5) rr(bx - 2 * 2.6, by - 2 * 2.6, max(0.5, r_top - 2.6));
    }
  }
  // compartments
  cw = (bx - 2 * wall - (div_x - 1) * wall) / div_x;
  cd = (by - 2 * wall - (div_y - 1) * wall) / div_y;
  for (i = [0 : div_x - 1], j = [0 : div_y - 1])
    translate([-bx / 2 + wall + i * (cw + wall), -by / 2 + wall + j * (cd + wall), floor_z]) {
      hull() {
        translate([0, 0, 0]) linear_extrude(bz) translate([cw / 2, cd / 2]) rr(cw, cd, min(2, cw / 2 - 0.01, cd / 2 - 0.01));
        if (scoop && j == 0) translate([0, 0, 0]) cube([cw, 0.01, 0.01]);
      }
      if (scoop && j == 0) intersection() {
        cube([cw, min(cd, 12), 12]);
        translate([-1, 12, 12]) rotate([0, 90, 0]) difference() { cylinder(r = 13, h = cw + 2); }
      }
    }
  if (magnets)
    for (i = [0 : units_x - 1], j = [0 : units_y - 1], sx = [-1, 1], sy = [-1, 1])
      translate([(i - (units_x - 1) / 2) * g + sx * 13, (j - (units_y - 1) / 2) * g + sy * 13, -0.01]) cylinder(d = 6.5, h = 2.4);
}
echo(str("INFO: Bin ", bx, " x ", by, " mm, height ", bz, " mm", stacking_lip ? " + 4.4 mm lip" : "", ". Compartments ", div_x, " x ", div_y, "."));
`},

// ───────────────────────────────── MECHANICAL ─────────────────────────────────
{
  id: 'spur-gear', cat: 'mech', name: 'Spur / Helical Gear',
  desc: 'Involute gear by module and tooth count, with bore, D-flat, helical or herringbone teeth.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/gears.scad>
/* [Gear] */
mod = 1.5; // [0.5:0.25:6] Module (tooth size, mm)
teeth = 24; // [6:1:150] Number of teeth
thickness = 8; // [2:0.5:50] Face width (mm)
pressure_angle = 20; // [14.5:0.5:25] Pressure angle (degrees)
helix = 0; // [0:1:45] Helix angle (0 = straight spur)
herringbone = false; // Double helical (needs helix > 0)
backlash = 0.1; // [0:0.02:0.5] Backlash for printing (mm)

/* [Bore] */
bore = 5; // [0:0.1:50] Bore diameter (0 = solid)
d_flat = true; // D-shaft flat
flat_depth = 0.5; // [0.1:0.1:3] Depth of the D flat (mm)
hub = true; // Add a hub
hub_d = 14; // [5:0.5:60] Hub diameter (mm)
hub_h = 6; // [1:0.5:30] Hub height (mm)

/* [Hidden] */
$fn = 64;
pd = mod * teeth;
difference() {
  union() {
    spur_gear(mod = mod, teeth = teeth, thickness = thickness, pressure_angle = pressure_angle,
              helical = helix, herringbone = herringbone && helix > 0, backlash = backlash, anchor = BOTTOM, slices = helix > 0 ? 12 : 1);
    if (hub) cyl(d = min(hub_d, pd - 2.5 * mod), h = thickness + hub_h, anchor = BOTTOM);
  }
  if (bore > 0) down(1) difference() {
    cyl(d = bore + 0.15, h = thickness + hub_h + 4, anchor = BOTTOM);
    if (d_flat) right(bore / 2 - flat_depth) cuboid([bore, bore * 2, thickness + hub_h + 4], anchor = BOTTOM + LEFT);
  }
}
echo(str("INFO: Pitch diameter ", pd, " mm, outside diameter ", pd + 2 * mod, " mm, root diameter ", pd - 2.5 * mod, " mm"));
echo(str("INFO: Center distance to a mating gear with N teeth = ", mod / 2, " x (", teeth, " + N) mm"));
`},
{
  id: 'gt2-pulley', cat: 'mech', name: 'GT2 Timing Pulley',
  desc: 'GT2 (2 mm pitch) belt pulley with flanges, hub and set-screw hole.',
  scad: `/* [Pulley] */
teeth = 20; // [10:1:80] Tooth count
belt_width = 6; // [6:3:12] Belt width (mm)
bore = 5; // [2:0.1:14] Bore diameter (mm)
tooth_fit = 0.1; // [0:0.02:0.3] Extra groove clearance (mm)

/* [Flanges & hub] */
flanges = true; // Add flanges on both sides
flange_h = 1.2; // [0.6:0.2:3] Flange thickness (mm)
hub_d = 16; // [8:0.5:40] Hub diameter (mm)
hub_h = 7; // [0:0.5:20] Hub height (mm)
set_screw = true; // M3 set-screw hole in the hub

/* [Hidden] */
$fn = 64;
pitch = 2;
pd = teeth * pitch / PI;
od = pd - 2 * 0.254;
tooth_h = belt_width + 1;
module gt2_profile() {
  difference() {
    circle(d = od);
    for (i = [0 : teeth - 1]) rotate(i * 360 / teeth) translate([od / 2, 0]) {
      // approximate GT2 groove: 0.76 mm deep, rounded
      translate([-0.75 + 0.555 - tooth_fit, 0]) circle(r = 0.555 + tooth_fit, $fn = 20);
      translate([-0.2, 0]) square([1, 1.1 + 2 * tooth_fit], center = true);
    }
  }
}
fl_d = od + 4;
z_t = flanges ? flange_h : 0;
difference() {
  union() {
    if (hub_h > 0) cylinder(d = hub_d, h = hub_h);
    translate([0, 0, hub_h]) {
      if (flanges) cylinder(d = fl_d, h = flange_h);
      translate([0, 0, z_t - 0.01]) linear_extrude(tooth_h + 0.02) gt2_profile();
      if (flanges) translate([0, 0, z_t + tooth_h]) cylinder(d = fl_d, h = flange_h);
    }
  }
  translate([0, 0, -1]) cylinder(d = bore + 0.15, h = 100);
  if (set_screw && hub_h >= 5) translate([0, 0, hub_h / 2]) rotate([0, 90, 0]) {
    cylinder(d = 2.9, h = hub_d);
    // M3 nut trap
    translate([0, 0, bore / 2 + 1]) rotate([0, 0, 30]) hull() {
      cylinder(d = 6.4, h = 2.8, $fn = 6);
      translate([-hub_h, 0, 0]) cylinder(d = 6.4, h = 2.8, $fn = 6);
    }
  }
}
echo(str("INFO: Pitch diameter ", round(pd * 100) / 100, " mm, outside diameter ", round(od * 100) / 100, " mm. Travel per revolution ", teeth * pitch, " mm."));
echo("INFO: Tooth shape is an approximation of the GT2 profile - print one and test the belt fit.");
`},
{
  id: 'bolt-nut', cat: 'mech', name: 'Metric Bolt & Nut',
  desc: 'Printable ISO metric bolt and matching nut with adjustable thread clearance.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/screws.scad>
/* [Thread] */
size = "M8"; // [M5, M6, M8, M10, M12, M16, M20]
length = 25; // [6:1:120] Bolt length under the head (mm)
head = "hex"; // [hex:Hex, socket:Socket cap, button:Button, flat:Flat countersunk]
drive = "none"; // [none:None, hex:Hex key, phillips:Phillips, slot:Slot]
clearance = 0.15; // [0:0.05:0.5] Print clearance per side (mm)

/* [Parts] */
part = "both"; // [both:Bolt and nut, bolt:Bolt only, nut:Nut only]

/* [Hidden] */
$fn = 48;
$slop = clearance;
spec = str(size, ",", length);
if (part != "nut")
  screw(spec, head = head, drive = drive == "none" ? undef : drive, anchor = TOP, orient = DOWN);
if (part != "bolt")
  right(part == "both" ? 30 : 0) nut(size, anchor = BOTTOM);
echo(str("INFO: ", size, " x ", length, " mm, ", head, " head. Print the bolt head-down; use 0.12-0.16 mm layers for small threads."));
`},
{
  id: 'spring', cat: 'mech', name: 'Compression Spring',
  desc: 'Helical spring with adjustable coil diameter, wire, turns and ground ends.',
  scad: `/* [Spring] */
outer_d = 20; // [5:0.5:100] Outer diameter (mm)
wire = 2; // [0.8:0.1:6] Wire / coil thickness (mm)
turns = 6; // [2:0.5:30] Active turns
pitch = 6; // [2:0.5:30] Pitch per turn (mm)
flat_ends = true; // Closed flat ends (sits level)

/* [Hidden] */
$fn = 32;
r = (outer_d - wire) / 2;
h = turns * pitch;
slices = max(40, turns * 36);
module coil(hh, tw) linear_extrude(hh, twist = -tw, slices = max(10, round(tw / 10)), convexity = 10) translate([r, 0]) circle(d = wire);
union() {
  if (flat_ends) {
    linear_extrude(wire) difference() { circle(d = outer_d); circle(d = outer_d - 2 * wire); }
    translate([0, 0, h + wire - 0.01]) linear_extrude(wire) difference() { circle(d = outer_d); circle(d = outer_d - 2 * wire); }
  }
  translate([0, 0, flat_ends ? wire - 0.01 : 0]) coil(h + 0.02, 360 * turns);
}
echo(str("INFO: Free length ", h + (flat_ends ? 2 * wire : 0), " mm, solid height about ", turns * wire + (flat_ends ? 2 * wire : 0), " mm. Print in PETG/TPU; PLA springs creep."));
`},
{
  id: 'knob', cat: 'mech', name: 'Control Knob',
  desc: 'Knurled knob for potentiometer or encoder shafts (D-shaft or round), with pointer line.',
  scad: `/* [Knob] */
knob_d = 25; // [10:0.5:80] Knob diameter (mm)
knob_h = 15; // [6:0.5:40] Knob height (mm)
grips = 24; // [0:1:60] Number of grip ridges (0 = smooth)
top_chamfer = 1.5; // [0:0.25:5] Top edge chamfer (mm)
pointer = true; // Pointer groove on top

/* [Shaft] */
shaft = "d"; // [d:D-shaft, round:Round + set screw, knurled:Knurled 18T (pots)]
shaft_d = 6; // [2:0.05:12] Shaft diameter (mm)
flat = 4.5; // [1:0.05:12] D-shaft across-flat size (mm)
shaft_depth = 11; // [4:0.5:30] Shaft hole depth (mm)
fit = 0.15; // [0:0.05:0.5] Shaft clearance (mm)

/* [Hidden] */
$fn = 64;
difference() {
  union() {
    cylinder(d = knob_d, h = knob_h - top_chamfer);
    translate([0, 0, knob_h - top_chamfer - 0.01]) cylinder(d1 = knob_d, d2 = knob_d - 2 * top_chamfer, h = top_chamfer + 0.01);
  }
  if (grips > 0) for (i = [0 : grips - 1]) rotate(i * 360 / grips) translate([knob_d / 2 + 0.3, 0, -1]) cylinder(d = max(1, knob_d * PI / grips * 0.45), h = knob_h + 2, $fn = 16);
  if (pointer) translate([knob_d / 4, 0, knob_h - 0.8]) cube([knob_d / 2, 1.2, 2], center = true);
  translate([0, 0, -0.01]) intersection() {
    cylinder(d = shaft_d + 2 * fit, h = shaft_depth);
    if (shaft == "d") translate([-(shaft_d) / 2 - 1, -(shaft_d + 2) / 2, 0]) cube([flat + fit + 1, shaft_d + 2, shaft_depth]);
  }
  if (shaft == "round") translate([0, 0, shaft_depth / 2]) rotate([0, 90, 0]) cylinder(d = 2.6, h = knob_d);
}
if (shaft == "knurled") for (i = [0 : 17]) rotate(i * 20) translate([shaft_d / 2 + fit, 0, 0]) cylinder(d = 0.5, h = shaft_depth, $fn = 8);
echo(str("INFO: Shaft hole ", shaft_d + 2 * fit, " mm", shaft == "d" ? str(", flat at ", flat + fit, " mm") : "", ". Print top-down if you want a clean top surface."));
`},
...MORE_1,
...MORE_2,
...LASER,
];
