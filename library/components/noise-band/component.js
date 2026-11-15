/* noise-band: a fbm noise band that rises up the backdrop, with a tinted edge line. It breathes with time, leans toward the
   pointer, swells while someone types and surges while a prompt runs. WebGL1 first; if a context cannot be made (or is lost)
   the same field is painted on a small 2D canvas on the CPU, and if even that fails the host shows a plain gradient.
   The field height depends on x and time only, so the CPU path computes it once per column. */

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FS = `precision mediump float;
uniform vec2 res;uniform float t,energy,surge,px,py,seed;uniform vec3 ground,hue;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
void main(){
  vec2 uv=gl_FragCoord.xy/res;
  float x=uv.x,y=uv.y,asp=res.x/res.y;
  float wave=sin(x*4.+t*.5)*.05;
  float n=(fbm(vec2(x*asp*1.7+t*.05,t*.035))-.47)+.6*(fbm(vec2(x*asp*3.9-t*.08,t*.05+7.))-.47);
  float d0=(x-px)/.18;
  float bump=.09*(.4+py)*exp(-d0*d0);
  float h=.34+wave+.22*n*1.6+.10*energy+bump+.95*surge;
  float d=h-y;
  float inside=smoothstep(-.002,.002,d);
  float centre=1.-abs(x-.5)*2.;
  float below=mix(.22,.66,clamp(d/.5,0.,1.))+.3*(1.-smoothstep(0.,.22,y));
  below*=mix(1.,.72,centre);
  float a=mix(.965,below,inside);
  a=clamp(a+(h21(gl_FragCoord.xy+seed)-.5)*.025,0.,1.);
  vec3 c=ground*a;
  float wash=inside*.16*exp(-max(d,0.)*9.);
  c=c*(1.-wash)+hue*wash;a=a*(1.-wash)+wash;
  float line=(1.-smoothstep(0.,.004,abs(d)))*.9;
  c=c*(1.-line)+hue*line;a=a*(1.-line)+line;
  gl_FragColor=vec4(c,a);
}`;

const STYLE = `
.fwc-noise-band { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.fwc-noise-band canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
`;

const fract = (v) => v - Math.floor(v);
const h21 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const smooth = (a, b, v) => {
  const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mix = (a, b, k) => a + (b - a) * k;
const vn = (px, py) => {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  let fx = px - ix;
  let fy = py - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(mix(h21(ix, iy), h21(ix + 1, iy), fx), mix(h21(ix, iy + 1), h21(ix + 1, iy + 1), fx), fy);
};
const fbm = (px, py) => {
  let a = 0.5;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    s += a * vn(px, py);
    px *= 2.03;
    py *= 2.03;
    a *= 0.5;
  }
  return s;
};

