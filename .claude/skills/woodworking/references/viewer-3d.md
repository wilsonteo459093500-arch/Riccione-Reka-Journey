# Interactive 3D model — template and parametrization

This file provides a **standalone HTML artifact** that shows any piece of furniture in 3D, with
rotation, zoom, exploded view, dimensions, and part selection. The principle: **a single data array**
(`PARTS`) describes the piece; the rest of the code is generic and never needs editing.

## How to use it

1. Design the piece and build the cut list (deliverable 6).
2. Translate each part into one object of the `PARTS` array (see the coordinate frame below).
3. Copy the full template into an `.html` file in `/mnt/user-data/outputs/`, replacing **only**: the
   title, the `PARTS` array, and optionally the overall dimensions shown.
4. Present the file with `present_files`.

Always create this model as a **complete standalone HTML file** (with `<!DOCTYPE html>`), never as
React: it loads Three.js from a CDN and uses homemade orbit controls (no dependency on OrbitControls).

## Coordinate frame and part convention

3D frame, origin at the **front – bottom – left** corner of the piece:

- **X** = width (to the right)
- **Y** = height (upward)
- **Z** = depth (toward the back)

Each part is a rectangular panel described by its **reference corner** (`x, y, z` = the corner closest
to the origin) and its **dimensions** (`w, h, d`), all in mm:

```js
{ ref:"A", name:"Left side", x:0, y:0, z:0, w:18, h:1800, d:400, mat:"melamine" }
```

`mat` sets the color (palette in the code): `"melamine"`, `"mdf"`, `"plywood"`, `"osb"`,
`"solidwood"`, `"oak"`, `"beech"`, `"walnut"`. Optionally add `col:"#rrggbb"` to force a specific
color (e.g. painted fronts).

**Placement tip**: a horizontal panel (shelf, top/bottom) gets `h = thickness` and `w`, `d` as its
footprint; a vertical panel (side, divider) gets `w = thickness`; a back panel gets `d = thickness`.
Mentally check that the sides actually frame the horizontals per the chosen joinery (horizontals
between the sides, or sides between top and bottom — see `joinery-calculations.md`).

