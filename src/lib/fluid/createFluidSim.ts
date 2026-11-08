/*
  Adapted from Pavel Dobryakov's WebGL Fluid Simulation.
  Copyright (c) 2017 Pavel Dobryakov

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

import ditherUrl from './LDR_RGB1_0.png'

/** Dye or background color. `splat` uses linear dye intensity; `BACK_COLOR` uses 0–255. */
export type FluidColor = { r: number; g: number; b: number }

export type FluidNumberSetting =
  | 'SIM_RESOLUTION'
  | 'DYE_RESOLUTION'
  | 'DENSITY_DISSIPATION'
  | 'VELOCITY_DISSIPATION'
  | 'PRESSURE_DISSIPATION'
  | 'PRESSURE_ITERATIONS'
  | 'CURL'
  | 'DELTA_TIME'
  | 'SPLAT_RADIUS'
  | 'BLOOM_ITERATIONS'
  | 'BLOOM_RESOLUTION'
  | 'BLOOM_INTENSITY'
  | 'BLOOM_THRESHOLD'
  | 'BLOOM_SOFT_KNEE'

export type FluidBooleanSetting = 'SHADING' | 'COLORFUL' | 'PAUSED' | 'BLOOM' | 'TRANSPARENT'

export type FluidSim = {
  /** Inject dye and velocity. `x` and `y` are canvas pixels from the top left. */
  splat: (x: number, y: number, dx: number, dy: number, color: FluidColor) => void
  /** Add dye from an image. The velocity field is left alone. `x` and `y` are canvas pixels from the top left. */
  stampInk: (source: CanvasImageSource, x: number, y: number, width: number, height: number, color: FluidColor) => void
  /** Set dye and velocity to zero inside a rectangle. `x` and `y` are canvas pixels from the top left. */
  clearPatch: (x: number, y: number, width: number, height: number) => void
  /** Wipe dye and velocity so the frame goes back to the background. */
  clear: () => void
  set: {
    (name: FluidNumberSetting, value: number): void
    (name: FluidBooleanSetting, value: boolean): void
    (name: 'BACK_COLOR', value: FluidColor): void
  }
  destroy: () => void
}

type FBO = {
  texture: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
  attach: (id: number) => number
}

type DoubleFBO = {
  read: FBO
  write: FBO
  swap: () => void
}

type Config = Record<FluidNumberSetting, number> &
  Record<FluidBooleanSetting, boolean> & {
    BACK_COLOR: FluidColor
  }

