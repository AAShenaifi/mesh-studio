// More parametric generators, part 2: mechanical, hardware, pegboard, Gridfinity, toys, text, accessories.
// Mesh Studio originals (OpenSCAD + Customizer annotations).

export const MORE_2 = [
// ───────────────────────────── MECHANICAL ─────────────────────────────
{
  id: 'rack-pinion', cat: 'mech', name: 'Rack & Pinion',
  desc: 'Matched gear rack and pinion: turns rotation into straight motion.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/gears.scad>
/* [Gears] */
mod = 1.5; // [0.5:0.25:5] Module (mm)
pinion_teeth = 16; // [8:1:60] Pinion teeth
rack_teeth = 20; // [4:1:100] Rack teeth
thickness = 8; // [3:0.5:30] Face width (mm)
rack_height = 8; // [4:0.5:30] Rack body height (mm)
bore = 5; // [0:0.1:20] Pinion bore (mm)
backlash = 0.1; // [0:0.02:0.4] Backlash (mm)

/* [Hidden] */
$fn = 48;
difference() {
  spur_gear(mod = mod, teeth = pinion_teeth, thickness = thickness, backlash = backlash, anchor = BOTTOM);
  if (bore > 0) down(1) cyl(d = bore, h = thickness + 2, anchor = BOTTOM);
}
back(mod * pinion_teeth / 2 + rack_height + 8) xrot(90) rack(mod = mod, teeth = rack_teeth, thickness = thickness, height = rack_height, backlash = backlash, anchor = FRONT, orient = UP);
echo(str("INFO: Travel per pinion turn ", round(PI * mod * pinion_teeth * 10) / 10, " mm. Pinion centre sits ", mod * pinion_teeth / 2, " mm above the rack pitch line."));
`},
{
  id: 'ring-gear', cat: 'mech', name: 'Ring Gear',
  desc: 'Internal (ring) gear with a backing rim.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/gears.scad>
/* [Ring] */
mod = 1.5; // [0.5:0.25:5] Module (mm)
teeth = 60; // [20:1:200] Teeth
thickness = 8; // [3:0.5:30] Face width (mm)
backing = 4; // [2:0.5:15] Rim thickness (mm)
backlash = 0.1; // [0:0.02:0.4] Backlash (mm)

/* [Hidden] */
$fn = 96;
ring_gear(mod = mod, teeth = teeth, thickness = thickness, backing = backing, backlash = backlash, anchor = BOTTOM);
echo(str("INFO: Pitch diameter ", mod * teeth, " mm"));
`},
{
  id: 'planetary-set', cat: 'mech', name: 'Planetary Gear Set',
  desc: 'Sun, three planets and a ring laid out for printing; teeth counts checked to mesh.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/gears.scad>
/* [Gears] */
mod = 1.25; // [0.5:0.25:4] Module (mm)
sun_teeth = 15; // [8:1:60] Sun teeth
planet_teeth = 12; // [8:1:60] Planet teeth
thickness = 8; // [3:0.5:30] Face width (mm)
backlash = 0.15; // [0:0.02:0.4] Backlash (mm)
sun_bore = 5; // [0:0.1:20] Sun bore (mm)
planet_bore = 3.2; // [0:0.1:10] Planet pin hole (mm)

/* [Hidden] */
$fn = 48;
ring_teeth = sun_teeth + 2 * planet_teeth;
cd = mod * (sun_teeth + planet_teeth) / 2;
module bored(b) difference() { children(); if (b > 0) down(1) cyl(d = b, h = thickness + 2, anchor = BOTTOM); }
bored(sun_bore) spur_gear(mod = mod, teeth = sun_teeth, thickness = thickness, backlash = backlash, anchor = BOTTOM);
for (i = [0 : 2]) zrot(i * 120) right(cd) zrot(planet_teeth % 2 == 0 ? 180 / planet_teeth : 0) bored(planet_bore) spur_gear(mod = mod, teeth = planet_teeth, thickness = thickness, backlash = backlash, anchor = BOTTOM);
right(mod * ring_teeth + 20) ring_gear(mod = mod, teeth = ring_teeth, thickness = thickness, backing = 4, backlash = backlash, anchor = BOTTOM);
echo(str("INFO: Ring ", ring_teeth, " teeth. Ratio (ring fixed, sun in, carrier out) = 1 : ", round((1 + ring_teeth / sun_teeth) * 100) / 100,
  (sun_teeth + ring_teeth) % 3 == 0 ? "" : ". WARNING: (sun + ring) is not divisible by 3, so three evenly spaced planets will not mesh."));
`},
{
  id: 'vbelt-pulley', cat: 'mech', name: 'V-Belt Pulley',
  desc: 'Grooved pulley for V-belts and round belts: diameter, groove profile and hub.',
  scad: `/* [Pulley] */
diameter = 50; // [15:1:250] Outside diameter (mm)
width = 12; // [5:0.5:40] Width (mm)
groove = "v"; // [v:V-belt, round:Round belt] Groove type
belt = 6; // [2:0.5:20] Belt width / cord diameter (mm)
groove_angle = 40; // [30:1:60] V angle (degrees)
bore = 8; // [2:0.1:30] Bore (mm)
hub_d = 20; // [0:1:80] Hub diameter (0 = none) (mm)
hub_h = 8; // [0:1:30] Hub height (mm)
set_screw = true; // M3 set screw in the hub

/* [Hidden] */
$fn = 96;
depth = groove == "v" ? belt * 0.75 : belt * 0.55;
difference() {
  union() {
    cylinder(d = diameter, h = width);
    if (hub_d > 0) cylinder(d = hub_d, h = width + hub_h);
  }
  rotate_extrude() translate([diameter / 2, width / 2]) if (groove == "v") polygon([[0.01, -belt / 2], [-depth, -belt / 2 + depth * tan(groove_angle / 2)], [-depth, belt / 2 - depth * tan(groove_angle / 2)], [0.01, belt / 2]]); else circle(d = belt * 1.05);
  translate([0, 0, -1]) cylinder(d = bore, h = width + hub_h + 2);
  if (set_screw && hub_d > 0 && hub_h > 0) translate([0, 0, width + hub_h / 2]) rotate([0, 90, 0]) cylinder(d = 2.8, h = hub_d);
}
echo(str("INFO: Belt pitch diameter about ", diameter - depth, " mm"));
`},
{
  id: 'sprocket', cat: 'mech', name: 'Chain Sprocket',
  desc: 'Roller-chain sprocket (ANSI 25/35/40 or bike chain) by tooth count.',
  scad: `/* [Sprocket] */
chain = "25"; // [25:ANSI 25 (6.35 mm), 35:ANSI 35 (9.525 mm), 40:ANSI 40 (12.7 mm), bike:Bicycle 1/2 x 1/8] Chain
teeth = 18; // [8:1:80] Teeth
bore = 6; // [2:0.1:40] Bore (mm)
hub_d = 18; // [0:1:80] Hub diameter (mm)
hub_h = 6; // [0:1:30] Hub height (mm)

/* [Hidden] */
$fn = 64;
p = chain == "25" ? 6.35 : chain == "35" ? 9.525 : 12.7;
roller = chain == "25" ? 3.3 : chain == "35" ? 5.08 : chain == "40" ? 7.92 : 7.75;
thick = chain == "25" ? 2.8 : chain == "35" ? 4.3 : chain == "40" ? 7.2 : 2.9;
R = p / (2 * sin(180 / teeth));
od = p * (0.6 + 1 / tan(180 / teeth));
difference() {
  union() {
    linear_extrude(thick) difference() {
      circle(d = od);
      // roller seat plus a flared gap out to the tip, so the teeth stand between the seats
      for (i = [0 : teeth - 1]) rotate(i * 360 / teeth) hull() { translate([R, 0]) circle(d = roller * 1.02); translate([od / 2 + roller, 0]) circle(d = roller * 1.02 + 2 * (od / 2 + roller - R) * tan(180 / teeth) * 0.8); }
    }
    if (hub_d > 0) cylinder(d = hub_d, h = thick + hub_h);
  }
  translate([0, 0, -1]) cylinder(d = bore, h = thick + hub_h + 2);
}
echo(str("INFO: Pitch diameter ", round(2 * R * 100) / 100, " mm, outside ", round(od * 100) / 100, " mm"));
`},
{
  id: 'cam', cat: 'mech', name: 'Cam',
  desc: 'Eccentric or heart-shaped cam (uniform motion) with a shaft bore.',
  scad: `/* [Cam] */
type = "eccentric"; // [eccentric:Eccentric circle, heart:Heart (uniform rise), snail:Snail (drop)] Profile
base_r = 15; // [5:0.5:80] Base radius (mm)
lift = 10; // [1:0.5:60] Lift (mm)
thickness = 6; // [2:0.5:30] Thickness (mm)
bore = 5; // [1:0.1:20] Bore (mm)

/* [Hidden] */
$fn = 120;
function rad(a) = type == "heart" ? base_r + lift * (a <= 180 ? a / 180 : (360 - a) / 180) : base_r + lift * a / 360;
difference() {
  linear_extrude(thickness) if (type == "eccentric") translate([lift / 2, 0]) circle(r = base_r + lift / 2);
  else polygon([for (a = [0 : 2 : 358]) [rad(a) * cos(a), rad(a) * sin(a)]]);
  translate([0, 0, -1]) cylinder(d = bore, h = thickness + 2);
}
echo(str("INFO: Follower travel ", lift, " mm per turn"));
`},
{
  id: 'ratchet-wheel', cat: 'mech', name: 'Ratchet Wheel & Pawl',
  desc: 'Saw-tooth ratchet wheel with a matching pawl.',
  scad: `/* [Ratchet] */
teeth = 20; // [6:1:60] Teeth
diameter = 50; // [15:1:150] Outside diameter (mm)
tooth_h = 4; // [1:0.5:10] Tooth height (mm)
thickness = 6; // [2:0.5:20] Thickness (mm)
bore = 6; // [1:0.1:30] Bore (mm)

/* [Hidden] */
$fn = 64;
R = diameter / 2; r = R - tooth_h;
difference() {
  linear_extrude(thickness) polygon([for (i = [0 : teeth - 1], k = [0, 1]) let(a = (i + k * 0.98) * 360 / teeth, rr = k == 0 ? r : R) [rr * cos(a), rr * sin(a)]]);
  translate([0, 0, -1]) cylinder(d = bore, h = thickness + 2);
}
translate([R + 15, 0, 0]) difference() {
  linear_extrude(thickness) hull() { circle(d = 10); translate([25, 2]) square([1, tooth_h]); }
  translate([0, 0, -1]) cylinder(d = 3.4, h = thickness + 2);
}
`},
// ───────────────────────────── HARDWARE & FASTENERS ─────────────────────────────
{
  id: 'washer', cat: 'fast', name: 'Washer / Spacer',
  desc: 'Flat washer or spacer of any size.',
  scad: `/* [Washer] */
inner_d = 5.3; // [1:0.1:60] Inside diameter (mm)
outer_d = 10; // [3:0.1:120] Outside diameter (mm)
thickness = 1; // [0.4:0.1:40] Thickness (mm)
count = 1; // [1:1:20] How many

/* [Hidden] */
$fn = 64;
for (i = [0 : count - 1]) translate([(i % 5) * (outer_d + 3), floor(i / 5) * (outer_d + 3), 0]) difference() { cylinder(d = outer_d, h = thickness); translate([0, 0, -1]) cylinder(d = inner_d, h = thickness + 2); }
`},
{
  id: 'standoff', cat: 'fast', name: 'Standoff',
  desc: 'Hex or round PCB standoff with screw holes or a nut trap.',
  scad: `/* [Standoff] */
screw = 3; // [2:0.5:6] Screw size M (mm)
height = 10; // [2:0.5:60] Height (mm)
shape = "hex"; // [hex:Hexagon, round:Round] Shape
outer = 6; // [3:0.5:16] Size across flats / diameter (mm)
hole = "through"; // [through:Through hole, tap:Tight hole to tap, nut:Nut trap at the bottom] Hole
count = 4; // [1:1:16] How many

/* [Hidden] */
$fn = 32;
for (i = [0 : count - 1]) translate([(i % 4) * (outer + 5), floor(i / 4) * (outer + 5), 0]) difference() {
  if (shape == "hex") rotate(30) cylinder(d = outer / cos(30), h = height, $fn = 6); else cylinder(d = outer, h = height);
  translate([0, 0, -1]) cylinder(d = hole == "tap" ? screw * 0.85 : screw + 0.3, h = height + 2);
  if (hole == "nut") translate([0, 0, -0.01]) cylinder(d = (screw * 1.8 + 0.3) / cos(30), h = screw * 0.8 + 0.2, $fn = 6);
}
`},
{
  id: 'threaded-rod', cat: 'fast', name: 'Threaded Rod',
  desc: 'Metric threaded rod (or bolt) of any length.',
  scad: `include <BOSL2/std.scad>
include <BOSL2/threading.scad>
/* [Rod] */
diameter = 10; // [4:0.5:40] Thread diameter (mm)
pitch = 1.5; // [0.5:0.25:5] Pitch (mm)
length = 40; // [5:1:200] Length (mm)
clearance = 0.15; // [0:0.05:0.5] Make the thread smaller by (mm)
head = "none"; // [none:None, hex:Hex head, knob:Knurled knob] Head

/* [Hidden] */
$fn = 64;
union() {
  threaded_rod(d = diameter - clearance, l = length, pitch = pitch, anchor = BOTTOM, bevel = true);
  if (head == "hex") down(diameter * 0.65 - 0.01) cyl(d = diameter * 1.6 / cos(30), h = diameter * 0.65, $fn = 6, anchor = BOTTOM);
  if (head == "knob") down(8 - 0.01) cyl(d = diameter * 2.5, h = 8, anchor = BOTTOM, texture = "trunc_ribs", tex_reps = [24, 1]);
}
`},
{
  id: 'thumb-screw', cat: 'fast', name: 'Thumb Screw Knob',
  desc: 'Knurled knob that captures a metric hex bolt head or nut.',
  scad: `/* [Knob] */
screw = 4; // [3:1:10] Bolt size M (mm)
diameter = 22; // [10:1:50] Knob diameter (mm)
height = 10; // [5:0.5:30] Knob height (mm)
grips = 12; // [6:1:30] Grip notches
fit = 0.2; // [0:0.05:0.6] Clearance (mm)

/* [Hidden] */
$fn = 64;
af = screw == 3 ? 5.5 : screw == 4 ? 7 : screw == 5 ? 8 : screw == 6 ? 10 : screw == 8 ? 13 : 16;
difference() {
  cylinder(d = diameter, h = height);
  for (i = [0 : grips - 1]) rotate(i * 360 / grips) translate([diameter / 2 + 0.8, 0, -1]) cylinder(d = 3.5, h = height + 2);
  translate([0, 0, -1]) cylinder(d = screw + 0.4, h = height + 2);
  translate([0, 0, -0.01]) cylinder(d = (af + 2 * fit) / cos(30), h = screw * 0.8 + 1, $fn = 6);
}
`},
{
  id: 'wing-nut', cat: 'fast', name: 'Wing Nut',
  desc: 'Printed wing nut with a metric thread (or a hex nut insert).',
  scad: `include <BOSL2/std.scad>
include <BOSL2/threading.scad>
/* [Nut] */
diameter = 8; // [4:1:20] Thread M (mm)
pitch = 1.25; // [0.5:0.25:3] Pitch (mm)
clearance = 0.25; // [0:0.05:0.6] Clearance (mm)
wing_span = 40; // [20:1:80] Wing span (mm)

/* [Hidden] */
$fn = 64;
h = diameter * 1.2;
difference() {
  union() {
    cyl(d = diameter * 2.2, h = h, anchor = BOTTOM);
    for (s = [-1, 1]) hull() { cyl(d = diameter * 1.4, h = h * 0.6, anchor = BOTTOM); right(s * (wing_span / 2 - 5)) up(h * 0.2) cyl(d = 10, h = h * 1.6, anchor = BOTTOM); }
  }
  down(0.5) threaded_rod(d = diameter + clearance, l = h * 3, pitch = pitch, internal = true, anchor = BOTTOM);
}
`},
{
  id: 'drawer-knob', cat: 'hard', name: 'Drawer Knob',
  desc: 'Mushroom or round cabinet knob with a screw or nut recess.',
  scad: `/* [Knob] */
diameter = 30; // [15:1:60] Knob diameter (mm)
height = 25; // [10:1:50] Height (mm)
style = "mushroom"; // [mushroom:Mushroom, cylinder:Cylinder, square:Square] Style
screw = 4; // [3:1:6] Screw M (mm)
nut_trap = true; // Hex nut trap

/* [Hidden] */
$fn = 72;
difference() {
  if (style == "mushroom") rotate_extrude() polygon([[0, 0], [diameter * 0.3, 0], [diameter * 0.22, height * 0.55], [diameter / 2, height * 0.75], [diameter / 2, height * 0.88], [diameter * 0.42, height], [0, height]]);
  else if (style == "cylinder") cylinder(d = diameter, h = height);
  else translate([0, 0, height / 2]) minkowski() { cube([diameter - 4, diameter - 4, height - 4], center = true); sphere(2, $fn = 16); }
  translate([0, 0, -1]) cylinder(d = screw * 0.85, h = height * 0.6);
  if (nut_trap) translate([0, 0, 3]) cylinder(d = (screw * 1.8 + 0.4) / cos(30), h = screw * 0.8 + 0.4, $fn = 6);
}
`},
{
  id: 'shelf-bracket', cat: 'hard', name: 'Shelf Bracket',
  desc: 'L shelf bracket with a gusset and countersunk screw holes.',
  scad: `/* [Bracket] */
length = 100; // [30:1:250] Arm length (mm)
width = 25; // [10:1:60] Width (mm)
t = 5; // [3:0.5:12] Thickness (mm)
screw_d = 4.5; // [3:0.5:8] Screw hole (mm)

/* [Hidden] */
$fn = 32;
difference() {
  union() {
    cube([width, length, t]);
    cube([width, t, length]);
    translate([width / 2 - t / 2, 0, 0]) rotate([90, 0, 90]) linear_extrude(t) polygon([[0, 0], [length * 0.8, 0], [0, length * 0.8]]);
  }
  for (p = [length * 0.4, length * 0.85]) {
    translate([width / 2, p, -1]) { cylinder(d = screw_d, h = t + 2); translate([0, 0, t - screw_d / 2 + 1]) cylinder(d1 = screw_d, d2 = screw_d * 2.2, h = screw_d * 0.6); }
    translate([width / 2, -1, p]) rotate([-90, 0, 0]) { cylinder(d = screw_d, h = t + 2); translate([0, 0, t - screw_d / 2 + 1]) cylinder(d1 = screw_d, d2 = screw_d * 2.2, h = screw_d * 0.6); }
  }
}
`},
{
  id: 'corner-bracket', cat: 'hard', name: 'Corner Bracket',
  desc: 'Right-angle corner bracket for frames and furniture.',
  scad: `/* [Bracket] */
size = 40; // [15:1:100] Leg length (mm)
width = 15; // [8:1:40] Width (mm)
t = 3; // [2:0.5:8] Thickness (mm)
holes = 2; // [1:1:4] Holes per leg
hole_d = 4; // [2:0.5:8] Hole (mm)

/* [Hidden] */
$fn = 32;
difference() {
  union() { cube([size, width, t]); cube([t, width, size]); translate([0, width / 2 - t / 2, 0]) rotate([90, 0, 0]) translate([0, 0, -t]) linear_extrude(t) polygon([[0, 0], [size * 0.5, 0], [0, size * 0.5]]); }
  for (i = [1 : holes]) {
    translate([t + (size - t) * i / (holes + 1), width / 2, -1]) cylinder(d = hole_d, h = t + 2);
    translate([-1, width / 2, t + (size - t) * i / (holes + 1)]) rotate([0, 90, 0]) cylinder(d = hole_d, h = t + 2);
  }
}
`},
{
  id: 'wall-hook', cat: 'hard', name: 'Wall Hook',
  desc: 'Screw-on wall hook with a rounded tip.',
  scad: `/* [Hook] */
plate_h = 60; // [30:1:150] Plate height (mm)
width = 20; // [10:1:50] Width (mm)
reach = 35; // [10:1:100] Hook reach (mm)
t = 5; // [3:0.5:10] Thickness (mm)
screw_d = 4; // [2:0.5:6] Screw hole (mm)

/* [Hidden] */
$fn = 48;
difference() {
  union() {
    translate([0, 0, 0]) cube([width, t, plate_h]);
    translate([0, 0, 0]) cube([width, reach, t]);
    translate([0, reach - t, 0]) cube([width, t, t * 3]);
    translate([width / 2, reach - t / 2, t * 3]) rotate([0, 90, 0]) cylinder(d = t, h = width, center = true);
  }
  for (z = [plate_h * 0.45, plate_h * 0.85]) translate([width / 2, -1, z]) rotate([-90, 0, 0]) { cylinder(d = screw_d, h = t + 2); translate([0, 0, t - 1]) cylinder(d1 = screw_d, d2 = screw_d * 2, h = 1.6); }
}
`},
{
  id: 'hook-rack', cat: 'hard', name: 'Hook Rack',
  desc: 'Wall rack with several hooks for keys, coats or towels.',
  scad: `/* [Rack] */
hooks = 4; // [1:1:12] Hooks
spacing = 40; // [15:1:100] Hook spacing (mm)
height = 50; // [25:1:120] Plate height (mm)
reach = 30; // [10:1:80] Hook reach (mm)
t = 5; // [3:0.5:10] Thickness (mm)

/* [Hidden] */
$fn = 40;
w = hooks * spacing;
difference() {
  cube([w, t, height]);
  for (x = [spacing / 2, w - spacing / 2]) translate([x, -1, height - 10]) rotate([-90, 0, 0]) cylinder(d = 4.5, h = t + 2);
}
for (i = [0 : hooks - 1]) translate([spacing / 2 + i * spacing - 4, 0, height * 0.2]) {
  cube([8, reach, t]);
  translate([0, reach - t, 0]) cube([8, t, 3 * t]);
}
`},
{
  id: 'adhesive-hook', cat: 'hard', name: 'Adhesive Hook',
  desc: 'Small hook with a large flat back for double-sided tape.',
  scad: `/* [Hook] */
pad_w = 30; // [15:1:60] Pad width (mm)
pad_h = 40; // [15:1:80] Pad height (mm)
reach = 15; // [6:1:40] Hook reach (mm)
t = 3; // [2:0.5:6] Thickness (mm)

/* [Hidden] */
$fn = 40;
translate([0, 0, 0]) linear_extrude(t) offset(4) offset(-4) square([pad_w, pad_h], center = true);
translate([-5, -pad_h / 4, 0]) cube([10, t, reach + t]);
translate([-5, -pad_h / 4, reach]) cube([10, 10, t]);
`},
// ───────────────────────────── PEGBOARD ─────────────────────────────
{
  id: 'skadis-hook', cat: 'peg', name: 'SKÅDIS Hook',
  desc: 'Universal hook for the IKEA SKÅDIS pegboard: set reach, width and lip.',
  scad: `/* [Hook] */
reach = 40; // [10:1:120] Reach (mm)
width = 10; // [4.4:0.2:30] Width (mm)
lip = 12; // [0:1:40] Front lip height (mm)
t = 5; // [3:0.5:8] Arm thickness (mm)

/* [Hidden] */
$fn = 32;
board = 5.2; slot_w = 4.6; slot_h = 14;
// clip that goes through a 5 x 15 mm slot and hooks down behind the board
translate([-min(width, slot_w) / 2, 0, 0]) {
  cube([min(width, slot_w), board + 4, 10]);
  translate([0, board + 4 - 3, -6]) cube([min(width, slot_w), 3, 16]);
}
translate([-width / 2, -t, 0]) cube([width, t, 30]);
translate([-width / 2, -reach, 0]) cube([width, reach, t]);
translate([-width / 2, -reach, 0]) cube([width, t, lip + t]);
echo("INFO: Print on its side for strength; the clip fits the 5 x 15 mm SKÅDIS slots.");
`},
{
  id: 'skadis-cup', cat: 'peg', name: 'SKÅDIS Pen Cup',
  desc: 'Round cup for the SKÅDIS pegboard: pens, brushes, screwdrivers.',
  scad: `/* [Cup] */
diameter = 60; // [25:1:120] Inside diameter (mm)
height = 70; // [20:1:150] Height (mm)
wall = 1.8; // [1.2:0.2:4] Wall (mm)
clips = 2; // [1:1:3] Clips (40 mm apart)

/* [Hidden] */
$fn = 72;
board = 5.2;
difference() {
  union() {
    translate([0, diameter / 2 + wall, 0]) cylinder(d = diameter + 2 * wall, h = height);
    translate([-(clips - 1) * 20 - 8, 0, 0]) cube([(clips - 1) * 40 + 16, 4, height]);
  }
  translate([0, diameter / 2 + wall, wall]) cylinder(d = diameter, h = height);
}
for (i = [0 : clips - 1]) translate([-(clips - 1) * 20 + i * 40 - 2.3, -board - 3, height - 14]) {
  cube([4.6, board + 3.01, 10]);
  translate([0, 0, -6]) cube([4.6, 3, 16]);
}
`},
{
  id: 'skadis-angled-cup', cat: 'peg', name: 'SKÅDIS Angled Cup',
  desc: 'SKÅDIS cup with a slanted mouth so the contents face you.',
  scad: `/* [Cup] */
diameter = 50; // [25:1:120] Inside diameter (mm)
back_h = 90; // [30:1:150] Back height (mm)
front_h = 45; // [15:1:150] Front height (mm)
wall = 1.8; // [1.2:0.2:4] Wall (mm)

/* [Hidden] */
$fn = 72;
board = 5.2; D = diameter + 2 * wall;
translate([-28, 0, 0]) cube([56, 4, back_h]);
difference() {
  translate([0, D / 2, 0]) cylinder(d = D, h = back_h);
  translate([0, D / 2, wall]) cylinder(d = diameter, h = back_h);
  // slanted mouth: high at the back (y = 0), low at the front (y = D)
  translate([0, 0, back_h]) rotate([-atan((back_h - front_h) / D), 0, 0]) translate([-D, -D, 0]) cube([2 * D, 4 * D, back_h * 2]);
}
for (x = [-20, 20]) translate([x - 2.3, -board - 3, back_h - 14]) { cube([4.6, board + 3.01, 10]); translate([0, 0, -6]) cube([4.6, 3, 16]); }
`},
{
  id: 'skadis-bin', cat: 'peg', name: 'SKÅDIS Bin',
  desc: 'Open-front parts bin for the SKÅDIS pegboard.',
  scad: `/* [Bin] */
width = 80; // [30:1:200] Width (mm)
depth = 50; // [20:1:150] Depth (mm)
height = 50; // [20:1:150] Back height (mm)
front_h = 25; // [10:1:150] Front height (mm)
wall = 1.8; // [1.2:0.2:4] Wall (mm)

/* [Hidden] */
board = 5.2;
clips = max(1, floor((width - 10) / 40) + 1);
difference() {
  hull() { cube([width, depth, 0.01]); cube([width, 0.01, height]); translate([0, depth - 0.01, 0]) cube([width, 0.01, front_h]); }
  translate([wall, wall, wall]) hull() { cube([width - 2 * wall, depth - 2 * wall, 0.01]); cube([width - 2 * wall, 0.01, height]); translate([0, depth - 2 * wall - 0.01, 0]) cube([width - 2 * wall, 0.01, front_h]); }
}
for (i = [0 : clips - 1]) translate([width / 2 - (clips - 1) * 20 + i * 40 - 2.3, -board - 3, height - 14]) { cube([4.6, board + 3.01, 10]); translate([0, 0, -6]) cube([4.6, 3, 16]); }
`},
{
  id: 'pegboard-hook', cat: 'peg', name: 'Pegboard Hook (1/4")',
  desc: 'Hook for standard 1/4" pegboard (holes on a 1" grid).',
  scad: `/* [Hook] */
reach = 50; // [10:1:150] Reach (mm)
hole_d = 5.5; // [4:0.1:7] Pin diameter (mm)
board = 5; // [3:0.5:8] Board thickness (mm)
double = true; // Two pins (25.4 mm apart) for stability

/* [Hidden] */
$fn = 32;
t = 5;
module pin() { rotate([-90, 0, 0]) cylinder(d = hole_d, h = board + 1); translate([0, board + 1, 0]) rotate([0, 0, 0]) translate([-hole_d / 2, 0, -hole_d / 2]) cube([hole_d, hole_d, 8]); }
for (x = double ? [-12.7, 12.7] : [0]) translate([x, 0, 20]) pin();
translate([-18, -t, 0]) cube([36, t, 28]);
translate([-t / 2, -reach, 0]) cube([t, reach, t]);
translate([-t / 2, -reach, 0]) cube([t, t, 12]);
`},
// ───────────────────────────── GRIDFINITY ─────────────────────────────
{
  id: 'gridfinity-baseplate', cat: 'box', name: 'Gridfinity Baseplate',
  desc: 'Baseplate on the 42 mm Gridfinity grid, any size, optional magnets and screw holes.',
  scad: `/* [Size] */
units_x = 3; // [1:1:10] Units in X
units_y = 3; // [1:1:10] Units in Y
style = "light"; // [light:Light (thin), magnets:With magnet pockets] Style
screw_holes = false; // Countersunk screw hole per cell

/* [Hidden] */
$fn = 40;
g = 42; r = 4;
module rr(x, y, rad) { offset(rad) offset(-rad) square([x, y], center = true); }
base_h = style == "magnets" ? 6.4 : 0;
module socket() hull() {
  // inverse of the bin foot: 0.7 + 1.8 + 2.15 mm profile
  translate([0, 0, base_h + 5]) linear_extrude(0.01) rr(g - 0.0, g - 0.0, r);
  translate([0, 0, base_h + 5 - 2.15]) linear_extrude(0.01) rr(g - 4.3, g - 4.3, r - 2.15);
  translate([0, 0, base_h + 5 - 2.15 - 1.8]) linear_extrude(0.01) rr(g - 4.3, g - 4.3, r - 2.15);
  translate([0, 0, base_h + 0.3]) linear_extrude(0.01) rr(g - 5.7, g - 5.7, max(0.5, r - 2.85));
}
difference() {
  translate([0, 0, 0]) linear_extrude(base_h + 5) rr(units_x * g, units_y * g, r);
  for (i = [0 : units_x - 1], j = [0 : units_y - 1]) translate([(i - (units_x - 1) / 2) * g, (j - (units_y - 1) / 2) * g, 0]) {
    socket();
    if (style == "light") translate([0, 0, -1]) linear_extrude(base_h + 5) rr(g - 5.7, g - 5.7, 1.5);
    if (style == "magnets") for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 13, sy * 13, base_h - 2.4]) cylinder(d = 6.5, h = 3);
    if (screw_holes) translate([0, 0, -1]) cylinder(d = 3.5, h = base_h + 10);
  }
}
echo(str("INFO: ", units_x * g, " x ", units_y * g, " mm"));
`},
// ───────────────────────────── TOYS & GAMES ─────────────────────────────
{
  id: 'dice', cat: 'toys', name: 'Dice',
  desc: 'Six-sided die with rounded edges and recessed pips (or numbers).',
  scad: `/* [Die] */