## Full template

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3D Model — Bookcase (example)</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;background:#0f1422;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8ecf4}
  #app{position:fixed;inset:0}
  canvas{display:block;touch-action:none}
  .panel{position:absolute;background:rgba(20,26,42,.92);backdrop-filter:blur(6px);
    border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px}
  #ctrl{top:14px;left:14px;width:240px}
  #ctrl h1{font-size:15px;font-weight:700;margin-bottom:2px}
  #ctrl .sub{font-size:11px;opacity:.6;margin-bottom:12px}
  .row{display:flex;gap:8px;margin-bottom:10px}
  button{flex:1;cursor:pointer;border:1px solid rgba(255,255,255,.12);
    background:rgba(255,255,255,.06);color:#e8ecf4;border-radius:9px;
    padding:9px 8px;font-size:12px;font-weight:600;transition:.15s}
  button:hover{background:rgba(255,255,255,.14)}
  button.on{background:#3b82f6;border-color:#3b82f6;color:#fff}
  .slabel{font-size:11px;opacity:.7;margin:6px 0 4px}
  input[type=range]{width:100%;accent-color:#3b82f6}
  #info{bottom:14px;left:14px;width:240px;font-size:12px;line-height:1.5}
  #info .pick{opacity:.6}
  #info b{color:#7dd3fc}
  #info .dim{font-variant-numeric:tabular-nums;font-weight:700;color:#fff;font-size:13px}
  #legend{top:14px;right:14px;width:210px;max-height:70vh;overflow:auto;font-size:11.5px}
  #legend h2{font-size:12px;margin-bottom:8px;opacity:.8}
  #legend .it{display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:7px;cursor:pointer}
  #legend .it:hover{background:rgba(255,255,255,.07)}
  #legend .sw{width:13px;height:13px;border-radius:3px;flex:none;border:1px solid rgba(0,0,0,.3)}
  #legend .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #legend .q{opacity:.55;font-variant-numeric:tabular-nums}
  .hint{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
    font-size:11px;opacity:.45;text-align:center;width:100%;pointer-events:none}
  @media(max-width:680px){#legend{display:none}#ctrl,#info{width:190px}}
</style>
</head>
<body>
<div id="app"></div>
<div class="panel" id="ctrl">
  <h1 id="title">Bookcase</h1>
  <div class="sub" id="overall">— mm W × — mm H × — mm D</div>
  <div class="row">
    <button id="reset">Reset view</button>
    <button id="dims" class="on">Dimensions</button>
  </div>
  <div class="slabel">Exploded view</div>
  <input type="range" id="explode" min="0" max="100" value="0">
</div>
<div class="panel" id="info"><span class="pick">Click a part to see its dimensions.</span></div>
<div class="panel" id="legend"><h2>Parts</h2><div id="leglist"></div></div>
<div class="hint">Drag to rotate · scroll / pinch to zoom · click a part</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
/* ================= 1. FURNITURE DATA (replace per project) ================= */
const TITLE = "Bookcase";
// Example: 800 (W) × 1800 (H) × 300 (D) carcass, sides/top/bottom 18 mm,
// back 8 mm, 4 shelves incl. 1 fixed. Replace with the real cut list.
const E = 18;            // common thickness
const W = 800, H = 1800, P = 300;   // outside envelope
const inX = E, inW = W - 2*E;        // left inside / inside width
const PARTS = [
  { ref:"A", name:"Left side",   x:0,        y:0,      z:0, w:E,    h:H,      d:P,   mat:"melamine" },
  { ref:"A", name:"Right side",  x:W-E,      y:0,      z:0, w:E,    h:H,      d:P,   mat:"melamine" },
  { ref:"B", name:"Bottom",      x:inX,      y:0,      z:0, w:inW,  h:E,      d:P,   mat:"melamine" },
  { ref:"B", name:"Top",         x:inX,      y:H-E,    z:0, w:inW,  h:E,      d:P,   mat:"melamine" },
  { ref:"C", name:"Fixed shelf", x:inX,      y:900,    z:0, w:inW,  h:E,      d:P-2, mat:"melamine" },
  { ref:"D", name:"Shelf 1",     x:inX,      y:320,    z:8, w:inW,  h:E,      d:P-22,mat:"melamine" },
  { ref:"D", name:"Shelf 2",     x:inX,      y:610,    z:8, w:inW,  h:E,      d:P-22,mat:"melamine" },
  { ref:"D", name:"Shelf 3",     x:inX,      y:1200,   z:8, w:inW,  h:E,      d:P-22,mat:"melamine" },
  { ref:"D", name:"Shelf 4",     x:inX,      y:1500,   z:8, w:inW,  h:E,      d:P-22,mat:"melamine" },
  { ref:"F", name:"Back panel",  x:0,        y:0,      z:P-8,w:W,   h:H,      d:8,   mat:"plywood" },
];

/* ================= 2. MATERIAL PALETTE ================= */
const MAT = {
  melamine:0xe9e2d4, mdf:0xc9a36a, plywood:0xe3c089,
  osb:0xd8b779, solidwood:0xcaa472, oak:0xc8a36b, beech:0xe2c79b, walnut:0x6b4a32
};
const colorOf = p => p.col ? new THREE.Color(p.col) : new THREE.Color(MAT[p.mat] ?? 0xcccccc);

/* ================= 3. SCENE ================= */
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1422);
const camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 1, 100000);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x33384a, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(1,1.6,1.1); scene.add(key);
const fill= new THREE.DirectionalLight(0xffffff, 0.3); fill.position.set(-1,0.4,-0.8); scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.18));

/* furniture bounds */
let minX=1e9,minY=1e9,minZ=1e9,maxX=-1e9,maxY=-1e9,maxZ=-1e9;
PARTS.forEach(p=>{ minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minZ=Math.min(minZ,p.z);
  maxX=Math.max(maxX,p.x+p.w);maxY=Math.max(maxY,p.y+p.h);maxZ=Math.max(maxZ,p.z+p.d); });
const center = new THREE.Vector3((minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2);
const span = Math.max(maxX-minX,maxY-minY,maxZ-minZ);

/* ================= 4. BUILD THE PARTS ================= */
const meshes = [];
PARTS.forEach((p,i)=>{
  const g = new THREE.BoxGeometry(p.w,p.h,p.d);
  const col = colorOf(p);
  const m = new THREE.MeshStandardMaterial({color:col, roughness:0.72, metalness:0.0});
  const mesh = new THREE.Mesh(g,m);
  const base = new THREE.Vector3(p.x+p.w/2, p.y+p.h/2, p.z+p.d/2);
  mesh.position.copy(base);
  mesh.userData = {p, base, baseColor:col.clone()};
  // crisp edges
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({color:0x222633, transparent:true, opacity:0.55}));
  mesh.add(edges);
  scene.add(mesh); meshes.push(mesh);
});

