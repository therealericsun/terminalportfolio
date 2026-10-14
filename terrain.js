// One coastline for drawing, bathymetry, normals, and hull clearance.
export class Terrain {
  constructor(width, height, { mobile = width <= 900, shore = width * (mobile ? .42 : .60), jagged = true, profile = [] } = {}) {
    this.width = width; this.height = height; this.mobile = mobile;
    this.shore = shore; this.jagged = jagged; this.profile = profile;
    this.offshoreDepth = 18; this.shallows = 110; this.beachWidth = 80;
    this.foreshoreDepth = .4; this.beachSlope = .016;
  }
  coastline(y) {
    if (!this.jagged) return this.shore;
    // Piecewise linear broad bends plus deterministic angular 18px steps.
    const knots = [0, 20, -14, 26, 8, -20, 14, -6];
    const t = y / 150, k = Math.floor(t), f = t - k;
    const bend = knots[k % knots.length] * (1 - f) + knots[(k + 1) % knots.length] * f;
    const step = [0, 6, 0, -6, -6, 6, 12, 0][Math.floor(y / 36) % 8];
    const envelope = this.profile.length ? this.profile.reduce((edge, p) => Math.max(edge,
      p.right + 112 - Math.max(0, p.top - y - 48, y - p.bottom - 48) * .8), this.width * .30) : this.shore;
    return envelope + bend * .35 + step * .5 + (this.mobile ? y * .12 - this.height * .06 : 0);
  }
  distance(x, y) { return x - this.coastline(y); }
  normal(x, y) {
    const slope = (this.coastline(y + 18) - this.coastline(Math.max(0, y - 18))) / 36;
    const n = Math.hypot(1, slope);
    return [1 / n, -slope / n];
  }
  bed(x, y) {
    const d = this.distance(x, y);
    if (d >= this.shallows) return -this.offshoreDepth;
    if (d >= 0) return -this.foreshoreDepth - (this.offshoreDepth - this.foreshoreDepth) * d / this.shallows;
    // A gently sloping, partly submerged foreshore receives every small swell.
    // The upper beach can still emerge and drain between crests.
    if (d >= -this.beachWidth) return -this.foreshoreDepth - d * this.beachSlope;
    return this.beachWidth * this.beachSlope - this.foreshoreDepth + (-d - this.beachWidth) * .4;
  }
  region(x, y) {
    const d = this.distance(x, y);
    return d < -80 ? 'land' : d < 0 ? 'sand' : d < 110 ? 'shallows' : 'ocean';
  }
  hullSafe(x, y, draft = 7) {
    return x >= 28 && x <= this.width - 28 && y >= 30 && y <= this.height - 30
      && [-25, 0, 25].every(dx => this.bed(x + dx, y + 12) <= -draft);
  }
}
