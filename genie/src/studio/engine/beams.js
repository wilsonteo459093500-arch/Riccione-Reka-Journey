// 「体积光」：清晨 / 傍晚，阳光从窗口斜斜地打进来的光柱。
// 做法：把窗洞四个角沿光线方向投到地面，拼成一个半透明、加法混合、越往地面越淡的棱柱。
// 棱柱的侧面在「侧着看」时淡出（用屏幕导数求面法线），所以光柱没有硬边，像真的空气里的光；
// 再加一点点抖动噪声，暗处不出色带。
// 手机 GPU 上 pow(负数) / normalize(0) = NaN：底数夹好、最后再洗一次（hdrguard.js），一个 NaN 像素就能让高画质整屏变透明。

import * as THREE from 'three';
import { LAMP } from './daylight.js';
import { HDR_GLSL } from './hdrguard.js';

const vert = /* glsl */ `
  attribute float t;
  varying float vT;
  varying vec3 vView;
  void main() {
    vT = t;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  varying float vT;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  ${HDR_GLSL}
  void main() {
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    vec3 v = normalize(-vView);
    float facing = abs(dot(n, v));
    float edge = smoothstep(0.05, 0.75, facing);           // 侧面淡出 → 柔边
    float along = pow(clamp(1.0 - vT, 0.0, 1.0), 1.35) * smoothstep(0.0, 0.04, vT + 0.01); // MSAA 边上的像素 vT 会略大于 1
    float a = strength * along * edge * 0.2;
    a += (hash(gl_FragCoord.xy) - 0.5) / 255.0;            // 抖动，防色带
    a = hdrSafe(a);
    gl_FragColor = vec4(color * a, a);
  }
`;

export class Beams {
  constructor() {
    this.group = new THREE.Group();
    this.group.userData.noAO = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(LAMP.beam) }, strength: { value: 0 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.meshes = [];
    this.windows = [];
  }

  setWindows(windows) {
    this.windows = windows;
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes = windows.map(() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      g.setAttribute('t', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1));
      // 四个侧面
      g.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
      const m = new THREE.Mesh(g, this.material);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
      return m;
    });
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.meshes = [];
    this.material.dispose();
  }

  /** sunDir：指向太阳的单位向量；strength 0–1 */
  update(sunDir, strength, color) {
    this.material.uniforms.strength.value = strength;
    if (color) this.material.uniforms.color.value.set(color);
    const L = new THREE.Vector3(-sunDir[0], -sunDir[1], -sunDir[2]);
    const on = strength > 0.01 && L.y < -0.05;
    this.windows.forEach((w, i) => {
      const mesh = this.meshes[i];
      const horizontal = new THREE.Vector3(L.x, 0, L.z);
      const visible = on && horizontal.dot(w.inward) > 0.08;
      mesh.visible = visible;
      if (!visible) return;
      const inset = 0.08;
      const corners = [
        w.a.clone().setY(w.sill + inset),
        w.b.clone().setY(w.sill + inset),
        w.b.clone().setY(w.head - inset),
        w.a.clone().setY(w.head - inset),
      ];
      const arr = mesh.geometry.attributes.position.array;
      corners.forEach((c, k) => {
        const t = Math.min(12, c.y / -L.y);
        const e = c.clone().addScaledVector(L, t);
        arr.set([c.x, c.y, c.z], k * 3);
        arr.set([e.x, Math.max(0.005, e.y), e.z], (k + 4) * 3);
      });
      mesh.geometry.attributes.position.needsUpdate = true;
    });
  }
}