export function mount(root, props, ctx) {
  const p = props || {};
  const tint = String(p.tint ?? "var(--hue)");
  const groundCss = String(p.ground ?? "var(--ground)");
  const stateName = String(p.stateVariable ?? "phase");
  const activityName = String(p.activityVariable ?? "q");
  const surgeBusy = Number(p.surgeBusy ?? 1);
  const surgeDone = Number(p.surgeDone ?? 0.18);
  const followPointer = p.pointer !== false;
  const timeScale = Number(p.speed ?? 1);

  root.classList.add("fwc-noise-band");
  const style = document.createElement("style");
  style.textContent = STYLE;
  root.append(style);

  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.display = "none";
  root.append(probe);
  const rgbOf = (css, fallback) => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.fillStyle = "#000";
      x.fillStyle = css;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255];
    } catch {
      return fallback;
    }
  };
  const colours = () => {
    probe.style.color = tint;
    const hue = rgbOf(getComputedStyle(probe).color, [0.85, 0.82, 0.77]);
    probe.style.color = groundCss;
    const ground = rgbOf(getComputedStyle(probe).color, [0.06, 0.05, 0.05]);
    return { hue, ground };
  };
  let col = colours();

  const reduced = () => ctx.reduced;
  let t = 0;
  let energyT = 0;
  let energy = 0;
  let surgeT = 0;
  let surge = 0;
  let px = 0.5;
  let py = 0.5;
  let pxT = 0.5;
  let pyT = 0.5;
  let drawn = false;
  let mode = "none";
  let cv = null;
  let gl = null;
  let prog = null;
  let loc = {};
  let cpu = null;
  let image = null;
  let dead = false;

  const surgeFor = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (v === "searching") return surgeBusy;
    if (v === "answer") return surgeDone;
    return 0;
  };

  const makeCanvas = () => {
    if (cv) cv.remove();
    cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    root.append(cv);
  };

  const setupGL = () => {
    try {
      const g = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, failIfMajorPerformanceCaveat: false });
      if (!g) return false;
      const mk = (type, src) => {
        const s = g.createShader(type);
        g.shaderSource(s, src);
        g.compileShader(s);
        if (!g.getShaderParameter(s, g.COMPILE_STATUS)) throw new Error("shader");
        return s;
      };
      const pr = g.createProgram();
      g.attachShader(pr, mk(g.VERTEX_SHADER, VS));
      g.attachShader(pr, mk(g.FRAGMENT_SHADER, FS));
      g.linkProgram(pr);
      if (!g.getProgramParameter(pr, g.LINK_STATUS)) return false;
      g.useProgram(pr);
      const buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      const a = g.getAttribLocation(pr, "p");
      g.enableVertexAttribArray(a);
      g.vertexAttribPointer(a, 2, g.FLOAT, false, 0, 0);
      loc = {};
      for (const n of ["res", "t", "energy", "surge", "px", "py", "seed", "ground", "hue"]) loc[n] = g.getUniformLocation(pr, n);
      g.clearColor(0, 0, 0, 0);
      gl = g;
      prog = pr;
      return true;
    } catch {
      return false;
    }
  };

  const setupCPU = () => {
    try {
      const c = cv.getContext("2d");
      if (!c) return false;
      cpu = c;
      return true;
    } catch {
      return false;
    }
  };

  const size = () => {
    if (!cv) return;
    const box = ctx.size();
    const w = Math.max(2, box.width || root.clientWidth || 2);
    const h = Math.max(2, box.height || root.clientHeight || 2);
    if (mode === "gl") {
      const k = 0.6 * Math.min(devicePixelRatio || 1, 1.5);
      cv.width = Math.max(2, Math.round(w * k));
      cv.height = Math.max(2, Math.round(h * k));
      gl.viewport(0, 0, cv.width, cv.height);
    } else if (mode === "cpu") {
      const k = 0.3;
      cv.width = Math.max(2, Math.round(w * k));
      cv.height = Math.max(2, Math.round(h * k));
      image = cpu.createImageData(cv.width, cv.height);
    }
  };

  const drawGL = () => {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.res, cv.width, cv.height);
    gl.uniform1f(loc.t, t);
    gl.uniform1f(loc.energy, energy);
    gl.uniform1f(loc.surge, surge);
    gl.uniform1f(loc.px, px);
    gl.uniform1f(loc.py, py);
    gl.uniform1f(loc.seed, Math.random() * 100);
    gl.uniform3f(loc.ground, col.ground[0], col.ground[1], col.ground[2]);
    gl.uniform3f(loc.hue, col.hue[0], col.hue[1], col.hue[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const heights = new Float32Array(0);
  let hs = heights;
  const drawCPU = () => {
    const w = cv.width;
    const h = cv.height;
    if (hs.length !== w) hs = new Float32Array(w);
    const asp = w / h;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / w;
      const wave = Math.sin(x * 4 + t * 0.5) * 0.05;
      const n = fbm(x * asp * 1.7 + t * 0.05, t * 0.035) - 0.47 + 0.6 * (fbm(x * asp * 3.9 - t * 0.08, t * 0.05 + 7) - 0.47);
      const d0 = (x - px) / 0.18;
      const bump = 0.09 * (0.4 + py) * Math.exp(-d0 * d0);
      hs[i] = 0.34 + wave + 0.22 * n * 1.6 + 0.1 * energy + bump + 0.95 * surge;
    }
    const data = image.data;
    const g = col.ground;
    const hu = col.hue;
    let o = 0;
    for (let j = 0; j < h; j++) {
      const y = 1 - (j + 0.5) / h;
      const floorGlow = 0.3 * (1 - smooth(0, 0.22, y));
      for (let i = 0; i < w; i++) {
        const x = (i + 0.5) / w;
        const d = hs[i] - y;
        const inside = smooth(-0.002, 0.002, d);
        const centre = 1 - Math.abs(x - 0.5) * 2;
        let below = mix(0.22, 0.66, Math.min(1, Math.max(0, d / 0.5))) + floorGlow;
        below *= mix(1, 0.72, centre);
        let a = mix(0.965, below, inside);
        a = Math.min(1, Math.max(0, a + (Math.random() - 0.5) * 0.025));
        let r = g[0] * a;
        let gg = g[1] * a;
        let b = g[2] * a;
        const wash = inside * 0.16 * Math.exp(-Math.max(d, 0) * 9);
        r = r * (1 - wash) + hu[0] * wash;
        gg = gg * (1 - wash) + hu[1] * wash;
        b = b * (1 - wash) + hu[2] * wash;
        a = a * (1 - wash) + wash;
        const line = (1 - smooth(0, 0.004, Math.abs(d))) * 0.9;
        r = r * (1 - line) + hu[0] * line;
        gg = gg * (1 - line) + hu[1] * line;
        b = b * (1 - line) + hu[2] * line;
        a = a * (1 - line) + line;
        const inv = a > 0.0001 ? 255 / a : 0;
        data[o] = Math.min(255, r * inv);
        data[o + 1] = Math.min(255, gg * inv);
        data[o + 2] = Math.min(255, b * inv);
        data[o + 3] = a * 255;
        o += 4;
      }
    }
    cpu.putImageData(image, 0, 0);
  };

  const draw = () => {
    if (dead) return;
    if (mode === "gl") drawGL();
    else if (mode === "cpu") drawCPU();
    if (!drawn && mode !== "none") {
      drawn = true;
      ctx.ready();
    }
  };

  const plainGradient = () => {
    mode = "none";
    if (cv) cv.remove();
    cv = null;
    root.style.background = "linear-gradient(to top, color-mix(in srgb, var(--ground, #101114) 66%, transparent), var(--ground, #101114) 62%)";
    ctx.ready();
  };

  const start = () => {
    makeCanvas();
    if (setupGL()) {
      mode = "gl";
      return;
    }
    makeCanvas();
    if (setupCPU()) {
      mode = "cpu";
      return;
    }
    plainGradient();
  };
  start();
  size();

  const toCPU = () => {
    if (dead || mode === "cpu") return;
    gl = null;
    makeCanvas();
    if (setupCPU()) {
      mode = "cpu";
      size();
      draw();
    } else plainGradient();
  };
  if (cv) {
    cv.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      toCPU();
    });
  }

  const offs = [];
  offs.push(ctx.onResize(() => {
    size();
    if (reduced()) draw();
  }));
  offs.push(ctx.onTheme(() => {
    col = colours();
    if (reduced()) draw();
  }));
  offs.push(ctx.onVariable(stateName, (v) => {
    surgeT = surgeFor(v);
    if (reduced()) {
      surge = surgeT;
      draw();
    }
  }));
  offs.push(ctx.onVariable(activityName, () => {
    energyT = Math.min(1, energyT + 0.18);
  }));
  surgeT = surgeFor(ctx.variable(stateName));
  surge = reduced() ? surgeT : 0;

  const onMove = (e) => {
    pxT = e.clientX / innerWidth;
    pyT = 1 - e.clientY / innerHeight;
  };
  if (followPointer) addEventListener("pointermove", onMove, { passive: true });

  let last = 0;
  let cpuTick = 0;
  offs.push(ctx.onFrame((now) => {
    if (mode === "none") return;
    if (reduced()) {
      if (!drawn) draw();
      return;
    }
    if (!ctx.visible()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    t += dt * timeScale;
    energyT *= Math.exp(-1.2 * dt);
    energy += (energyT - energy) * (1 - Math.exp(-2.5 * dt));
    const rate = surgeT > surge ? 3.2 : 1.4;
    surge += (surgeT - surge) * (1 - Math.exp(-rate * dt));
    px += (pxT - px) * (1 - Math.exp(-2.5 * dt));
    py += (pyT - py) * (1 - Math.exp(-2.5 * dt));
    if (mode === "cpu") {
      cpuTick++;
      if (cpuTick % 2) return;
    }
    draw();
  }));
  if (reduced()) draw();

  return () => {
    dead = true;
    for (const off of offs) {
      try {
        off();
      } catch {}
    }
    removeEventListener("pointermove", onMove);
    if (cv) cv.remove();
    style.remove();
    probe.remove();
  };
}