export function createFluidSim(canvas: HTMLCanvasElement): FluidSim {
  const config: Config = {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0.97,
    VELOCITY_DISSIPATION: 0.98,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 30,
    DELTA_TIME: 0.016,
    SPLAT_RADIUS: 0.3,
    SHADING: true,
    COLORFUL: true,
    PAUSED: false,
    BACK_COLOR: { r: 0, g: 0, b: 0 },
    TRANSPARENT: false,
    BLOOM: true,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.8,
    BLOOM_THRESHOLD: 0.6,
    BLOOM_SOFT_KNEE: 0.7,
  }

  const { gl, ext } = getWebGLContext(canvas)

  if (isMobile()) config.SHADING = false
  if (!ext.supportLinearFiltering) {
    config.SHADING = false
    config.BLOOM = false
  }

  class GLProgram {
    uniforms: Record<string, WebGLUniformLocation | null>
    program: WebGLProgram

    constructor(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
      this.uniforms = {}
      this.program = gl.createProgram()!
      gl.attachShader(this.program, vertexShader)
      gl.attachShader(this.program, fragmentShader)
      gl.linkProgram(this.program)
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(this.program) || 'Shader program failed to link')
      }
      const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number
      for (let i = 0; i < uniformCount; i++) {
        const info = gl.getActiveUniform(this.program, i)
        if (!info) continue
        this.uniforms[info.name] = gl.getUniformLocation(this.program, info.name)
      }
    }

    bind() {
      gl.useProgram(this.program)
    }
  }

  function compileShader(type: number, source: string) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Unable to create shader')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || 'Shader failed to compile')
    }
    return shader
  }

  const baseVertexShader = compileShader(
    gl.VERTEX_SHADER,
    `
    precision highp float;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `,
  )

  const clearShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;

    void main () {
        gl_FragColor = value * texture2D(uTexture, vUv);
    }
  `,
  )

  const colorShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;

    uniform vec4 color;

    void main () {
        gl_FragColor = color;
    }
  `,
  )

  const backgroundShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    void main () {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  `,
  )

  const displayShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;

    void main () {
        vec3 C = texture2D(uTexture, vUv).rgb;
        float a = max(C.r, max(C.g, C.b));
        gl_FragColor = vec4(C, a);
    }
  `,
  )

  const displayBloomShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;

    void main () {
        vec3 C = texture2D(uTexture, vUv).rgb;
        vec3 bloom = texture2D(uBloom, vUv).rgb;
        bloom = pow(bloom.rgb, vec3(1.0 / 2.2));
        C += bloom;
        float a = max(C.r, max(C.g, C.b));
        gl_FragColor = vec4(C, a);
    }
  `,
  )

  const displayShadingShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;

    void main () {
        vec3 L = texture2D(uTexture, vL).rgb;
        vec3 R = texture2D(uTexture, vR).rgb;
        vec3 T = texture2D(uTexture, vT).rgb;
        vec3 B = texture2D(uTexture, vB).rgb;
        vec3 C = texture2D(uTexture, vUv).rgb;

        float dx = length(R) - length(L);
        float dy = length(T) - length(B);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        C.rgb *= diffuse;

        float a = max(C.r, max(C.g, C.b));
        gl_FragColor = vec4(C, a);
    }
  `,
  )

  const displayBloomShadingShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    void main () {
        vec3 L = texture2D(uTexture, vL).rgb;
        vec3 R = texture2D(uTexture, vR).rgb;
        vec3 T = texture2D(uTexture, vT).rgb;
        vec3 B = texture2D(uTexture, vB).rgb;
        vec3 C = texture2D(uTexture, vUv).rgb;

        float dx = length(R) - length(L);
        float dy = length(T) - length(B);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        C *= diffuse;

        vec3 bloom = texture2D(uBloom, vUv).rgb;
        bloom = pow(bloom.rgb, vec3(1.0 / 2.2));
        C += bloom;

        float a = max(C.r, max(C.g, C.b));
        gl_FragColor = vec4(C, a);
    }
  `,
  )

  const bloomPrefilterShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec3 curve;
    uniform float threshold;

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - curve.x, 0.0, curve.y);
        rq = curve.z * rq * rq;
        c *= max(rq, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c, 0.0);
    }
  `,
  )

  const bloomBlurShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum;
    }
  `,
  )

  const bloomFinalShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform float intensity;

    void main () {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vL);
        sum += texture2D(uTexture, vR);
        sum += texture2D(uTexture, vT);
        sum += texture2D(uTexture, vB);
        sum *= 0.25;
        gl_FragColor = sum * intensity;
    }
  `,
  )

  const splatShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
  `,
  )

  const inkShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform sampler2D uInk;
    uniform vec2 uOrigin;
    uniform vec2 uSize;
    uniform vec3 uColor;

    void main () {
        vec3 base = texture2D(uTarget, vUv).xyz;
        vec2 local = (vUv - uOrigin) / uSize;
        float inside = step(0.0, local.x) * step(local.x, 1.0) * step(0.0, local.y) * step(local.y, 1.0);
        float ink = texture2D(uInk, clamp(local, 0.0, 1.0)).a * inside;
        gl_FragColor = vec4(base + uColor * ink, 1.0);
    }
  `,
  )

  const eraseShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform vec2 uOrigin;
    uniform vec2 uSize;

    void main () {
        vec4 base = texture2D(uTarget, vUv);
        vec2 local = (vUv - uOrigin) / uSize;
        float inside = step(0.0, local.x) * step(local.x, 1.0) * step(0.0, local.y) * step(local.y, 1.0);
        gl_FragColor = base * (1.0 - inside);
    }
  `,
  )

  const advectionManualFilteringShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
        vec2 st = uv / tsize - 0.5;
        vec2 iuv = floor(st);
        vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
        vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
        vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
        vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }

    void main () {
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
        gl_FragColor = dissipation * bilerp(uSource, coord, dyeTexelSize);
        gl_FragColor.a = 1.0;
    }
  `,
  )

  const advectionShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;

    void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        gl_FragColor = dissipation * texture2D(uSource, coord);
        gl_FragColor.a = 1.0;
    }
  `,
  )

  const divergenceShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).x;
        float R = texture2D(uVelocity, vR).x;
        float T = texture2D(uVelocity, vT).y;
        float B = texture2D(uVelocity, vB).y;
        vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.0) { L = -C.x; }
        if (vR.x > 1.0) { R = -C.x; }
        if (vT.y > 1.0) { T = -C.y; }
        if (vB.y < 0.0) { B = -C.y; }
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `,
  )

  const curlShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `,
  )

  const vorticityShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).x;
        float R = texture2D(uCurl, vR).x;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
        force /= length(force) + 0.0001;
        force *= curl * C;
        force.y *= -1.0;
        vec2 vel = texture2D(uVelocity, vUv).xy;
        gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
  `,
  )

  const pressureShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    vec2 boundary (vec2 uv) {
        return uv;
    }

    void main () {
        float L = texture2D(uPressure, boundary(vL)).x;
        float R = texture2D(uPressure, boundary(vR)).x;
        float T = texture2D(uPressure, boundary(vT)).x;
        float B = texture2D(uPressure, boundary(vB)).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `,
  )

  const gradientSubtractShader = compileShader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    precision mediump sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    vec2 boundary (vec2 uv) {
        return uv;
    }

    void main () {
        float L = texture2D(uPressure, boundary(vL)).x;
        float R = texture2D(uPressure, boundary(vR)).x;
        float T = texture2D(uPressure, boundary(vT)).x;
        float B = texture2D(uPressure, boundary(vB)).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `,
  )

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)

    return (destination: WebGLFramebuffer | null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination)
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    }
  })()

  let simWidth = 0
  let simHeight = 0
  let dyeWidth = 0
  let dyeHeight = 0
  let density: DoubleFBO | null = null
  let velocity: DoubleFBO | null = null
  let divergence: FBO
  let curl: FBO
  let pressure: DoubleFBO
  let bloom: FBO
  let bloomFramebuffers: FBO[] = []
  let alive = true
  let raf = 0

  const ditheringTexture = createTextureAsync(ditherUrl)

  const clearProgram = new GLProgram(baseVertexShader, clearShader)
  const colorProgram = new GLProgram(baseVertexShader, colorShader)
  const backgroundProgram = new GLProgram(baseVertexShader, backgroundShader)
  const displayProgram = new GLProgram(baseVertexShader, displayShader)
  const displayBloomProgram = new GLProgram(baseVertexShader, displayBloomShader)
  const displayShadingProgram = new GLProgram(baseVertexShader, displayShadingShader)
  const displayBloomShadingProgram = new GLProgram(baseVertexShader, displayBloomShadingShader)
  const bloomPrefilterProgram = new GLProgram(baseVertexShader, bloomPrefilterShader)
  const bloomBlurProgram = new GLProgram(baseVertexShader, bloomBlurShader)
  const bloomFinalProgram = new GLProgram(baseVertexShader, bloomFinalShader)
  const splatProgram = new GLProgram(baseVertexShader, splatShader)
  const inkProgram = new GLProgram(baseVertexShader, inkShader)
  const eraseProgram = new GLProgram(baseVertexShader, eraseShader)
  const inkTexture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, inkTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  const advectionProgram = new GLProgram(
    baseVertexShader,
    ext.supportLinearFiltering ? advectionShader : advectionManualFilteringShader,
  )
  const divergenceProgram = new GLProgram(baseVertexShader, divergenceShader)
  const curlProgram = new GLProgram(baseVertexShader, curlShader)
  const vorticityProgram = new GLProgram(baseVertexShader, vorticityShader)
  const pressureProgram = new GLProgram(baseVertexShader, pressureShader)
  const gradientSubtractProgram = new GLProgram(baseVertexShader, gradientSubtractShader)

  function getResolution(resolution: number) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1 / aspectRatio

    const max = Math.round(resolution * aspectRatio)
    const min = Math.round(resolution)
    if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min }
    return { width: min, height: max }
  }

  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION)
    const dyeRes = getResolution(config.DYE_RESOLUTION)

    simWidth = simRes.width
    simHeight = simRes.height
    dyeWidth = dyeRes.width
    dyeHeight = dyeRes.height

    const texType = ext.halfFloatTexType
    const rgba = ext.formatRGBA
    const rg = ext.formatRG
    const r = ext.formatR
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST

    density =
      density == null
        ? createDoubleFBO(dyeWidth, dyeHeight, rgba.internalFormat, rgba.format, texType, filtering)
        : resizeDoubleFBO(density, dyeWidth, dyeHeight, rgba.internalFormat, rgba.format, texType, filtering)

    velocity =
      velocity == null
        ? createDoubleFBO(simWidth, simHeight, rg.internalFormat, rg.format, texType, filtering)
        : resizeDoubleFBO(velocity, simWidth, simHeight, rg.internalFormat, rg.format, texType, filtering)

    divergence = createFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST)
    curl = createFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST)
    pressure = createDoubleFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST)

    initBloomFramebuffers()
  }

  function initBloomFramebuffers() {
    const res = getResolution(config.BLOOM_RESOLUTION)
    const texType = ext.halfFloatTexType
    const rgba = ext.formatRGBA
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST

    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering)

    bloomFramebuffers = []
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
      const width = res.width >> (i + 1)
      const height = res.height >> (i + 1)
      if (width < 2 || height < 2) break
      bloomFramebuffers.push(createFBO(width, height, rgba.internalFormat, rgba.format, texType, filtering))
    }
  }

  function createFBO(w: number, h: number, internalFormat: number, format: number, type: number, param: number): FBO {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)

    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)

    return {
      texture,
      fbo,
      width: w,
      height: h,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }
  }

  function createDoubleFBO(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ): DoubleFBO {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param)
    let fbo2 = createFBO(w, h, internalFormat, format, type, param)

    return {
      get read() {
        return fbo1
      },
      set read(value: FBO) {
        fbo1 = value
      },
      get write() {
        return fbo2
      },
      set write(value: FBO) {
        fbo2 = value
      },
      swap() {
        const temp = fbo1
        fbo1 = fbo2
        fbo2 = temp
      },
    }
  }

  function resizeFBO(target: FBO, w: number, h: number, internalFormat: number, format: number, type: number, param: number) {
    const newFBO = createFBO(w, h, internalFormat, format, type, param)
    clearProgram.bind()
    gl.uniform1i(clearProgram.uniforms.uTexture, target.attach(0))
    gl.uniform1f(clearProgram.uniforms.value, 1)
    blit(newFBO.fbo)
    return newFBO
  }

  function resizeDoubleFBO(
    target: DoubleFBO,
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    param: number,
  ) {
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param)
    target.write = createFBO(w, h, internalFormat, format, type, param)
    return target
  }

  function createTextureAsync(url: string) {
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]))

    const obj = {
      texture,
      width: 1,
      height: 1,
      attach(id: number) {
        gl.activeTexture(gl.TEXTURE0 + id)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return id
      },
    }

    const image = new Image()
    image.onload = () => {
      obj.width = image.width
      obj.height = image.height
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image)
    }
    image.src = url
    return obj
  }

  function step(dt: number) {
    if (!velocity || !density) return

    gl.disable(gl.BLEND)
    gl.viewport(0, 0, simWidth, simHeight)

    curlProgram.bind()
    gl.uniform2f(curlProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0))
    blit(curl.fbo)

    vorticityProgram.bind()
    gl.uniform2f(vorticityProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1))
    gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL)
    gl.uniform1f(vorticityProgram.uniforms.dt, dt)
    blit(velocity.write.fbo)
    velocity.swap()

    divergenceProgram.bind()
    gl.uniform2f(divergenceProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0))
    blit(divergence.fbo)

    clearProgram.bind()
    gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION)
    blit(pressure.write.fbo)
    pressure.swap()

    pressureProgram.bind()
    gl.uniform2f(pressureProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0))
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write.fbo)
      pressure.swap()
    }

    gradientSubtractProgram.bind()
    gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1))
    blit(velocity.write.fbo)
    velocity.swap()

    advectionProgram.bind()
    gl.uniform2f(advectionProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight)
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1 / simWidth, 1 / simHeight)
    }
    const velocityId = velocity.read.attach(0)
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId)
    gl.uniform1i(advectionProgram.uniforms.uSource, velocityId)
    gl.uniform1f(advectionProgram.uniforms.dt, dt)
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION)
    blit(velocity.write.fbo)
    velocity.swap()

    gl.viewport(0, 0, dyeWidth, dyeHeight)

    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1 / dyeWidth, 1 / dyeHeight)
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.attach(1))
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION)
    blit(density.write.fbo)
    density.swap()
  }

  function render(target: WebGLFramebuffer | null) {
    if (!density) return

    if (config.BLOOM) applyBloom(density.read, bloom)

    if (target == null || !config.TRANSPARENT) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.enable(gl.BLEND)
    } else {
      gl.disable(gl.BLEND)
    }

    const width = target == null ? gl.drawingBufferWidth : dyeWidth
    const height = target == null ? gl.drawingBufferHeight : dyeHeight
    gl.viewport(0, 0, width, height)

    if (!config.TRANSPARENT) {
      colorProgram.bind()
      const bc = config.BACK_COLOR
      gl.uniform4f(colorProgram.uniforms.color, bc.r / 255, bc.g / 255, bc.b / 255, 1)
      blit(target)
    }

    if (target == null && config.TRANSPARENT) {
      backgroundProgram.bind()
      blit(null)
    }

    if (config.SHADING) {
      const program = config.BLOOM ? displayBloomShadingProgram : displayShadingProgram
      program.bind()
      gl.uniform2f(program.uniforms.texelSize, 1 / width, 1 / height)
      gl.uniform1i(program.uniforms.uTexture, density.read.attach(0))
      if (config.BLOOM) {
        gl.uniform1i(program.uniforms.uBloom, bloom.attach(1))
        gl.uniform1i(program.uniforms.uDithering, ditheringTexture.attach(2))
        const scale = getTextureScale(ditheringTexture, width, height)
        gl.uniform2f(program.uniforms.ditherScale, scale.x, scale.y)
      }
    } else {
      const program = config.BLOOM ? displayBloomProgram : displayProgram
      program.bind()
      gl.uniform1i(program.uniforms.uTexture, density.read.attach(0))
      if (config.BLOOM) {
        gl.uniform1i(program.uniforms.uBloom, bloom.attach(1))
        gl.uniform1i(program.uniforms.uDithering, ditheringTexture.attach(2))
        const scale = getTextureScale(ditheringTexture, width, height)
        gl.uniform2f(program.uniforms.ditherScale, scale.x, scale.y)
      }
    }

    blit(target)
  }

  function applyBloom(source: FBO, destination: FBO) {
    if (bloomFramebuffers.length < 2) return

    let last: FBO = destination
    gl.disable(gl.BLEND)
    bloomPrefilterProgram.bind()
    const knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001
    const curve0 = config.BLOOM_THRESHOLD - knee
    const curve1 = knee * 2
    const curve2 = 0.25 / knee
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, curve0, curve1, curve2)
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD)
    gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0))
    gl.viewport(0, 0, last.width, last.height)
    blit(last.fbo)

    bloomBlurProgram.bind()
    for (let i = 0; i < bloomFramebuffers.length; i++) {
      const dest = bloomFramebuffers[i]
      gl.uniform2f(bloomBlurProgram.uniforms.texelSize, 1 / last.width, 1 / last.height)
      gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0))
      gl.viewport(0, 0, dest.width, dest.height)
      blit(dest.fbo)
      last = dest
    }

    gl.blendFunc(gl.ONE, gl.ONE)
    gl.enable(gl.BLEND)

    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
      const baseTex = bloomFramebuffers[i]
      gl.uniform2f(bloomBlurProgram.uniforms.texelSize, 1 / last.width, 1 / last.height)
      gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0))
      gl.viewport(0, 0, baseTex.width, baseTex.height)
      blit(baseTex.fbo)
      last = baseTex
    }

    gl.disable(gl.BLEND)
    bloomFinalProgram.bind()
    gl.uniform2f(bloomFinalProgram.uniforms.texelSize, 1 / last.width, 1 / last.height)
    gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0))
    gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY)
    gl.viewport(0, 0, destination.width, destination.height)
    blit(destination.fbo)
  }

  function splat(x: number, y: number, dx: number, dy: number, color: FluidColor) {
    if (!velocity || !density || canvas.width < 2 || canvas.height < 2) return

    gl.viewport(0, 0, simWidth, simHeight)
    splatProgram.bind()
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height)
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1 - y / canvas.height)
    gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1)
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100)
    blit(velocity.write.fbo)
    velocity.swap()

    gl.viewport(0, 0, dyeWidth, dyeHeight)
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.attach(0))
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b)
    blit(density.write.fbo)
    density.swap()
  }

  function stampInk(source: CanvasImageSource, x: number, y: number, width: number, height: number, color: FluidColor) {
    if (!density || width < 1 || height < 1 || canvas.width < 2 || canvas.height < 2) return

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, inkTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

    gl.disable(gl.BLEND)
    inkProgram.bind()
    gl.viewport(0, 0, dyeWidth, dyeHeight)
    gl.uniform1i(inkProgram.uniforms.uTarget, density.read.attach(0))
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, inkTexture)
    gl.uniform1i(inkProgram.uniforms.uInk, 1)
    gl.uniform2f(inkProgram.uniforms.uOrigin, x / canvas.width, 1 - (y + height) / canvas.height)
    gl.uniform2f(inkProgram.uniforms.uSize, width / canvas.width, height / canvas.height)
    gl.uniform3f(inkProgram.uniforms.uColor, color.r, color.g, color.b)
    blit(density.write.fbo)
    density.swap()
  }

  function eraseField(field: DoubleFBO, viewWidth: number, viewHeight: number, x: number, y: number, width: number, height: number) {
    gl.disable(gl.BLEND)
    eraseProgram.bind()
    gl.viewport(0, 0, viewWidth, viewHeight)
    gl.uniform1i(eraseProgram.uniforms.uTarget, field.read.attach(0))
    gl.uniform2f(eraseProgram.uniforms.uOrigin, x / canvas.width, 1 - (y + height) / canvas.height)
    gl.uniform2f(eraseProgram.uniforms.uSize, width / canvas.width, height / canvas.height)
    blit(field.write.fbo)
    field.swap()
  }

  function clearPatch(x: number, y: number, width: number, height: number) {
    if (!velocity || !density || width < 1 || height < 1 || canvas.width < 2 || canvas.height < 2) return
    eraseField(velocity, simWidth, simHeight, x, y, width, height)
    eraseField(density, dyeWidth, dyeHeight, x, y, width, height)
  }

  function clear() {
    if (!velocity || !density) return
    gl.clearColor(0, 0, 0, 0)
    for (const target of [
      velocity.read,
      velocity.write,
      density.read,
      density.write,
      pressure.read,
      pressure.write,
      divergence,
      curl,
    ]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
      gl.viewport(0, 0, target.width, target.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clearColor(0, 0, 0, 1)
  }

  function resizeCanvas() {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    if (width < 2 || height < 2) return false
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      initFramebuffers()
    }
    return true
  }

  function frame() {
    if (!alive) return
    if (resizeCanvas()) {
      const dt = Math.min(0.1, Math.max(0, config.DELTA_TIME))
      if (!config.PAUSED && dt > 0) step(dt)
      render(null)
    }
    raf = requestAnimationFrame(frame)
  }

  function set(name: FluidNumberSetting | FluidBooleanSetting | 'BACK_COLOR', value: number | boolean | FluidColor) {
    if (name === 'BACK_COLOR') {
      const color = value as FluidColor
      config.BACK_COLOR = { r: color.r, g: color.g, b: color.b }
      return
    }
    if (name === 'BLOOM' && value === true && !ext.supportLinearFiltering) return
    if (name === 'SHADING' && value === true && (!ext.supportLinearFiltering || isMobile())) return

    if (typeof value === 'number') config[name as FluidNumberSetting] = value
    else config[name as FluidBooleanSetting] = value as boolean

    if (name === 'SIM_RESOLUTION' || name === 'DYE_RESOLUTION') initFramebuffers()
    if (name === 'BLOOM_RESOLUTION' || name === 'BLOOM_ITERATIONS') initBloomFramebuffers()
  }

  function destroy() {
    if (!alive) return
    alive = false
    cancelAnimationFrame(raf)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  resizeCanvas()
  raf = requestAnimationFrame(frame)

  return { splat, stampInk, clearPatch, set, clear, destroy }
}

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent)
}

