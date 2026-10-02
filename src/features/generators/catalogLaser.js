// Laser-cut generators: flat parts with the material thickness, exported as SVG / DXF outlines.
export const LASER = [
{
  id: 'laser-finger-box', cat: 'laser', name: 'Finger-Joint Box (laser)',
  desc: 'Six flat panels with finger joints for laser cutting; export as SVG or DXF outline.',
  scad: `/* [Box] */
width = 100; // [30:1:600] Outer width (mm)
depth = 70; // [30:1:600] Outer depth (mm)
height = 50; // [20:1:600] Outer height (mm)
t = 3; // [1:0.5:12] Material thickness (mm)
finger = 10; // [4:1:40] Finger width (mm)
lid = true; // Include a lid panel
kerf = 0.1; // [0:0.02:0.4] Kerf compensation per side (mm)

/* [Hidden] */
function segs(L) = max(3, 2 * floor(L / finger / 2) + 1);
// notches of depth t along the edge from (0,0) to (L,0), inside the panel (y from 0 to t); parity 0 = even segments
module notches(L, parity) { n = segs(L); s = L / n; for (i = [0 : n - 1]) if (i % 2 == parity) translate([i * s - kerf, -0.01]) square([s + 2 * kerf, t + 0.01]); }
module panel(W, H, b, r, tp, l) {
  // b/r/tp/l: parity to notch on bottom/right/top/left edge, -1 = plain edge
  offset(delta = kerf) difference() {
    square([W, H]);
    if (b >= 0) notches(W, b);
    if (tp >= 0) translate([W, H]) rotate(180) notches(W, tp);
    if (l >= 0) translate([0, H]) rotate(-90) notches(H, l);
    if (r >= 0) translate([W, 0]) rotate(90) notches(H, r);
  }
}
gap = 5;
top_p = lid ? 1 : -1;
linear_extrude(t) {
  panel(width, height, 1, 1, top_p, 1);                                 // front
  translate([width + gap, 0]) panel(width, height, 1, 1, top_p, 1);     // back
  translate([0, height + gap]) panel(depth, height, 1, 0, top_p, 0);    // left
  translate([depth + gap, height + gap]) panel(depth, height, 1, 0, top_p, 0); // right
  translate([0, 2 * (height + gap)]) panel(width, depth, 0, 0, 0, 0);   // bottom
  if (lid) translate([width + gap, 2 * (height + gap)]) panel(width, depth, 0, 0, 0, 0); // lid
}
echo(str("INFO: Export with 'SVG outline (laser)' or 'DXF outline'. Material ", t, " mm, ", segs(width), " fingers along the width."));
`},
{
  id: 'laser-coaster', cat: 'laser', name: 'Engraved Coaster (laser)',
  desc: 'Round or square coaster outline with text, for laser cutting and engraving.',
  scad: `/* [Coaster] */
size = 95; // [40:1:200] Size (mm)
round_shape = true; // Round (off = square)
txt = "Mesh Studio"; // Text (engraved, separate shape)
t = 3; // [1:0.5:10] Material thickness (mm)

/* [Hidden] */
$fn = 96;
linear_extrude(t) difference() {
  if (round_shape) circle(d = size); else offset(6) offset(-6) square(size, center = true);
  text(txt, size = size / 9, halign = "center", valign = "center", font = "Liberation Sans:style=Bold");
}
`},
{
  id: 'laser-living-hinge', cat: 'laser', name: 'Living Hinge Panel (laser)',
  desc: 'Flat panel with a bendable slit pattern (living hinge) for laser-cut plywood or acrylic.',
  scad: `/* [Panel] */
width = 120; // [40:1:500] Width (mm)
height = 80; // [30:1:500] Height (mm)
hinge_w = 40; // [10:1:200] Hinge zone width (mm)
slit = 0.4; // [0.2:0.05:2] Slit width (mm)
gap = 2; // [1:0.5:6] Spacing between slit rows (mm)
bridge = 3; // [1.5:0.5:10] Bridge length (mm)
t = 3; // [1:0.5:8] Material thickness (mm)

/* [Hidden] */
seg = 20;
linear_extrude(t) difference() {
  square([width, height]);
  for (i = [0 : floor(hinge_w / gap)]) let(x = (width - hinge_w) / 2 + i * gap, off = i % 2 == 0 ? 0 : seg / 2)
    for (y = [-seg + off : seg : height + seg]) translate([x - slit / 2, y + bridge / 2]) square([slit, seg - bridge]);
}
`},
];