/* floor reference grid */
const grid = new THREE.GridHelper(Math.max(span*3,1500), 24, 0x2a3146, 0x1b2030);
grid.position.set(center.x, minY-0.5, center.z); scene.add(grid);

/* ================= 5. DIMENSIONS (sprites + lines) ================= */
function textSprite(txt, worldW){
  const pad=10, fs=40; const c=document.createElement('canvas'); const x=c.getContext('2d');
  x.font=`bold ${fs}px sans-serif`; const tw=x.measureText(txt).width;
  c.width=tw+pad*2; c.height=fs+pad*2;
  x.font=`bold ${fs}px sans-serif`;
  x.fillStyle='rgba(15,20,34,.9)';
  const r=12; x.beginPath();
  x.moveTo(r,0);x.arcTo(c.width,0,c.width,c.height,r);x.arcTo(c.width,c.height,0,c.height,r);
  x.arcTo(0,c.height,0,0,r);x.arcTo(0,0,c.width,0,r);x.closePath();x.fill();
  x.fillStyle='#bfe3ff';x.textAlign='center';x.textBaseline='middle';
  x.fillText(txt,c.width/2,c.height/2);
  const tex=new THREE.CanvasTexture(c); tex.minFilter=THREE.LinearFilter;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true}));
  const h=worldW*c.height/c.width; s.scale.set(worldW,h,1); s.renderOrder=999; return s;
}
const dimGroup = new THREE.Group(); scene.add(dimGroup);
function dimLine(a,b,label){
  const mat=new THREE.LineBasicMaterial({color:0x5b9cff,depthTest:false,transparent:true});
  const geo=new THREE.BufferGeometry().setFromPoints([a,b]);
  const ln=new THREE.Line(geo,mat); ln.renderOrder=998; dimGroup.add(ln);
  // ticks
  const dir=new THREE.Vector3().subVectors(b,a).normalize();
  const up=Math.abs(dir.y)>0.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const t=new THREE.Vector3().crossVectors(dir,up).normalize().multiplyScalar(span*0.02);
  [a,b].forEach(pt=>{
    const tg=new THREE.BufferGeometry().setFromPoints([pt.clone().add(t),pt.clone().sub(t)]);
    const tl=new THREE.Line(tg,mat); tl.renderOrder=998; dimGroup.add(tl);
  });
  const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5);
  const sp=textSprite(label+" mm", span*0.16); sp.position.copy(mid).add(t.clone().normalize().multiplyScalar(span*0.05));
  dimGroup.add(sp);
}
const off=span*0.10;
// Width (X), bottom front
dimLine(new THREE.Vector3(minX,minY-off,maxZ+off), new THREE.Vector3(maxX,minY-off,maxZ+off), (maxX-minX).toFixed(0));
// Height (Y), left front
dimLine(new THREE.Vector3(minX-off,minY,maxZ+off), new THREE.Vector3(minX-off,maxY,maxZ+off), (maxY-minY).toFixed(0));
// Depth (Z), bottom left
dimLine(new THREE.Vector3(minX-off,minY-off,minZ), new THREE.Vector3(minX-off,minY-off,maxZ), (maxZ-minZ).toFixed(0));

/* ================= 6. ORBIT CONTROLS (homemade) ================= */
let theta=0.7, phi=1.15, radius=span*1.9;
const target=center.clone();
function updateCam(){
  camera.position.set(
    target.x+radius*Math.sin(phi)*Math.sin(theta),
    target.y+radius*Math.cos(phi),
    target.z+radius*Math.sin(phi)*Math.cos(theta));
  camera.lookAt(target);
}
updateCam();
let drag=false, px=0, py=0, moved=false;
const cv=renderer.domElement;
cv.addEventListener('pointerdown',e=>{drag=true;moved=false;px=e.clientX;py=e.clientY;cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',e=>{
  if(!drag)return; const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX;py=e.clientY;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  theta-=dx*0.008; phi=Math.max(0.15,Math.min(Math.PI-0.15,phi-dy*0.008)); updateCam();
});
cv.addEventListener('pointerup',e=>{drag=false; if(!moved)pick(e)});
cv.addEventListener('wheel',e=>{e.preventDefault();radius=Math.max(span*0.4,Math.min(span*6,radius*(1+Math.sign(e.deltaY)*0.12)));updateCam()},{passive:false});
// mobile pinch
let pinch=0;
cv.addEventListener('touchmove',e=>{
  if(e.touches.length===2){
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    if(pinch)radius=Math.max(span*0.4,Math.min(span*6,radius*pinch/d)); pinch=d;
  }
},{passive:true});
cv.addEventListener('touchend',()=>pinch=0);