type TexFormat = { internalFormat: number; format: number }

type WebGLExtensions = {
  formatRGBA: TexFormat
  formatRG: TexFormat
  formatR: TexFormat
  halfFloatTexType: number
  supportLinearFiltering: boolean
}

function getWebGLContext(canvas: HTMLCanvasElement): { gl: WebGL2RenderingContext; ext: WebGLExtensions } {
  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false }
  const gl2 = canvas.getContext('webgl2', params)
  const gl1 = gl2 ? null : (canvas.getContext('webgl', params) as WebGLRenderingContext | null)
  const gl = (gl2 ?? gl1) as WebGL2RenderingContext | null
  if (!gl) throw new Error('WebGL is not available')

  const isWebGL2 = !!gl2
  let halfFloat: OES_texture_half_float | null = null
  let supportLinearFiltering: OES_texture_float_linear | OES_texture_half_float_linear | null = null
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float')
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear')
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float')
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear')
  }

  gl.clearColor(0, 0, 0, 1)

  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat?.HALF_FLOAT_OES
  if (halfFloatTexType == null) throw new Error('Half-float textures are not available')

  let formatRGBA: TexFormat | null
  let formatRG: TexFormat | null
  let formatR: TexFormat | null

  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType)
    formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType)
    formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType)
  } else {
    formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
    formatRG = formatRGBA
    formatR = formatRGBA
  }

  if (!formatRGBA || !formatRG || !formatR) throw new Error('No renderable float texture format')

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering: !!supportLinearFiltering,
    },
  }
}

function getSupportedFormat(gl: WebGL2RenderingContext, internalFormat: number, format: number, type: number): TexFormat | null {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type)
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type)
      default:
        return null
    }
  }
  return { internalFormat, format }
}

function supportRenderTextureFormat(gl: WebGL2RenderingContext, internalFormat: number, format: number, type: number) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)

  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return status === gl.FRAMEBUFFER_COMPLETE
}

function getTextureScale(texture: { width: number; height: number }, width: number, height: number) {
  return {
    x: width / texture.width,
    y: height / texture.height,
  }
}