size = 16; // [8:1:40] Size (mm)
rounding = 2; // [0.5:0.5:6] Edge rounding (mm)
style = "pips"; // [pips:Pips, numbers:Numbers] Faces
depth = 1; // [0.4:0.1:3] Recess depth (mm)

/* [Hidden] */
$fn = 24;
s = size;
pips = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]], [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];
rots = [[0, 0, 0], [0, 0, 0], [90, 0, 0], [0, 90, 0], [0, -90, 0], [-90, 0, 0], [180, 0, 0]];
difference() {
  minkowski() { cube(s - 2 * rounding, center = true); sphere(rounding, $fn = 16); }
  for (n = [1 : 6]) rotate(rots[n]) translate([0, 0, s / 2]) {
    if (style == "pips") for (p = pips[n]) translate([p[0] * s * 0.27, p[1] * s * 0.27, 0]) sphere(d = s * 0.17);
    else translate([0, 0, -depth]) linear_extrude(depth + 1) text(str(n), size = s * 0.5, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
  }
}
`},
{
  id: 'spinning-top', cat: 'toys', name: 'Spinning Top',
  desc: 'Classic spinning top with a grip stem and a heavy rim.',
  scad: `/* [Top] */
diameter = 45; // [20:1:100] Diameter (mm)
height = 35; // [15:1:80] Body height (mm)
stem = 25; // [8:1:50] Stem length (mm)

/* [Hidden] */
$fn = 96;
cylinder(d1 = 1.6, d2 = diameter * 0.24, h = height * 0.15);
translate([0, 0, height * 0.15 - 0.01]) cylinder(d1 = diameter * 0.24, d2 = diameter, h = height * 0.4);
translate([0, 0, height * 0.55 - 0.01]) cylinder(d = diameter, h = height * 0.15);
translate([0, 0, height * 0.7 - 0.01]) cylinder(d1 = diameter, d2 = diameter * 0.7, h = height * 0.15);
translate([0, 0, height * 0.85 - 0.02]) cylinder(d = 8, h = stem + height * 0.15);
`},
{
  id: 'building-brick', cat: 'toys', name: 'Building Brick',
  desc: 'Brick compatible with the common 8 mm stud system (bricks, plates, tiles).',
  scad: `/* [Brick] */
studs_x = 4; // [1:1:16] Studs long
studs_y = 2; // [1:1:16] Studs wide
type = "brick"; // [brick:Brick (9.6 mm), plate:Plate (3.2 mm), tile:Tile (no studs)] Type
fit = 0.1; // [0:0.02:0.3] Shrink outside by (mm)

/* [Hidden] */
$fn = 40;
p = 8; h = type == "brick" ? 9.6 : 3.2; wall = 1.2;
L = studs_x * p - 2 * fit; W = studs_y * p - 2 * fit;
difference() {
  cube([L, W, h]);
  translate([wall, wall, -0.01]) cube([L - 2 * wall, W - 2 * wall, h - 1]);
}
if (type != "tile") for (i = [0 : studs_x - 1], j = [0 : studs_y - 1]) translate([p / 2 + i * p - fit, p / 2 + j * p - fit, h - 0.01]) cylinder(d = 4.8, h = 1.8);
// underside tubes / pins
if (studs_x > 1 && studs_y > 1) for (i = [1 : studs_x - 1], j = [1 : studs_y - 1]) translate([i * p - fit, j * p - fit, 0]) difference() { cylinder(d = 6.51, h = h - 0.5); translate([0, 0, -1]) cylinder(d = 4.8, h = h); }
else if (max(studs_x, studs_y) > 1) for (i = [1 : max(studs_x, studs_y) - 1]) translate(studs_x > 1 ? [i * p - fit, W / 2, 0] : [L / 2, i * p - fit, 0]) cylinder(d = 3, h = h - 0.5);
`},
{
  id: 'fidget-spinner', cat: 'toys', name: 'Fidget Spinner',
  desc: 'Spinner for 608 skateboard bearings: 2 to 6 arms.',
  scad: `/* [Spinner] */
arms = 3; // [2:1:6] Arms
arm_len = 32; // [22:1:60] Centre to arm bearing (mm)
bearing_d = 22; // [10:0.1:30] Bearing diameter (608 = 22) (mm)
bearing_h = 7; // [4:0.5:12] Bearing height (mm)
fit = 0.15; // [0:0.05:0.5] Press-fit clearance (mm)

/* [Hidden] */
$fn = 96;
w = 4;
difference() {
  linear_extrude(bearing_h) {
    circle(d = bearing_d + 2 * w);
    for (i = [0 : arms - 1]) rotate(i * 360 / arms) hull() { circle(d = bearing_d * 0.7); translate([arm_len, 0]) circle(d = bearing_d + 2 * w); }
  }
  for (i = [-1 : arms - 1]) rotate(i * 360 / arms) translate([i < 0 ? 0 : arm_len, 0, -1]) cylinder(d = bearing_d + 2 * fit, h = bearing_h + 2);
}
`},
{
  id: 'marble-run', cat: 'toys', name: 'Marble Run Piece',
  desc: 'Stackable marble run segment (straight or curved channel on a tower block).',
  scad: `/* [Piece] */
type = "straight"; // [straight:Straight slope, curve:90 degree curve, drop:Drop tower] Piece
block = 40; // [30:1:60] Block size (mm)
marble = 16; // [10:0.5:25] Marble diameter (mm)

/* [Hidden] */
$fn = 48;
ch = marble + 2;
difference() {
  cube([block, block, block]);
  if (type == "straight") translate([-1, block / 2, block - ch / 2 - 2]) rotate([0, 90 - atan(6 / block), 0]) cylinder(d = ch, h = block * 1.5);
  if (type == "curve") translate([0, 0, block - ch / 2 - 2]) rotate_extrude(angle = 90) translate([block / 2, 0]) circle(d = ch);
  if (type == "drop") translate([block / 2, block / 2, -1]) cylinder(d = ch, h = block + 2);
  translate([-1, block / 2, block - ch / 2 - 2]) rotate([0, 90, 0]) cylinder(d = ch, h = 4);
}
`},
// ───────────────────────────── TEXT & CUSTOM ─────────────────────────────
{
  id: 'house-number', cat: 'text', name: 'House Number',
  desc: 'House number sign with raised digits, border and screw holes.',
  scad: `/* [Sign] */
number = "12"; // House number / text
height = 90; // [40:1:250] Sign height (mm)
digit_h = 60; // [20:1:200] Digit height (mm)
thickness = 5; // [3:0.5:12] Plate thickness (mm)
relief = 3; // [1:0.5:10] Digit height above plate (mm)
border = true; // Raised border

/* [Hidden] */
$fn = 32;
f = "Liberation Sans:style=Bold";
w = max(height, len(number) * digit_h * 0.62 + 30);
difference() {
  linear_extrude(thickness) offset(6) offset(-6) square([w, height], center = true);
  for (sx = [-1, 1]) translate([sx * (w / 2 - 10), 0, -1]) cylinder(d = 4.5, h = thickness + 2);
}
translate([0, 0, thickness - 0.01]) linear_extrude(relief) text(number, size = digit_h, halign = "center", valign = "center", font = f);
if (border) translate([0, 0, thickness - 0.01]) linear_extrude(relief) difference() { offset(-3) offset(6) offset(-6) square([w, height], center = true); offset(-6) offset(6) offset(-6) square([w, height], center = true); }
`},
{
  id: 'braille-label', cat: 'text', name: 'Braille Label',
  desc: 'Label with English Grade-1 Braille dots (letters, numbers, spaces).',
  scad: `/* [Label] */
txt = "hello"; // Text (a-z, 0-9, space)
dot_d = 1.5; // [1.2:0.1:2] Dot diameter (mm)
dot_h = 0.6; // [0.4:0.1:1] Dot height (mm)
thickness = 2; // [1:0.5:5] Plate thickness (mm)

/* [Hidden] */
$fn = 16;
// dots 1-6 per letter: bit k = dot k+1
L = "abcdefghijklmnopqrstuvwxyz";
P = [1, 3, 9, 25, 17, 11, 27, 19, 10, 26, 5, 7, 13, 29, 21, 15, 31, 23, 14, 30, 37, 39, 58, 45, 61, 53];
function idx(c, s, i = 0) = i >= len(s) ? -1 : s[i] == c ? i : idx(c, s, i + 1);
function lower(c) = let(o = ord(c)) (o >= 65 && o <= 90) ? chr(o + 32) : c;
cells = [for (ch = txt) let(c = lower(ch), d = idx(c, "1234567890")) d >= 0 ? [60, P[d]] : idx(c, L) >= 0 ? [P[idx(c, L)]] : [0]];
flat = [for (c = cells) for (v = c) v];
cw = 6.2; ch_ = 10;
module dot(k) let(col = k < 3 ? 0 : 1, row = k % 3) translate([col * 2.5, -row * 2.5, 0]) scale([1, 1, dot_h / (dot_d / 2)]) sphere(d = dot_d);
linear_extrude(thickness) offset(2) offset(-2) square([len(flat) * cw + 6, ch_ + 4]);
for (i = [0 : len(flat) - 1], k = [0 : 5]) if (floor(flat[i] / pow(2, k)) % 2 == 1) translate([4 + i * cw, ch_ - 1, thickness]) dot(k);
echo(str("INFO: ", len(flat), " Braille cells (numbers get a number sign)"));
`},
// ───────────────────────────── ACCESSORIES ─────────────────────────────
{
  id: 'luggage-tag', cat: 'acc', name: 'Luggage Tag',
  desc: 'Luggage tag with your name engraved and a strap slot.',
  scad: `/* [Tag] */
line1 = "NAME"; // Line 1
line2 = "+966 5x xxx xxxx"; // Line 2
width = 85; // [50:1:120] Width (mm)
height = 50; // [30:1:80] Height (mm)
thickness = 3; // [2:0.5:6] Thickness (mm)

/* [Hidden] */
$fn = 32;
f = "Liberation Sans:style=Bold";
difference() {
  linear_extrude(thickness) offset(5) offset(-5) square([width, height]);
  translate([width - 12, height / 2 - 8, -1]) cube([5, 16, thickness + 2]);
  translate([5, height * 0.55, thickness - 0.8]) linear_extrude(1) text(line1, size = height * 0.2, font = f);
  translate([5, height * 0.18, thickness - 0.8]) linear_extrude(1) text(line2, size = height * 0.12, font = f);
}
`},
{
  id: 'carabiner', cat: 'acc', name: 'Carabiner Clip',
  desc: 'Light-duty printed carabiner with a flexible gate (not for climbing).',
  scad: `/* [Clip] */
length = 60; // [30:1:120] Length (mm)
width = 30; // [15:1:60] Width (mm)
thickness = 6; // [3:0.5:12] Thickness (mm)
bar = 4; // [2.5:0.5:8] Bar width (mm)

/* [Hidden] */
$fn = 64;
module ov(l, w) hull() { translate([w / 2, w / 2]) circle(d = w); translate([l - w / 2, w / 2]) circle(d = w * 0.85); }
linear_extrude(thickness) {
  difference() { ov(length, width); offset(-bar) ov(length, width); translate([length * 0.25, width - bar - 0.6]) square([length * 0.5, bar + 1]); }
  // gate: thin flexible bar, slightly offset so it springs closed
  translate([length * 0.25, width - bar * 0.7 - 0.6]) square([length * 0.52, bar * 0.6]);
}
echo("INFO: Not for climbing or loads that matter.");
`},
];