/* ================= 7. SELECTION ================= */
const ray=new THREE.Raycaster(), m2=new THREE.Vector2();
let selected=null;
function selectMesh(mesh){
  if(selected){selected.material.emissive.setHex(0x000000);selected.material.color.copy(selected.userData.baseColor)}
  selected=mesh;
  if(mesh){
    mesh.material.emissive.setHex(0x14306b);
    const p=mesh.userData.p;
    document.getElementById('info').innerHTML =
      `<b>${p.ref} — ${p.name}</b><br><span class="dim">${p.w} × ${p.h} × ${p.d} mm</span>`+
      `<br><span class="pick">(W × H × D · ${p.mat})</span>`;
  } else {
    document.getElementById('info').innerHTML='<span class="pick">Click a part to see its dimensions.</span>';
  }
}
function pick(e){
  const r=cv.getBoundingClientRect();
  m2.x=((e.clientX-r.left)/r.width)*2-1; m2.y=-((e.clientY-r.top)/r.height)*2+1;
  ray.setFromCamera(m2,camera);
  const hit=ray.intersectObjects(meshes,false);
  selectMesh(hit.length?hit[0].object:null);
}

/* ================= 8. UI ================= */
document.getElementById('title').textContent=TITLE;
document.getElementById('overall').textContent=
  `${(maxX-minX).toFixed(0)} mm W × ${(maxY-minY).toFixed(0)} mm H × ${(maxZ-minZ).toFixed(0)} mm D`;
document.getElementById('reset').onclick=()=>{theta=0.7;phi=1.15;radius=span*1.9;updateCam()};
const dbtn=document.getElementById('dims');
dbtn.onclick=()=>{dimGroup.visible=!dimGroup.visible;dbtn.classList.toggle('on',dimGroup.visible)};
document.getElementById('explode').oninput=e=>{
  const k=e.target.value/100*0.9;
  meshes.forEach(mh=>{const b=mh.userData.base;
    mh.position.set(b.x+(b.x-center.x)*k, b.y+(b.y-center.y)*k, b.z+(b.z-center.z)*k);});
};
// legend
const leg=document.getElementById('leglist');
PARTS.forEach((p,i)=>{
  const it=document.createElement('div'); it.className='it';
  it.innerHTML=`<span class="sw" style="background:#${colorOf(p).getHexString()}"></span>`+
    `<span class="nm">${p.ref} ${p.name}</span><span class="q">${p.w}×${p.h}×${p.d}</span>`;
  it.onclick=()=>{selectMesh(meshes[i]);};
  leg.appendChild(it);
});

/* ================= 9. LOOP ================= */
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
(function loop(){requestAnimationFrame(loop);renderer.render(scene,camera)})();
</script>
</body>
</html>
```

## Quality points to respect

- **Build `PARTS` directly from the cut list**: one object per physical part (so two sides = two
  objects, same `ref`). Repeated `ref` values are normal and group identical parts in the legend.
- **Position consistency**: if a shelf sits on pins with a back setback, give it a small `z` (e.g.
  8 mm) and a reduced depth (`d = P − 22`) to show it; a fixed, captured shelf goes edge to edge.
- **Fronts and drawers**: represent a door as a thin panel at `z = P` (front); a drawer at minimum by
  its front, optionally plus a box volume. For a piece with several fronts, give doors their own color
  via `col`.
- **Don't overload**: the model illustrates the structure and carries the overall dimensions; each
  part's detail dimensions stay in the 2D plans and cut list. Clicking a part is enough to give its
  exact dimensions.
- **Verify the displayed envelope**: the "W × H × D" banner is computed automatically from the parts;
  it must match the overall dimensions stated in the package. A mismatch flags a data-entry error in
  `PARTS`.
