// More parametric generators (Mesh Studio originals, OpenSCAD + Customizer annotations).
// Part 1: organisation, household, adapters, electronics, workshop, desk.
// The catalogue of LazyFabrication.com was used only as a list of ideas; every model here is written from scratch.

const RR = `module rr(x, y, r) { offset(r) offset(-r) square([x, y], center = true); }`;

export const MORE_1 = [
// ───────────────────────────── ORGANIZATION ─────────────────────────────
{
  id: 'box', cat: 'org', name: 'Box',
  desc: 'Open storage box with configurable walls, floor and rounded corners; optional lid.',
  scad: `/* [Size] */
width = 80; // [10:1:300] Outer width (mm)
depth = 60; // [10:1:300] Outer depth (mm)
height = 40; // [5:1:300] Outer height (mm)
wall = 1.6; // [0.8:0.2:6] Wall thickness (mm)
floor_t = 1.6; // [0.6:0.2:6] Floor thickness (mm)
corner = 4; // [0:0.5:30] Corner radius (mm)

/* [Lid] */
lid = false; // Make a matching lid (placed beside the box)
lid_t = 1.6; // [0.8:0.2:5] Lid thickness (mm)
fit = 0.25; // [0:0.05:1] Lid lip clearance (mm)

/* [Hidden] */
$fn = 48;
${RR}
r = max(0.01, corner);
difference() {
  linear_extrude(height) rr(width, depth, r);
  translate([0, 0, floor_t]) linear_extrude(height) rr(width - 2 * wall, depth - 2 * wall, max(0.01, r - wall));
}
if (lid) translate([width + 10, 0, 0]) {
  linear_extrude(lid_t) rr(width, depth, r);
  translate([0, 0, lid_t - 0.01]) difference() {
    linear_extrude(4) rr(width - 2 * wall - 2 * fit, depth - 2 * wall - 2 * fit, max(0.01, r - wall - fit));
    translate([0, 0, -1]) linear_extrude(6) rr(width - 4 * wall - 2 * fit, depth - 4 * wall - 2 * fit, max(0.01, r - 2 * wall - fit));
  }
}
echo(str("INFO: Inside ", width - 2 * wall, " x ", depth - 2 * wall, " x ", height - floor_t, " mm, volume ", round((width - 2 * wall) * (depth - 2 * wall) * (height - floor_t) / 1000), " ml"));
`},
{
  id: 'drawer-divider', cat: 'org', name: 'Drawer Divider',
  desc: 'Organizer tray with rows and columns of compartments, sized to your drawer.',
  scad: `/* [Size] */
width = 150; // [20:1:400] Outer width (mm)
depth = 100; // [20:1:400] Outer depth (mm)
height = 35; // [5:1:150] Height (mm)
columns = 3; // [1:1:12] Compartments across
rows = 2; // [1:1:12] Compartments deep
wall = 1.6; // [0.8:0.2:5] Outer wall (mm)
divider = 1.2; // [0.6:0.2:5] Divider thickness (mm)
floor_t = 1.2; // [0.6:0.2:5] Floor (mm)
corner = 3; // [0:0.5:20] Corner radius (mm)

/* [Hidden] */
$fn = 40;
${RR}
cw = (width - 2 * wall - (columns - 1) * divider) / columns;
cd = (depth - 2 * wall - (rows - 1) * divider) / rows;
difference() {
  linear_extrude(height) rr(width, depth, max(0.01, corner));
  for (i = [0 : columns - 1], j = [0 : rows - 1])
    translate([-width / 2 + wall + i * (cw + divider) + cw / 2, -depth / 2 + wall + j * (cd + divider) + cd / 2, floor_t])
      linear_extrude(height) rr(cw, cd, min(max(0.01, corner - wall), cw / 2 - 0.01, cd / 2 - 0.01));
}
echo(str("INFO: Each compartment ", round(cw * 10) / 10, " x ", round(cd * 10) / 10, " mm"));
`},
{
  id: 'stackable-bin', cat: 'org', name: 'Stackable Bin',
  desc: 'Open bin with a nesting foot so any number stack vertically.',
  scad: `/* [Size] */
width = 80; // [20:1:250] Width (mm)
depth = 100; // [20:1:250] Depth (mm)
height = 50; // [10:1:200] Height (mm)
wall = 1.6; // [0.8:0.2:5] Wall (mm)
floor_t = 1.6; // [0.8:0.2:5] Floor (mm)
foot = 4; // [2:0.5:12] Nesting foot height (mm)
fit = 0.3; // [0.1:0.05:1] Stacking clearance (mm)
front_opening = true; // Lower front for easy access

/* [Hidden] */
$fn = 40;
${RR}
r = 4;
difference() {
  union() {
    translate([0, 0, foot]) linear_extrude(height - foot) rr(width, depth, r);
    linear_extrude(foot + 0.01) rr(width - 2 * wall - 2 * fit, depth - 2 * wall - 2 * fit, r - wall);
  }
  translate([0, 0, foot + floor_t]) linear_extrude(height) rr(width - 2 * wall, depth - 2 * wall, r - wall);
  if (front_opening) translate([0, -depth / 2, height * 0.55]) rotate([-20, 0, 0]) translate([-width / 2 + wall * 2, -10, 0]) cube([width - 4 * wall, 20, height]);
}
echo("INFO: The foot fits inside the top of an identical bin.");
`},
{
  id: 'sliding-lid-box', cat: 'org', name: 'Sliding-Lid Box',
  desc: 'Box with grooves and a lid that slides in; lid printed beside it.',
  scad: `/* [Size] */
width = 70; // [20:1:250] Width (mm)
depth = 50; // [20:1:250] Depth (mm)
height = 30; // [10:1:150] Height (mm)
wall = 2.4; // [1.6:0.2:6] Wall (mm)
lid_t = 1.6; // [1:0.2:4] Lid thickness (mm)
fit = 0.3; // [0.1:0.05:1] Lid clearance (mm)
finger_notch = true; // Notch to push the lid

/* [Hidden] */
$fn = 40;
g = lid_t + fit;
difference() {
  cube([width, depth, height]);
  translate([wall, wall, wall]) cube([width - 2 * wall, depth - 2 * wall, height]);
  // groove + slot
  translate([wall / 2, wall / 2, height - wall / 2 - g]) cube([width - wall, depth, g]);
  translate([wall, wall, height - wall / 2 - g]) cube([width - 2 * wall, depth, wall]);
}
translate([width + 10, 0, 0]) difference() {
  cube([width - wall - fit * 2, depth - wall / 2 - fit, lid_t]);
  if (finger_notch) translate([(width - wall) / 2, depth - wall - 8, lid_t]) scale([1, 0.6, 0.35]) sphere(d = 14);
}
echo(str("INFO: Inside ", width - 2 * wall, " x ", depth - 2 * wall, " x ", height - wall * 1.5 - g, " mm. Slide the lid in from the open end."));
`},
{
  id: 'wall-bin', cat: 'org', name: 'Wall Bin',
  desc: 'Open-front bin with a sloped front and screw holes for mounting on a wall.',
  scad: `/* [Size] */
width = 100; // [30:1:300] Width (mm)
depth = 60; // [20:1:200] Depth (mm)
height = 70; // [20:1:250] Back height (mm)
front_h = 40; // [10:1:250] Front height (mm)
wall = 2; // [1.2:0.2:5] Wall (mm)
screw_d = 4.5; // [2:0.5:8] Screw hole (mm)

/* [Hidden] */
$fn = 32;
module shape(o, extra = 0) hull() {
  translate([o, o, o]) cube([width - 2 * o, 0.01, height - o + extra]);
  translate([o, o, o]) cube([width - 2 * o, depth - 2 * o, 0.01]);
  translate([o, depth - o - 0.01, o]) cube([width - 2 * o, 0.01, front_h - o + extra]);
}
difference() {
  shape(0);
  shape(wall, 1);
  for (x = [width * 0.25, width * 0.75]) translate([x, -1, height - 12]) rotate([-90, 0, 0]) {
    cylinder(d = screw_d, h = wall + 2);
    translate([0, 0, wall - 0.5]) cylinder(d1 = screw_d, d2 = screw_d * 2, h = 1.6);
  }
}
echo("INFO: Print standing on its back for strong walls, or on its floor without supports.");
`},
{
  id: 'storage-basket', cat: 'org', name: 'Storage Basket',
  desc: 'Ventilated basket with a hexagon or slot pattern in the walls.',
  scad: `/* [Size] */
width = 120; // [30:1:300] Width (mm)
depth = 90; // [30:1:300] Depth (mm)
height = 60; // [15:1:200] Height (mm)
wall = 2; // [1.2:0.2:5] Wall (mm)
pattern = "hex"; // [hex:Hexagons, slots:Vertical slots] Pattern
hole = 8; // [3:0.5:20] Hole size (mm)
web = 2.5; // [1.2:0.2:8] Bar between holes (mm)
margin = 8; // [3:1:30] Solid margin top and bottom (mm)

/* [Hidden] */
$fn = 32;
${RR}
module side_pattern(len, h) {
  p = hole + web;
  nx = floor((len - 2 * margin) / p); nz = floor((h - 2 * margin) / p);
  for (i = [0 : nx - 1], k = [0 : max(0, nz - 1)])
    translate([-(nx - 1) * p / 2 + i * p + (pattern == "hex" && k % 2 ? p / 2 : 0) * (i < nx - 1 ? 1 : 0), 0, margin + hole / 2 + k * p])
      rotate([90, 0, 0]) if (pattern == "hex") rotate(30) cylinder(d = hole, h = 50, center = true, $fn = 6);
      else hull() { translate([0, -hole / 2 + hole / 4]) cylinder(d = hole / 2, h = 50, center = true); translate([0, hole / 2 - hole / 4]) cylinder(d = hole / 2, h = 50, center = true); }
}
difference() {
  linear_extrude(height) rr(width, depth, 6);
  translate([0, 0, wall]) linear_extrude(height) rr(width - 2 * wall, depth - 2 * wall, 6 - wall);
  translate([0, depth / 2, 0]) side_pattern(width, height);
  translate([0, -depth / 2, 0]) side_pattern(width, height);
  rotate(90) translate([0, width / 2, 0]) side_pattern(depth, height);
  rotate(90) translate([0, -width / 2, 0]) side_pattern(depth, height);
}
`},
{
  id: 'desk-tray', cat: 'org', name: 'Desk Tray',
  desc: 'Low tray with rounded inside edges for keys, coins and small parts.',
  scad: `/* [Size] */
width = 140; // [30:1:300] Width (mm)
depth = 80; // [30:1:300] Depth (mm)
height = 18; // [6:1:80] Height (mm)
wall = 2.4; // [1.2:0.2:6] Wall (mm)
corner = 12; // [2:1:40] Corner radius (mm)
compartments = 2; // [1:1:6] Compartments

/* [Hidden] */
$fn = 48;
${RR}
cw = (width - 2 * wall - (compartments - 1) * wall) / compartments;
difference() {
  linear_extrude(height) rr(width, depth, corner);
  for (i = [0 : compartments - 1]) translate([-width / 2 + wall + cw / 2 + i * (cw + wall), 0, wall])
    hull() {
      translate([0, 0, 3]) linear_extrude(height) rr(cw, depth - 2 * wall, max(1, corner - wall));
      linear_extrude(0.01) rr(cw - 6, depth - 2 * wall - 6, max(1, corner - wall - 3));
    }
}
`},
{
  id: 'pen-cup', cat: 'org', name: 'Pen Cup',
  desc: 'Round or hexagonal pen holder, optionally twisted, with a solid base.',
  scad: `/* [Shape] */
diameter = 70; // [30:1:150] Outer diameter (mm)
height = 100; // [30:1:200] Height (mm)
sides = 6; // [3:1:64] Sides (64 = round)
twist = 30; // [0:5:180] Twist (degrees)
wall = 2; // [1.2:0.2:5] Wall (mm)
base = 3; // [1:0.5:10] Base thickness (mm)

/* [Hidden] */
difference() {
  linear_extrude(height, twist = twist, slices = max(1, twist / 3)) circle(d = diameter, $fn = sides);
  translate([0, 0, base]) linear_extrude(height, twist = twist * (height - base) / height, slices = max(1, twist / 3)) circle(d = diameter - 2 * wall / cos(180 / sides), $fn = sides);
}
`},
// ───────────────────────────── HOUSEHOLD ─────────────────────────────
{
  id: 'funnel', cat: 'house', name: 'Funnel',
  desc: 'Custom funnel: mouth and spout diameter, cone angle, spout length and wall thickness.',
  scad: `/* [Funnel] */
mouth_d = 100; // [20:1:250] Mouth inside diameter (mm)
spout_d = 12; // [3:0.5:60] Spout inside diameter (mm)
cone_h = 60; // [10:1:200] Cone height (mm)
spout_len = 30; // [5:1:150] Spout length (mm)
spout_taper = 2; // [0:0.5:10] Spout narrows by (mm)
wall = 1.6; // [0.8:0.2:5] Wall (mm)
rim = 4; // [0:1:15] Flat rim width (mm)
vent = true; // Air vent rib on the spout

/* [Hidden] */
$fn = 96;
pts_out = [[spout_d / 2 - spout_taper / 2 + wall, 0], [spout_d / 2 + wall, spout_len], [mouth_d / 2 + wall, spout_len + cone_h], [mouth_d / 2 + wall + rim, spout_len + cone_h], [mouth_d / 2 + wall + rim, spout_len + cone_h + wall]];
pts_in = [[mouth_d / 2, spout_len + cone_h + wall + 1], [mouth_d / 2, spout_len + cone_h], [spout_d / 2, spout_len], [spout_d / 2 - spout_taper / 2, -1]];
difference() {
  rotate_extrude() polygon(concat([[0, 0]], [for (p = pts_out) p], [[0, spout_len + cone_h + wall]]));
  rotate_extrude() polygon(concat([[0, -1]], [for (i = [len(pts_in) - 1 : -1 : 0]) pts_in[i]], [[0, spout_len + cone_h + wall + 1]]));
}
if (vent) translate([spout_d / 2 + wall - 0.5, -0.6, 0]) cube([1.2, 1.2, spout_len * 0.8]);
echo(str("INFO: Cone angle ", round(atan((mouth_d - spout_d) / 2 / cone_h) * 10) / 10, " degrees from vertical"));
`},
{
  id: 'threaded-container', cat: 'house', name: 'Threaded Container',
  desc: 'Jar with a screw-on lid and printable trapezoidal threads.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/threading.scad>
/* [Jar] */
inner_d = 50; // [15:1:150] Inside diameter (mm)
height = 60; // [15:1:200] Body height below the thread (mm)
wall = 2; // [1.2:0.2:5] Wall (mm)
floor_t = 2; // [1:0.5:5] Floor (mm)

/* [Thread] */
thread_h = 12; // [6:1:30] Thread length (mm)
pitch = 3; // [1.5:0.5:6] Thread pitch (mm)
clearance = 0.4; // [0.1:0.05:1] Lid clearance (mm)

/* [Hidden] */
$fn = 96;
td = inner_d + 2 * wall + 2 * pitch * 0.5;
// body
difference() {
  union() {
    cyl(d = inner_d + 2 * wall + 2 * pitch, h = height, anchor = BOTTOM, rounding1 = 2);
    up(height - 0.01) trapezoidal_threaded_rod(d = td, l = thread_h, pitch = pitch, thread_angle = 30, anchor = BOTTOM, $fn = 64);
  }
  up(floor_t) cyl(d = inner_d, h = height + thread_h, anchor = BOTTOM);
}
// lid, beside
right(td + 2 * wall + 2 * pitch + 10) difference() {
  cyl(d = td + 2 * wall + 2 * pitch, h = thread_h + 2 + wall, anchor = BOTTOM, rounding2 = 1.5);
  for (a = [0 : 15 : 345]) zrot(a) right((td + 2 * wall + 2 * pitch) / 2 + 0.6) down(1) cyl(d = 2.4, h = thread_h + wall + 4, anchor = BOTTOM, $fn = 12);
  up(wall) trapezoidal_threaded_rod(d = td + 2 * clearance, l = thread_h + 4, pitch = pitch, thread_angle = 30, internal = true, anchor = BOTTOM, $fn = 64);
}
echo(str("INFO: Volume ", round(PI * pow(inner_d / 2, 2) * (height + thread_h - floor_t) / 1000), " ml. Print the lid upside down (as shown)."));
`},
{
  id: 'measuring-scoop', cat: 'house', name: 'Measuring Scoop',
  desc: 'Scoop with an exact volume: enter millilitres, get the right cup size.',
  scad: `/* [Scoop] */
volume_ml = 15; // [1:0.5:500] Volume (ml)
wall = 1.6; // [1:0.2:4] Wall (mm)
handle_len = 70; // [20:1:200] Handle length (mm)
label = true; // Emboss the volume on the handle

/* [Hidden] */
$fn = 72;
// cylinder cup with height = diameter: V = pi r^2 * 2r
r = pow(volume_ml * 1000 / (2 * PI), 1 / 3);
h = 2 * r;
difference() {
  union() {
    cylinder(r = r + wall, h = h + wall);
    translate([0, -5, 0]) cube([r + handle_len, 10, 3]);
  }
  translate([0, 0, wall]) cylinder(r = r, h = h + 1);
}
if (label) translate([r + wall + handle_len / 2, 0, 3]) linear_extrude(0.8) text(str(volume_ml, " ml"), size = 5, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
echo(str("INFO: Cup inside ", round(2 * r * 10) / 10, " mm wide and deep, level full = ", volume_ml, " ml"));
`},
{
  id: 'planter-pot', cat: 'house', name: 'Planter Pot',
  desc: 'Tapered plant pot with drainage holes and a matching saucer.',
  scad: `/* [Pot] */
top_d = 100; // [30:1:250] Top diameter (mm)
bottom_d = 75; // [20:1:250] Bottom diameter (mm)
height = 90; // [20:1:250] Height (mm)
wall = 2; // [1.2:0.2:5] Wall (mm)
sides = 64; // [3:1:64] Sides (64 = round)
holes = 5; // [0:1:12] Drainage holes
saucer = true; // Make a saucer

/* [Hidden] */
difference() {
  cylinder(d1 = bottom_d, d2 = top_d, h = height, $fn = sides);
  translate([0, 0, wall]) cylinder(d1 = bottom_d - 2 * wall, d2 = top_d - 2 * wall, h = height, $fn = sides);
  if (holes > 0) for (i = [0 : holes - 1]) rotate(i * 360 / holes) translate([holes > 1 ? bottom_d / 4 : 0, 0, -1]) cylinder(d = 6, h = wall + 2, $fn = 24);
  translate([0, 0, -1]) cylinder(d = holes ? 6 : 0.01, h = wall + 2, $fn = 24);
}
if (saucer) translate([top_d / 2 + bottom_d / 2 + 15, 0, 0]) difference() {
  cylinder(d1 = bottom_d + 14, d2 = bottom_d + 22, h = 12, $fn = sides);
  translate([0, 0, 2]) cylinder(d1 = bottom_d + 10, d2 = bottom_d + 18, h = 12, $fn = sides);
}
echo(str("INFO: Soil volume about ", round(PI * height / 3 * (pow(bottom_d / 2 - wall, 2) + (bottom_d / 2 - wall) * (top_d / 2 - wall) + pow(top_d / 2 - wall, 2)) / 1000), " ml"));
`},
{
  id: 'coaster', cat: 'house', name: 'Coaster',
  desc: 'Round or square coaster with a raised rim and a decorative pattern.',
  scad: `/* [Coaster] */
size = 95; // [50:1:150] Diameter / width (mm)
shape = "round"; // [round:Round, square:Square, hex:Hexagon] Shape
thickness = 4; // [2:0.5:10] Thickness (mm)
rim = 3; // [0:0.5:8] Rim width (mm)
pattern = "rings"; // [none:None, rings:Rings, grid:Grid] Pattern depth 1 mm

/* [Hidden] */
$fn = 96;
module outline(d) if (shape == "round") circle(d = d); else if (shape == "hex") circle(d = d, $fn = 6); else offset(5) offset(-5) square(d, center = true);
difference() {
  linear_extrude(thickness) outline(size);
  translate([0, 0, thickness - 1]) linear_extrude(2) intersection() {
    outline(size - 2 * rim);
    if (pattern == "rings") for (r = [4 : 6 : size]) difference() { circle(d = r + 2); circle(d = r); }
    else if (pattern == "grid") for (x = [-size : 6 : size]) { translate([x, 0]) square([1.2, 2 * size], center = true); translate([0, x]) square([2 * size, 1.2], center = true); }
    else outline(size - 2 * rim);
  }
}
`},
{
  id: 'napkin-ring', cat: 'house', name: 'Napkin Ring',
  desc: 'Napkin ring with optional name cut through the band.',
  scad: `/* [Ring] */
inner_d = 40; // [20:1:80] Inside diameter (mm)
width = 25; // [8:1:60] Band width (mm)
wall = 2.4; // [1.2:0.2:6] Wall (mm)
name = "NAME"; // Name (empty for none)

/* [Hidden] */
$fn = 96;
difference() {
  cylinder(d = inner_d + 2 * wall, h = width);
  translate([0, 0, -1]) cylinder(d = inner_d, h = width + 2);
  if (len(name) > 0) for (i = [0 : len(name) - 1]) rotate(-90 + (i - (len(name) - 1) / 2) * 15) translate([inner_d / 2 - 1, 0, width / 2]) rotate([90, 0, 90])
    translate([0, 0, wall]) linear_extrude(2) text(name[i], size = min(width * 0.55, 12), halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
}
`},
{
  id: 'bag-clip', cat: 'house', name: 'Bag Clip',
  desc: 'Snap clip for closing chip and freezer bags, any length.',
  scad: `/* [Clip] */
length = 100; // [40:1:200] Length (mm)
width = 10; // [6:1:20] Width (mm)
thickness = 3; // [2:0.5:6] Arm thickness (mm)
gap = 0.6; // [0.2:0.1:2] Closed gap (mm)

/* [Hidden] */
$fn = 48;
r = thickness + gap / 2 + 2;
// two arms joined by a C-shaped spring; the latch hook closes the open end
linear_extrude(width) {
  translate([0, gap / 2]) square([length, thickness]);
  translate([0, -gap / 2 - thickness]) square([length - 3, thickness]);
  difference() { circle(r = r); circle(r = r - thickness * 0.8); translate([0, -r]) square([r, 2 * r]); }
  translate([length - 0.01, -gap / 2 - thickness - 1.5]) square([thickness, gap + 2 * thickness + 1.5]);
  translate([length - 4, -gap / 2 - thickness - 1.5]) square([4, 1.5]);
}
echo("INFO: Print flat. Push the lower arm past the hook to lock.");
`},
{
  id: 'door-wedge', cat: 'house', name: 'Door Wedge',
  desc: 'Door stop wedge with grip ribs and a hanging hole.',
  scad: `/* [Wedge] */
length = 120; // [50:1:250] Length (mm)
width = 40; // [20:1:100] Width (mm)
height = 25; // [8:1:60] Tall end height (mm)
ribs = true; // Grip ribs on the slope
hole = true; // Hanging hole

/* [Hidden] */
$fn = 32;
difference() {
  rotate([90, 0, 0]) translate([0, 0, -width / 2]) linear_extrude(width) polygon([[0, 0], [length, 0], [length, height], [length - 6, height], [0, 1.5]]);
  if (ribs) for (x = [12 : 8 : length - 15]) translate([x, 0, (x / length) * height + 0.6]) rotate([0, -atan(height / length), 0]) cube([2, width + 2, 2.4], center = true);
  if (hole) translate([length - 12, 0, -1]) cylinder(d = 8, h = height + 2);
}
`},
{
  id: 'soap-dish', cat: 'house', name: 'Soap Dish',
  desc: 'Draining soap dish with raised ribs and drain slots.',
  scad: `/* [Dish] */
width = 110; // [50:1:180] Width (mm)
depth = 75; // [40:1:150] Depth (mm)
height = 18; // [8:1:40] Height (mm)
ribs = 7; // [3:1:15] Ribs

/* [Hidden] */
$fn = 48;
${RR}
difference() {
  linear_extrude(height) rr(width, depth, 15);
  translate([0, 0, 3]) linear_extrude(height) rr(width - 5, depth - 5, 13);
  for (i = [0 : ribs - 1]) translate([-width / 2 + 10 + i * (width - 20) / (ribs - 1), 0, -1]) cylinder(d = 3, h = 5);
}
for (i = [0 : ribs - 1]) translate([-width / 2 + 10 + i * (width - 20) / (ribs - 1) + (width - 20) / (ribs - 1) / 2, 0, 0]) if (i < ribs - 1)
  hull() { translate([0, -depth / 2 + 8, 0]) cylinder(d = 3, h = 8); translate([0, depth / 2 - 8, 0]) cylinder(d = 3, h = 8); }
`},
{
  id: 'toothbrush-holder', cat: 'house', name: 'Toothbrush Holder',
  desc: 'Cup with a top grid of holes for toothbrushes and toothpaste.',
  scad: `/* [Holder] */
diameter = 80; // [40:1:150] Diameter (mm)
height = 100; // [40:1:200] Height (mm)
holes = 4; // [1:1:8] Brush holes
hole_d = 16; // [10:1:40] Hole diameter (mm)
paste_hole = true; // Big hole for toothpaste
wall = 2.4; // [1.2:0.2:5] Wall (mm)

/* [Hidden] */
$fn = 72;
difference() {
  cylinder(d = diameter, h = height);
  translate([0, 0, 3]) cylinder(d = diameter - 2 * wall, h = height - 3 - 4);
  for (i = [0 : holes - 1]) rotate(i * 360 / holes) translate([diameter / 2 - hole_d / 2 - wall * 2, 0, height - 6]) cylinder(d = hole_d, h = 10);
  if (paste_hole) translate([0, 0, height - 6]) cylinder(d = min(32, diameter - 2 * hole_d - 4 * wall), h = 10);
  for (i = [0 : 5]) rotate(i * 60) translate([diameter / 4, 0, -1]) cylinder(d = 5, h = 5);
}
`},
{
  id: 'bottle-cap', cat: 'house', name: 'Bottle Cap',
  desc: 'Screw cap for a threaded neck you measure (thread diameter and pitch).',
  scad: `include <BOSL2/std.scad>
include <BOSL2/threading.scad>
/* [Neck] */
thread_d = 27.4; // [10:0.1:60] Thread outer diameter on the bottle (mm)
pitch = 3.2; // [1:0.1:6] Thread pitch (mm)
thread_len = 10; // [4:0.5:25] Thread length (mm)
clearance = 0.35; // [0:0.05:1] Clearance (mm)
wall = 2; // [1.2:0.2:4] Wall (mm)

/* [Hidden] */
$fn = 96;
difference() {
  cyl(d = thread_d + 2 * clearance + 2 * wall, h = thread_len + wall, anchor = BOTTOM, rounding2 = 1);
  for (a = [0 : 12 : 348]) zrot(a) right((thread_d + 2 * clearance + 2 * wall) / 2 + 0.5) down(1) cyl(d = 2, h = thread_len + wall + 4, anchor = BOTTOM, $fn = 12);
  up(wall) threaded_rod(d = thread_d + 2 * clearance, l = thread_len + 2, pitch = pitch, internal = true, anchor = BOTTOM, $fn = 64);
}
echo("INFO: Measure the outside of the bottle thread with calipers; print with the closed end down.");
`},
// ───────────────────────────── ADAPTERS ─────────────────────────────
{
  id: 'hose-adapter', cat: 'adapt', name: 'Hose Adapter',
  desc: 'Connect two hoses or pipes: stepped or conical adapter with barbs.',
  scad: `/* [Ends] */
d1 = 32; // [4:0.5:150] End A outside diameter (mm)
len1 = 30; // [5:1:150] End A length (mm)
d2 = 20; // [4:0.5:150] End B outside diameter (mm)
len2 = 30; // [5:1:150] End B length (mm)
transition = 15; // [2:1:100] Cone length (mm)
wall = 2; // [1:0.2:6] Wall (mm)
barbs = true; // Ridges to grip hoses
inside = false; // Ends fit INSIDE the pipes (default: hoses slide over)

/* [Hidden] */
$fn = 96;
module end(d, l) { cylinder(d = d, h = l); if (barbs) for (z = [l * 0.25, l * 0.55]) translate([0, 0, z]) cylinder(d1 = d + 1.6, d2 = d, h = 3); }
o1 = inside ? d1 : d1; o2 = inside ? d2 : d2;
difference() {
  union() {
    end(o1, len1);
    translate([0, 0, len1]) cylinder(d1 = o1, d2 = o2, h = transition);
    translate([0, 0, len1 + transition + len2]) mirror([0, 0, 1]) end(o2, len2);
  }
  translate([0, 0, -0.01]) cylinder(d = o1 - 2 * wall, h = len1 + 0.02);
  translate([0, 0, len1]) cylinder(d1 = o1 - 2 * wall, d2 = o2 - 2 * wall, h = transition);
  translate([0, 0, len1 + transition - 0.01]) cylinder(d = o2 - 2 * wall, h = len2 + 0.03);
}
echo(str("INFO: Bores ", d1 - 2 * wall, " mm and ", d2 - 2 * wall, " mm"));
`},
{
  id: 'vesa-adapter', cat: 'adapt', name: 'VESA Adapter',
  desc: 'Plate with 75 x 75 and 100 x 100 mm VESA hole patterns (or custom).',
  scad: `/* [Plate] */
size = 120; // [80:1:250] Plate size (mm)
thickness = 6; // [3:0.5:15] Thickness (mm)
pattern_a = 75; // [50:1:200] Inner pattern (mm)
pattern_b = 100; // [50:1:400] Outer pattern (mm)
hole_d = 4.5; // [3:0.1:9] Hole (M4 = 4.5) (mm)
counterbore = true; // Screw head recess
lightening = true; // Cut-outs to save material

/* [Hidden] */
$fn = 40;
difference() {
  translate([0, 0, thickness / 2]) cube([size, size, thickness], center = true);
  for (p = [pattern_a, pattern_b], sx = [-1, 1], sy = [-1, 1]) if (p <= size - 8) translate([sx * p / 2, sy * p / 2, -1]) {
    cylinder(d = hole_d, h = thickness + 2);
    if (counterbore) translate([0, 0, thickness - 2.5 + 1]) cylinder(d = hole_d * 1.9, h = 4);
  }
  if (lightening) translate([0, 0, -1]) cylinder(d = pattern_a - 2 * hole_d * 2, h = thickness + 2, $fn = 8);
}
`},
{
  id: 'tripod-adapter', cat: 'adapt', name: 'Tripod Adapter',
  desc: 'Block with a printed 1/4"-20 (or 3/8"-16) camera thread to mount anything on a tripod.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/threading.scad>
/* [Adapter] */
thread = "1/4"; // [1/4:1/4"-20 (camera), 3/8:3/8"-16 (tripod head)] Thread
width = 40; // [20:1:100] Plate width (mm)
depth = 40; // [20:1:100] Plate depth (mm)
height = 10; // [6:0.5:30] Plate height (mm)
clearance = 0.2; // [0:0.05:0.6] Thread clearance (mm)

/* [Hidden] */
$fn = 64;
d = thread == "1/4" ? 6.35 : 9.525;
p = thread == "1/4" ? 25.4 / 20 : 25.4 / 16;
difference() {
  cuboid([width, depth, height], rounding = 2, except = BOTTOM, anchor = BOTTOM);
  down(0.01) threaded_rod(d = d + clearance, l = height + 1, pitch = p, internal = true, anchor = BOTTOM, $fn = 48);
}
echo("INFO: A nut-trap version is stronger for heavy loads: drill out and insert a metal 1/4-20 nut if needed.");
`},
{
  id: 'gopro-mount', cat: 'adapt', name: 'GoPro Mount',
  desc: 'Standard 2- or 3-prong action-camera mount on a plate or round base.',
  scad: `/* [Mount] */
prongs = 3; // [2:1:3] Prongs (3 = camera side, 2 = mount side)
base = "plate"; // [plate:Flat plate, round:Round puck] Base
base_size = 30; // [20:1:80] Base size (mm)
base_t = 3; // [2:0.5:8] Base thickness (mm)
hole_d = 5.2; // [4.5:0.1:6] Bolt hole (mm)

/* [Hidden] */
$fn = 48;
pt = 3; gap = 3.2; ph = 15; pw = 15;
module prong() rotate([90, 0, 0]) linear_extrude(pt, center = true) difference() { hull() { translate([-pw / 2, 0]) square([pw, 0.1]); translate([0, ph - pw / 2]) circle(d = pw); } translate([0, ph - pw / 2]) circle(d = hole_d); }
if (base == "plate") translate([0, 0, base_t / 2]) cube([base_size, base_size, base_t], center = true); else cylinder(d = base_size, h = base_t);
n = prongs;
for (i = [0 : n - 1]) translate([0, (i - (n - 1) / 2) * (pt + gap), base_t - 0.01]) prong();
`},
// ───────────────────────────── CABLE & ELECTRONICS ─────────────────────────────
{
  id: 'sd-card-holder', cat: 'elec', name: 'SD Card Holder',
  desc: 'Slotted tray for SD and microSD cards, any number of slots.',
  scad: `/* [Holder] */
sd_slots = 8; // [0:1:30] SD slots
micro_slots = 10; // [0:1:40] microSD slots
pitch = 5; // [3.5:0.5:10] Slot spacing (mm)
depth = 14; // [6:1:24] Slot depth (mm)
fit = 0.3; // [0.1:0.05:0.8] Clearance (mm)

/* [Hidden] */
sd_w = 24 + 2 * fit; sd_t = 2.1 + 2 * fit;
mi_w = 11 + 2 * fit; mi_t = 0.8 + 2 * fit;
rows = (sd_slots > 0 ? 1 : 0) + (micro_slots > 0 ? 1 : 0);
len_x = max(sd_slots, micro_slots) * pitch + 6;
w = (sd_slots > 0 ? sd_w + 6 : 0) + (micro_slots > 0 ? mi_w + 6 : 0) + 2;
difference() {
  translate([0, 0, 0]) cube([len_x, w, depth + 3]);
  if (sd_slots > 0) for (i = [0 : sd_slots - 1]) translate([3 + i * pitch + (pitch - sd_t) / 2, 4, 3]) cube([sd_t, sd_w, depth + 1]);
  if (micro_slots > 0) for (i = [0 : micro_slots - 1]) translate([3 + i * pitch + (pitch - mi_t) / 2, (sd_slots > 0 ? sd_w + 6 : 0) + 4, depth + 3 - 9]) cube([mi_t, mi_w, 10]);
}
`},
{
  id: 'battery-holder', cat: 'elec', name: 'Battery Holder',
  desc: 'Tray with snug pockets for AA, AAA, 18650, CR123 or custom cells.',
  scad: `/* [Cells] */
cell = "AA"; // [AA:AA, AAA:AAA, 18650:18650, CR123:CR123, C:C, D:D, 21700:21700] Cell type
columns = 5; // [1:1:20] Columns
rows = 2; // [1:1:20] Rows
fit = 0.4; // [0.1:0.05:1] Clearance (mm)
depth = 20; // [5:1:60] Pocket depth (mm)
wall = 1.6; // [1:0.2:4] Wall between cells (mm)

/* [Hidden] */
$fn = 48;
cd = cell == "AA" ? 14.5 : cell == "AAA" ? 10.5 : cell == "18650" ? 18.4 : cell == "CR123" ? 17 : cell == "C" ? 26.2 : cell == "D" ? 34.2 : 21.2;
p = cd + fit * 2 + wall;
difference() {
  translate([-wall, -wall, 0]) cube([columns * p + wall, rows * p + wall, depth + 2]);
  for (i = [0 : columns - 1], j = [0 : rows - 1]) translate([i * p + p / 2 - wall / 2, j * p + p / 2 - wall / 2, 2]) cylinder(d = cd + 2 * fit, h = depth + 1);
}
echo(str("INFO: ", columns * rows, " x ", cell, " (", cd, " mm)"));
`},
{
  id: 'fan-grill', cat: 'elec', name: 'Fan Grill',
  desc: 'Guard for 40–140 mm fans with the standard screw spacing and a choice of patterns.',
  scad: `/* [Fan] */
fan = 80; // [40:40 mm, 50:50 mm, 60:60 mm, 70:70 mm, 80:80 mm, 92:92 mm, 120:120 mm, 140:140 mm] Fan size
pattern = "rings"; // [rings:Rings, hex:Hexagons, slots:Slots] Pattern
thickness = 2; // [1.2:0.2:5] Thickness (mm)
bar = 1.6; // [0.8:0.2:4] Bar width (mm)
opening = 6; // [3:0.5:15] Opening size (mm)

/* [Hidden] */
$fn = 64;
spacing = fan == 40 ? 32 : fan == 50 ? 40 : fan == 60 ? 50 : fan == 70 ? 61.5 : fan == 80 ? 71.5 : fan == 92 ? 82.5 : fan == 120 ? 105 : 124.5;
screw = fan <= 50 ? 3.4 : 4.4;
od = fan - 4;
difference() {
  linear_extrude(thickness) offset(4) offset(-4) square(fan, center = true);
  translate([0, 0, -1]) linear_extrude(thickness + 2) intersection() {
    circle(d = od);
    if (pattern == "rings") difference() { circle(d = od); for (r = [opening : opening + bar : od]) difference() { circle(d = r + bar); circle(d = r - 0.01); } circle(d = opening); for (a = [0 : 90 : 270]) rotate(a) translate([0, -bar / 2]) square([od, bar]); }
    else if (pattern == "hex") for (i = [-12 : 12], j = [-12 : 12]) translate([i * (opening + bar) + (j % 2) * (opening + bar) / 2, j * (opening + bar) * 0.866]) circle(d = opening / cos(30), $fn = 6);
    else for (i = [-20 : 20]) translate([i * (opening + bar), 0]) square([opening, od], center = true);
  }
  for (sx = [-1, 1], sy = [-1, 1]) translate([sx * spacing / 2, sy * spacing / 2, -1]) cylinder(d = screw, h = thickness + 2);
}
`},
{
  id: 'cable-clip', cat: 'elec', name: 'Cable Clip',
  desc: 'Snap-in cable clip with a screw tab, for one cable of any diameter.',
  scad: `/* [Clip] */
cable_d = 6; // [2:0.5:20] Cable diameter (mm)
width = 8; // [4:1:20] Width (mm)
wall = 1.8; // [1:0.2:4] Wall (mm)
screw_d = 3.5; // [2:0.5:6] Screw hole (mm)
opening = 0.75; // [0.5:0.05:0.95] Opening (fraction of the cable diameter)

/* [Hidden] */
$fn = 48;
R = cable_d / 2 + wall;
tab = screw_d * 2.5;
difference() {
  linear_extrude(width) difference() {
    union() { translate([0, R]) circle(r = R); translate([-R - tab, 0]) square([2 * R + tab, wall]); }
    translate([0, R]) circle(d = cable_d);
    translate([-cable_d * opening / 2, R + cable_d * 0.3]) square([cable_d * opening, R]);
  }
  translate([-R - tab / 2, -1, width / 2]) rotate([-90, 0, 0]) cylinder(d = screw_d, h = wall + 2);
}
`},
{
  id: 'zip-tie-mount', cat: 'elec', name: 'Zip-Tie Mount',
  desc: 'Square base with a cross tunnel for cable ties, screw or adhesive mounting.',
  scad: `/* [Mount] */
size = 20; // [10:1:40] Base size (mm)
height = 6; // [4:0.5:12] Height (mm)
tie_w = 4; // [2:0.5:9] Tie width (mm)
tie_t = 1.6; // [1:0.1:3] Tie thickness (mm)
screw_d = 3.5; // [0:0.5:6] Screw hole (0 = none) (mm)

/* [Hidden] */
$fn = 32;
difference() {
  hull() { translate([0, 0, 0.75]) cube([size, size, 1.5], center = true); translate([0, 0, height - 1]) cube([size * 0.5, size * 0.5, 2], center = true); }
  for (a = [0, 90]) rotate(a) translate([0, 0, height - 2 - tie_t / 2]) cube([size + 2, tie_w + 0.4, tie_t + 0.4], center = true);
  if (screw_d > 0) translate([0, 0, -1]) cylinder(d = screw_d, h = height + 2);
}
`},
{
  id: 'cable-comb', cat: 'elec', name: 'Cable Comb',
  desc: 'Comb for neat bundles of parallel wires (PC cable sleeving).',
  scad: `/* [Comb] */
columns = 6; // [1:1:16] Columns
rows = 2; // [1:1:6] Rows
cable_d = 3.4; // [1:0.1:8] Cable diameter incl. sleeve (mm)
pitch = 4.2; // [1.5:0.1:12] Cable spacing (mm)
thickness = 3; // [1.5:0.5:8] Thickness (mm)
open = true; // Slots so cables clip in from the side

/* [Hidden] */
$fn = 32;
w = columns * pitch + 3; h = rows * pitch + 3;
linear_extrude(thickness) difference() {
  offset(1.5) offset(-1.5) square([w, h], center = true);
  for (i = [0 : columns - 1], j = [0 : rows - 1]) translate([(i - (columns - 1) / 2) * pitch, (j - (rows - 1) / 2) * pitch]) {
    circle(d = cable_d);
    if (open) translate([-cable_d * 0.3, j < rows / 2 ? -pitch : 0]) square([cable_d * 0.6, pitch]);
  }
}
`},
{
  id: 'desk-grommet', cat: 'elec', name: 'Desk Grommet',
  desc: 'Cable grommet for a desk hole, with a cap that has a cable slot.',
  scad: `/* [Grommet] */
hole_d = 60; // [20:1:100] Desk hole diameter (mm)
desk_t = 25; // [10:1:60] Desk thickness (mm)
flange = 8; // [3:1:20] Flange width (mm)
slot = 20; // [6:1:50] Cable slot width (mm)
fit = 0.3; // [0:0.05:1] Cap clearance (mm)

/* [Hidden] */
$fn = 96;
w = 2;
difference() {
  union() { cylinder(d = hole_d + 2 * flange, h = 2); cylinder(d = hole_d - 0.4, h = desk_t * 0.8); }
  translate([0, 0, 2]) cylinder(d = hole_d - 0.4 - 2 * w, h = desk_t);
  translate([0, 0, -1]) cylinder(d = hole_d - 0.4 - 2 * w - 4, h = 4);
}
translate([hole_d + 2 * flange + 10, 0, 0]) difference() {
  union() { cylinder(d = hole_d - 0.4 - 2 * w + 3, h = 2); cylinder(d = hole_d - 0.4 - 2 * w - 2 * fit, h = 6); }
  translate([hole_d / 2 - slot / 2 - 4, -slot / 2, -1]) cube([hole_d, slot, 10]);
}
`},
{
  id: 'din-clip', cat: 'elec', name: 'DIN Rail Clip',
  desc: '35 mm DIN rail clip with a mounting plate and screw holes.',
  scad: `/* [Clip] */
width = 20; // [8:1:60] Clip width (mm)
plate_l = 50; // [36:1:150] Plate length (mm)
thickness = 3; // [2:0.5:6] Thickness (mm)
hole_d = 3.2; // [2:0.1:6] Plate holes (mm)
fit = 0.2; // [0:0.05:0.6] Rail clearance (mm)

/* [Hidden] */
$fn = 32;
rail = 35 + fit; lip = 1.0 + fit;
rotate([90, 0, 0]) linear_extrude(width, center = true) {
  translate([-plate_l / 2, 0]) square([plate_l, thickness]);
  // fixed hook
  translate([-rail / 2 - 2, -lip - 3]) square([2, lip + 3 + 0.01]);
  translate([-rail / 2 - 2, -lip - 3]) square([4.5, 1.6]);
  // flexible latch
  translate([rail / 2, -lip - 3]) square([1.6, lip + 3 + 0.01]);
  translate([rail / 2 - 2.5, -lip - 3]) polygon([[0, 0], [4.1, 0], [4.1, 1.6], [2.5, 1.6]]);
  translate([rail / 2 + 1.6, -lip - 3]) square([8, 1.6]);
}
`},
{
  id: 'pcb-mount', cat: 'elec', name: 'PCB Mount Plate',
  desc: 'Base plate with standoffs on a rectangular hole pattern (Arduino, Pi and custom).',
  scad: `/* [Board] */
board = "pi"; // [pi:Raspberry Pi (58 x 49), uno:Arduino Uno, custom:Custom] Hole pattern
hole_x = 58; // [10:0.5:200] Custom hole spacing X (mm)
hole_y = 49; // [10:0.5:200] Custom hole spacing Y (mm)
standoff_h = 6; // [2:0.5:20] Standoff height (mm)
screw = 2.5; // [2:0.1:4] Screw size (M) (mm)
plate_t = 2.5; // [1.5:0.5:6] Plate thickness (mm)
margin = 6; // [2:1:20] Plate margin (mm)

/* [Hidden] */
$fn = 32;
pts = board == "pi" ? [[0, 0], [58, 0], [0, 49], [58, 49]] : board == "uno" ? [[14, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]] : [[0, 0], [hole_x, 0], [0, hole_y], [hole_x, hole_y]];
mx = max([for (p = pts) p[0]]); my = max([for (p = pts) p[1]]);
difference() {
  union() {
    translate([-margin, -margin, 0]) cube([mx + 2 * margin, my + 2 * margin, plate_t]);
    for (p = pts) translate([p[0], p[1], 0]) cylinder(d = screw * 2.4, h = plate_t + standoff_h);
  }
  for (p = pts) translate([p[0], p[1], -1]) cylinder(d = screw * 0.85, h = plate_t + standoff_h + 2);
  translate([mx / 2, my / 2, -1]) linear_extrude(plate_t + 2) offset(4) offset(-4) square([max(1, mx - 16), max(1, my - 16)], center = true);
}
`},
{
  id: 'earbud-winder', cat: 'elec', name: 'Cable Winder',
  desc: 'H-shaped winder for earbuds and short cables, with a clip slot.',
  scad: `/* [Winder] */
length = 60; // [30:1:120] Length (mm)
width = 30; // [15:1:60] Width (mm)
thickness = 3; // [2:0.5:6] Thickness (mm)

/* [Hidden] */
$fn = 32;
linear_extrude(thickness) difference() {
  offset(4) offset(-4) square([length, width], center = true);
  for (s = [-1, 1]) translate([s * (length / 2 - 6), 0]) offset(2) offset(-2) square([8, width - 10], center = true);
  translate([0, width / 2]) circle(d = 4);
  translate([-0.75, width / 2 - 6]) square([1.5, 6]);
}
`},
// ───────────────────────────── WORKSHOP ─────────────────────────────
{
  id: 'bit-holder', cat: 'shop', name: 'Hex Bit Holder',
  desc: 'Grid tray of 1/4" hex sockets for screwdriver and drill bits.',
  scad: `/* [Holder] */
columns = 8; // [1:1:20] Columns
rows = 3; // [1:1:10] Rows
across_flats = 6.35; // [4:0.05:12] Bit size across flats (mm)
fit = 0.25; // [0:0.05:0.8] Clearance (mm)
pitch = 11; // [8:0.5:25] Spacing (mm)
height = 14; // [6:1:40] Height (mm)
depth = 11; // [4:1:30] Socket depth (mm)
stepped = true; // Rows step up so back bits are easy to read

/* [Hidden] */
$fn = 6;
d = (across_flats + 2 * fit) / cos(30);
difference() {
  union() for (j = [0 : rows - 1]) translate([0, j * pitch, 0]) cube([columns * pitch, pitch, height + (stepped ? j * 4 : 0)]);
  for (i = [0 : columns - 1], j = [0 : rows - 1]) translate([i * pitch + pitch / 2, j * pitch + pitch / 2, height + (stepped ? j * 4 : 0) - depth]) rotate(30) cylinder(d = d, h = depth + 1);
}
echo(str("INFO: ", columns * rows, " sockets, ", across_flats + 2 * fit, " mm across flats"));
`},
{
  id: 'spool-holder', cat: 'shop', name: 'Spool Holder',
  desc: 'Filament spool axle with flanges and a 608 bearing seat.',
  scad: `/* [Spool] */
spool_hole = 53; // [20:0.5:90] Spool hole diameter (mm)
spool_width = 70; // [30:1:120] Spool width (mm)
bearing = true; // Seat for a 608 bearing (22 x 7 mm)
rod_d = 8.2; // [5:0.1:15] Axle hole (mm)

/* [Hidden] */
$fn = 96;
difference() {
  union() { cylinder(d = spool_hole + 12, h = 3); cylinder(d1 = spool_hole - 0.6, d2 = spool_hole - 3, h = 18); }
  translate([0, 0, -1]) cylinder(d = rod_d, h = 30);
  if (bearing) translate([0, 0, 18 - 7.2]) cylinder(d = 22.2, h = 8);
  for (a = [0 : 60 : 300]) rotate(a) translate([spool_hole / 2 - 9, 0, -1]) cylinder(d = 8, h = 30);
}
echo("INFO: Print two, one for each side of the spool.");
`},
// ───────────────────────────── DESK ─────────────────────────────
{
  id: 'headphone-hook', cat: 'desk', name: 'Headphone Hook',
  desc: 'Under-desk clamp hook for headphones; fits your desk thickness.',
  scad: `/* [Hook] */
desk_t = 25; // [10:0.5:60] Desk thickness (mm)
grip = 40; // [20:1:80] Clamp depth (mm)
width = 25; // [12:1:50] Width (mm)
wall = 5; // [3:0.5:10] Wall (mm)
hook_r = 22; // [12:1:40] Hook radius (mm)

/* [Hidden] */
$fn = 72;
linear_extrude(width) {
  // C clamp around the desk edge
  difference() {
    translate([0, -wall]) square([grip + wall, desk_t + 2 * wall]);
    translate([wall, 0]) square([grip + 1, desk_t]);
  }
  translate([grip - 1, desk_t - 1.5]) square([wall, 1.5]); // grip lip
  // drop and hook under the desk
  translate([0, -wall - 30]) square([wall, 30.01]);
  translate([hook_r, -wall - 30]) difference() { circle(r = hook_r); circle(r = hook_r - wall); translate([-hook_r, 0]) square(2 * hook_r); translate([0, -hook_r]) square([0.01, 0.01]); }
  translate([2 * hook_r - wall, -wall - 30]) square([wall, 12]);
}
echo("INFO: Print on its side as shown; slide onto the desk edge.");
`},
{
  id: 'phone-stand', cat: 'desk', name: 'Phone Stand',
  desc: 'Angled phone stand with a cable slot, for any phone thickness.',
  scad: `/* [Stand] */
width = 70; // [40:1:120] Width (mm)
angle = 65; // [45:1:80] Lean angle (degrees)
phone_t = 12; // [6:0.5:20] Phone thickness incl. case (mm)
back_h = 90; // [50:1:150] Back support length (mm)
cable_slot = true; // Slot for the charging cable

/* [Hidden] */
$fn = 32;
t = 4;
difference() {
  rotate([90, 0, 90]) linear_extrude(width) union() {
    square([back_h * cos(angle) + 30, t]);
    translate([25, 0]) rotate(angle) square([back_h, t]);
    translate([0, 0]) square([t, 14]);
    translate([t + phone_t, 0]) square([t, 9]);
  }
  if (cable_slot) translate([width / 2 - 6, -1, -1]) cube([12, 35, t + 2]);
}
`},
{
  id: 'tablet-stand', cat: 'desk', name: 'Tablet Stand',
  desc: 'Two-angle tablet stand that folds flat in one print.',
  scad: `/* [Stand] */
width = 120; // [60:1:250] Width (mm)
angle = 60; // [40:1:80] Viewing angle (degrees)
tablet_t = 10; // [5:0.5:20] Tablet thickness (mm)
height = 110; // [60:1:200] Back height (mm)

/* [Hidden] */
t = 5;
rotate([90, 0, 90]) linear_extrude(width) {
  square([height * cos(angle) + 45, t]);
  translate([35, 0]) rotate(angle) square([height, t]);
  translate([0, 0]) square([t, 16]);
  translate([t + tablet_t, 0]) square([t, 10]);
  translate([35 + height * cos(angle) * 0.45, 0]) rotate(180 - (90 - angle) - 60) square([height * 0.45, t]);
}
`},
{
  id: 'business-card-holder', cat: 'desk', name: 'Business Card Holder',
  desc: 'Angled desk holder for standard 85 x 55 mm business cards.',
  scad: `/* [Holder] */
card_w = 85; // [50:1:100] Card width (mm)
card_h = 55; // [30:1:70] Card height (mm)
stack = 20; // [5:1:40] Stack thickness (mm)
angle = 20; // [0:1:45] Lean back (degrees)
wall = 2.4; // [1.2:0.2:5] Wall (mm)

/* [Hidden] */
difference() {
  cube([card_w + 2 * wall + 2, stack + 2 * wall + 8, card_h * 0.55]);
  translate([wall, wall + 4, wall]) rotate([-angle, 0, 0]) cube([card_w + 2, stack, card_h * 2]);
  translate([(card_w + 2 * wall + 2) / 2 - 15, -1, card_h * 0.3]) cube([30, wall + 6, card_h]);
}
`},
{
  id: 'bookend', cat: 'desk', name: 'Bookend',
  desc: 'L-shaped bookend with a gusset and non-slip pad recess.',
  scad: `/* [Bookend] */
width = 100; // [50:1:200] Width (mm)
height = 140; // [60:1:250] Height (mm)
base = 110; // [50:1:200] Base length (mm)
t = 4; // [2.4:0.2:8] Thickness (mm)

/* [Hidden] */
cube([width, base, t]);
cube([width, t, height]);
for (x = [0, width - t]) translate([x, 0, 0]) rotate([90, 0, 90]) linear_extrude(t) polygon([[0, 0], [base * 0.6, 0], [0, height * 0.6]]);
`},
{
  id: 'book-stand', cat: 'desk', name: 'Book / Recipe Stand',
  desc: 'Open book stand with page holders and a reading angle.',
  scad: `/* [Stand] */
width = 220; // [100:1:350] Width (mm)
height = 180; // [80:1:300] Back height (mm)
angle = 65; // [40:1:80] Angle (degrees)
lip = 20; // [8:1:40] Front lip height (mm)

/* [Hidden] */
t = 5;
rotate([90, 0, 90]) linear_extrude(width) {
  square([height * cos(angle) + 40, t]);
  translate([30, 0]) rotate(angle) square([height, t]);
  square([t, lip]);
  translate([0, lip - t]) square([18, t]);
}
`},
];
