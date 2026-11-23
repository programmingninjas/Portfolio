import * as THREE from 'three';

const BAY = 7.4;
const WALL = 3.68;
const ART_X = WALL - .105;
const ART_Y = 2.04;
const ART_W = .96;
const ART_H = ART_W * 1450 / 950;
const PICTURE_LIGHT_Y = ART_Y + ART_H / 2 + .30;
const PLAQUE_W = .70;
const EYE = 1.72;
const PI = Math.PI;
const mod = THREE.MathUtils.euclideanModulo;
const clamp = THREE.MathUtils.clamp;
const sideX = side => side === 0 ? -1 : 1;
const wallAngle = side => -sideX(side) * PI / 2;

function makeCanvas(width, height, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    return canvas;
}

function textureFrom(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
}

function seededNoise(seed) {
    return () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function grain(ctx, w, h, strength, seed) {
    const rand = seededNoise(seed);
    const pixels = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const n = (rand() - 0.5) * strength;
        for (let c = 0; c < 3; c++) pixels.data[i + c] += n;
    }
    ctx.putImageData(pixels, 0, 0);
}

function wallTexture() {
    return textureFrom(makeCanvas(768, 384, (ctx, w, h) => {
        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, '#16232a');
        base.addColorStop(0.45, '#2b4142');
        base.addColorStop(1, '#111c23');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        // Narrow woven marks give the wall a textile finish at close range.
        ctx.fillStyle = 'rgba(141,164,154,.06)';
        for (let x = 1; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
        const beam = ctx.createRadialGradient(w / 2, h * .22, 2, w / 2, h * .44, h * .62);
        beam.addColorStop(0, 'rgba(231,170,99,.43)');
        beam.addColorStop(.46, 'rgba(185,121,64,.24)');
        beam.addColorStop(1, 'rgba(140,101,69,0)');
        ctx.fillStyle = beam;
        ctx.fillRect(0, 0, w, h);
        grain(ctx, w, h, 9, 41);
    }));
}

function floorTexture() {
    return textureFrom(makeCanvas(768, 768, (ctx, w, h) => {
        const rand = seededNoise(84);
        ctx.fillStyle = '#121b20';
        ctx.fillRect(0, 0, w, h);
        for (let row = 0; row < 8; row++) {
            for (let col = -1; col < 8; col++) {
                const x = col * 158 + (row % 2) * 79;
                const y = row * 96;
                const v = Math.floor(27 + rand() * 7);
                ctx.fillStyle = 'rgb(' + v + ',' + (v + 7) + ',' + (v + 9) + ')';
                ctx.fillRect(x + 1, y + 1, 156, 94);
                ctx.fillStyle = 'rgba(183,183,158,.09)';
                ctx.fillRect(x + 2, y + 1, 154, 1);
            }
        }
        // An inlaid runner keeps a continuous vanishing line across bay boundaries.
        const x = w * .33;
        ctx.fillStyle = '#242732';
        ctx.fillRect(x, 0, w - 2 * x, h);
        for (const edge of [x, w - x]) {
            const sign = edge === x ? 1 : -1;
            ctx.fillStyle = '#856d49';
            ctx.fillRect(edge, 0, sign * 2.2, h);
            ctx.fillStyle = '#665943';
            ctx.fillRect(edge + sign * 7, 0, sign * 1.3, h);
        }
        for (const edge of [0, w]) {
            const reflected = ctx.createRadialGradient(edge, h * .5, 0, edge, h * .5, w * .42);
            reflected.addColorStop(0, 'rgba(218,151,77,.34)');
            reflected.addColorStop(1, 'rgba(218,151,77,0)');
            ctx.fillStyle = reflected;
            ctx.fillRect(0, 0, w, h);
        }
        grain(ctx, w, h, 10, 3);
    }));
}

function walnutTexture(frame = false) {
    return textureFrom(makeCanvas(384, 128, (ctx, w, h) => {
        const rand = seededNoise(21);
        const base = ctx.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, frame ? '#74452c' : '#52372b');
        base.addColorStop(.55, frame ? '#99603c' : '#372926');
        base.addColorStop(1, frame ? '#69442f' : '#513429');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) {
            const y = rand() * h;
            ctx.strokeStyle = i % 3 ? 'rgba(22,12,10,.2)' : 'rgba(171,106,68,.16)';
            ctx.lineWidth = rand() * 1.1 + .3;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * .3, y + rand() * 6, w * .65, y - rand() * 6, w, y);
            ctx.stroke();
        }
    }));
}

// Sweep a moulding cross-section around the poster opening. Extending each corner
// equally in x and y cuts the rails on a 45-degree mitre; UVs run with each rail.
function pictureMoulding() {
    const profile = [
        [-.002, -.008], [-.002, .02], [.005, .033], [.013, .035],
        [.022, .022], [.034, .018], [.053, .023], [.071, .044],
        [.081, .057], [.091, .061], [.101, .056], [.109, .041],
        [.118, .040], [.122, .034], [.122, -.105]
    ];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const positions = [], uvs = [];
    for (let rail = 0; rail < 4; rail++) {
        const first = corners[rail], last = corners[(rail + 1) % 4];
        function vertex(corner, section, u) {
            const [border, depth] = profile[section];
            positions.push(corner[0] * (ART_W / 2 + border), corner[1] * (ART_H / 2 + border), depth);
            uvs.push(u, (border + .002) / .124);
        }
        for (let band = 0; band < profile.length - 1; band++) {
            vertex(first, band, 0);
            vertex(first, band + 1, 0);
            vertex(last, band + 1, 1);
            vertex(first, band, 0);
            vertex(last, band + 1, 1);
            vertex(last, band, 1);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
}

// A cross section swept through a half ellipse forms both the vault and its ribs.
function curvedBand(radius, rise, thickness, depth) {
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const faces = [];
    const sections = 44;
    for (let i = 0; i <= sections; i++) {
        const angle = i / sections * PI;
        for (const [r, z] of [[0, -1], [0, 1], [thickness, 1], [thickness, -1]]) {
            positions.push((radius + r) * Math.cos(angle), (rise + r) * Math.sin(angle), z * depth / 2);
            uvs.push(i / sections, z / 2 + .5);
        }
    }
    for (let i = 0; i < sections; i++) {
        for (let j = 0; j < 4; j++) {
            const a = i * 4 + j;
            const b = i * 4 + (j + 1) % 4;
            faces.push(a, b, a + 4, b, b + 4, a + 4);
        }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(faces);
    geom.computeVertexNormals();
    return geom;
}

function architecture() {
    const box = new THREE.BoxGeometry();
    const plane = new THREE.PlaneGeometry();
    const sphere = new THREE.SphereGeometry(1, 12, 9);
    const mat = (color, extra = {}) => {
        const material = new THREE.MeshPhongMaterial({ color, shininess: 14, ...extra });
        material.color.convertSRGBToLinear();
        material.specular.convertSRGBToLinear();
        return material;
    };
    const timber = mat(0xffffff, { map: walnutTexture() });
    const dark = mat(0x302829);
    const brass = mat(0xb79560, { specular: 0xdec491, shininess: 52 });
    const frameWood = mat(0xffffff, { map: walnutTexture(true), specular: 0x7e6049, shininess: 32 });
    const moulding = pictureMoulding();
    const vault = mat(0x263941, { side: THREE.DoubleSide });
    const teal = mat(0x344e4d);
    const wall = new THREE.MeshBasicMaterial({ map: wallTexture() });
    const floor = new THREE.MeshBasicMaterial({ map: floorTexture() });
    const glass = new THREE.MeshBasicMaterial({ color: 0xffdda1 });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffedc3 });
    const glow = new THREE.MeshBasicMaterial({
        map: textureFrom(makeCanvas(128, 128, (ctx, w) => {
            const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
            g.addColorStop(0, 'rgba(255,190,94,.60)');
            g.addColorStop(.22, 'rgba(235,146,57,.18)');
            g.addColorStop(1, 'rgba(217,123,45,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, w);
        })),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const groups = new Map();
    const stem = new THREE.Object3D();
    function add(shape, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
        if (!groups.has(material)) groups.set(material, []);
        stem.position.set(x, y, z);
        stem.rotation.set(rx, ry, rz);
        stem.scale.set(sx, sy, sz);
        stem.updateMatrix();
        groups.get(material).push({ shape, transform: stem.matrix.clone() });
    }
    add(plane, floor, 0, 0, 0, WALL * 2, BAY, 1, -PI / 2);
    add(curvedBand(WALL + .025, 1.88, .03, BAY), vault, 0, 4.24, 0);
    const arch = curvedBand(WALL - .18, 1.72, .18, .32);
    const archEdge = curvedBand(WALL - .19, 1.71, .026, .035);
    add(arch, timber, 0, 4.19, -BAY / 2);
    add(archEdge, brass, 0, 4.19, -BAY / 2 + .17);
    add(archEdge, brass, 0, 4.19, -BAY / 2 - .17);
    // The coffered central ceiling meets the vault springs at a continuous cornice.
    add(box, timber, 0, 5.49, -BAY / 2, 4.94, .13, .33);
    for (const sign of [-1, 1]) {
        add(box, brass, 0, 5.426, -BAY / 2 + sign * .146, 4.92, .018, .035);
        add(box, timber, sign * 2.50, 5.54, 0, .18, .13, BAY);
        add(box, brass, sign * 2.42, 5.493, 0, .027, .025, BAY);
    }
    const smallRib = curvedBand(WALL - .025, 1.83, .035, .085);
    add(smallRib, teal, 0, 4.24, 0);
    for (const sign of [-1, 1]) {
        const angle = -sign * PI / 2;
        add(plane, wall, sign * WALL, 2.14, 0, BAY, 4.28, 1, 0, angle);
        add(box, timber, sign * (WALL - .025), .5, 0, .07, 1, BAY);
        for (const [height, width, depth, material] of [
            [.09, .19, .18, dark], [.25, .08, .12, timber], [.94, .10, .15, timber],
            [1.015, .026, .175, brass], [1.065, .067, .18, timber],
            [4.07, .043, .16, brass], [4.15, .13, .25, timber], [4.27, .06, .19, dark]
        ]) {
            add(box, material, sign * (WALL - depth / 2), height, 0, depth, width, BAY);
        }
        for (let k = 0; k < 5; k++) {
            const z = -BAY / 2 + (k + .5) * BAY / 5;
            add(box, dark, sign * (WALL - .073), .57, z, .045, .56, 1.30);
            add(box, timber, sign * (WALL - .101), .57, z, .045, .49, 1.23);
        }
        const pillarZ = -BAY / 2;
        add(box, timber, sign * (WALL - .12), 2.10, pillarZ, .29, 4.18, .44);
        for (const groove of [-.15, -.075, 0, .075, .15]) {
            add(box, dark, sign * (WALL - .27), 2.12, pillarZ + groove, .025, 3.45, .025);
        }
        add(box, timber, sign * (WALL - .16), .23, pillarZ, .38, .46, .58);
        add(box, timber, sign * (WALL - .16), 4.02, pillarZ, .40, .23, .57);
        add(box, brass, sign * (WALL - .16), 3.92, pillarZ, .42, .04, .60);
        add(moulding, frameWood, sign * ART_X, ART_Y, 0, 1, 1, 1, 0, angle);
        add(box, brass, sign * (WALL - .14), PICTURE_LIGHT_Y + .025, 0, .28, .036, .055);
        add(box, brass, sign * (WALL - .28), PICTURE_LIGHT_Y, 0, .09, .075, .65);
        add(box, lit, sign * (WALL - .28), PICTURE_LIGHT_Y - .040, 0, .075, .012, .62);
        add(plane, glow, sign * (WALL - .315), PICTURE_LIGHT_Y - .045, 0, .92, .35, 1, 0, angle);
        // Brass sconces between exhibits establish a legible rhythm far down the hall.
        const sconceZ = BAY * .38;
        add(box, brass, sign * (WALL - .06), 2.60, sconceZ, .12, .52, .18);
        add(box, brass, sign * (WALL - .20), 2.55, sconceZ, .32, .04, .05);
        add(sphere, glass, sign * (WALL - .34), 2.72, sconceZ, .085, .18, .085);
        add(plane, glow, sign * (WALL - .43), 2.72, sconceZ, .84, .97, 1, 0, angle);
        add(box, brass, sign * (WALL - .34), 2.54, sconceZ, .16, .055, .16);
        // Ceiling stringers follow the two edges of the crown.
        for (const x of [1.25, 2.35]) {
            const y = 4.24 + 1.88 * Math.sqrt(1 - (x / WALL) ** 2);
            add(box, teal, sign * x, y - .01, 0, .057, .08, BAY);
        }
    }
    add(box, brass, 0, 5.78, -BAY / 2, .04, .38, .04);
    add(sphere, glass, 0, 5.52, -BAY / 2, .16, .21, .16);
    add(box, brass, 0, 5.69, -BAY / 2, .32, .05, .32, 0, PI / 4);
    // Merge each material's surfaces once. Each pass draws all repeated bays via instancing.
    const batches = [];
    const usedShapes = new Set();
    for (const [material, pieces] of groups) {
        const pos = [], normal = [], uv = [];
        for (const { shape, transform } of pieces) {
            const g = shape.index ? shape.toNonIndexed() : shape.clone();
            g.applyMatrix4(transform);
            pos.push(...g.attributes.position.array);
            normal.push(...g.attributes.normal.array);
            uv.push(...g.attributes.uv.array);
            g.dispose();
            usedShapes.add(shape);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        batches.push([g, material]);
    }
    for (const g of usedShapes) g.dispose();
    return batches;
}

// Keep the original atlas' marble veins, woven plaster, and ceiling coffers.
// Each surface has its own shadow and highlight grade in linear light.
function gradeBake(texture, kind) {
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const grades = {
        floor: 'vec3(.003,.006,.009) + vec3(.049,.072,.079)*sqrt(luma) + source*vec3(.14,.085,.054)',
        wall: 'vec3(.003,.008,.013) + vec3(.008,.038,.048)*smoothstep(.02,.65,luma) + vec3(.16,.084,.033)*pow(luma,3.8)',
        ceiling: 'vec3(.003,.008,.011) + vec3(.018,.049,.051)*sqrt(luma) + source*vec3(.32,.21,.115)'
    };
    material.customProgramCacheKey = () => kind;
    material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', [
            'vec3 source = mapTexelToLinear(texture2D(map, vUv)).rgb;',
            'float luma = dot(source,vec3(.2126,.7152,.0722));',
            'diffuseColor.rgb *= ' + grades[kind] + ';'
        ].join('\n'));
    };
    return material;
}

function wrapText(ctx, value, width) {
    const lines = [];
    let line = '';
    for (const word of value.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && ctx.measureText(next).width > width) {
            lines.push(line);
            line = word;
        } else line = next;
    }
    if (line) lines.push(line);
    return lines;
}

function plaque(entry) {
    return textureFrom(makeCanvas(512, 192, (ctx, w, h) => {
        const sheen = ctx.createLinearGradient(0, 0, w, h);
        sheen.addColorStop(0, '#dfc898');
        sheen.addColorStop(.55, '#c8b283');
        sheen.addColorStop(1, '#ae956e');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, w, h);
        grain(ctx, w, h, 7, 19);
        ctx.strokeStyle = '#796548';
        ctx.strokeRect(8.5, 8.5, w - 17, h - 17);
        ctx.fillStyle = '#282923';
        ctx.textBaseline = 'middle';
        ctx.font = '19px Arial';
        ctx.fillText(entry.date || '', 30, 43);
        ctx.font = '34px Georgia';
        let lines = wrapText(ctx, entry.title, w - 60);
        if (lines.length > 2) {
            ctx.font = '28px Georgia';
            lines = wrapText(ctx, entry.title, w - 60);
        }
        lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, 30, 91 + i * 34));
    }));
}

function posterCanvas(entry, image, height = 232) {
    return makeCanvas(Math.round(height * ART_W / ART_H), height, (ctx, w, h) => {
        ctx.fillStyle = '#bb9466';
        ctx.fillRect(0, 0, w, h);
        if (image) {
            const s = Math.min(w / image.naturalWidth, h / image.naturalHeight);
            const iw = image.naturalWidth * s, ih = image.naturalHeight * s;
            ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
            return;
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#392a1e';
        ctx.font = '15px Georgia';
        const lines = wrapText(ctx, entry.title, w - 20);
        lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 18));
    });
}

export async function createHall({
    canvas, achievements, startId, onSelect = () => {}, onFocus = () => {},
    onArrive = () => {}, onReady = () => {}, onError = () => {}, reducedMotion = false
}) {
    if (!achievements.length) throw new Error('The hallway needs at least one exhibit.');
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
        onError(error);
        throw error;
    }
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    const isSmall = window.matchMedia('(max-width: 760px)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.35 : 1.65));
    let disposed = false;
    const batches = architecture();
    const pane = new THREE.PlaneGeometry(ART_W, ART_H);
    const plate = new THREE.PlaneGeometry(PLAQUE_W, PLAQUE_W * 192 / 512);
    const artCache = new Map();
    const byId = new Map(achievements.map((item, index) => [item.id, index]));
    const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const camera = new THREE.PerspectiveCamera(62, 1, .045, 65);
    camera.rotation.order = 'YXZ';
    const raycaster = new THREE.Raycaster();
    const screenPoint = new THREE.Vector2();
    const velocity = new THREE.Vector2();
    const keys = new Set();
    const fixedMatrix = new THREE.Matrix4();
    let draco, preservedMap, retired = false;
    const bakedSurfaces = [];
    let mode = 'preview', focused = null, selected = null;
    let yaw = 0, pitch = 0, logicalOrigin = 0, lastNow = 0;
    let frameHandle = 0, dirty = true, warmed = false;
    let frameWidth = 1, frameHeight = 1;
    let interestClock = 0;

    function resource(entry) {
        let record = artCache.get(entry.id);
        if (record) {
            record.used = ++interestClock;
            return record;
        }
        const texture = textureFrom(posterCanvas(entry));
        texture.anisotropy = anisotropy;
        const label = plaque(entry);
        label.anisotropy = anisotropy;
        record = {
            used: ++interestClock,
            requests: new Set(),
            loadedSize: 0,
            art: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
            label: new THREE.MeshBasicMaterial({ map: label, toneMapped: false })
        };
        artCache.set(entry.id, record);
        return record;
    }

    function loadPoster(item, fullSize) {
        const record = resource(item);
        const url = fullSize ? item.image : item.wallImage;
        const height = fullSize ? 870 : 580;
        if (!url || record.requests.has(url) || record.loadedSize >= height) return;
        record.requests.add(url);
        const img = new Image();
        img.decoding = 'async';
        img.fetchPriority = fullSize ? 'high' : 'low';
        img.onload = () => {
            if (disposed || artCache.get(item.id) !== record || record.loadedSize >= height) return;
            record.loadedSize = height;
            record.art.map.image = posterCanvas(item, img, height);
            record.art.map.needsUpdate = true;
            dirty = true;
            schedule();
        };
        img.onerror = () => {
            if (!disposed && artCache.get(item.id) === record) loadPoster(item, !fullSize);
        };
        img.src = url;
    }

    function releaseRecord(r) {
        r.art.map.dispose();
        r.art.dispose();
        r.label.map.dispose();
        r.label.dispose();
    }

    function trimTextures() {
        if (artCache.size <= 26) return;
        const inUse = new Set(main.slots.map(s => s.entry?.id));
        for (const [id, r] of [...artCache].sort((a, b) => a[1].used - b[1].used)) {
            if (artCache.size <= 26) break;
            if (!inUse.has(id)) {
                releaseRecord(r);
                artCache.delete(id);
            }
        }
    }

    function gallery(radius) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x15292e);
        scene.fog = new THREE.FogExp2(0x15292e, .051);
        scene.add(new THREE.HemisphereLight(0xd3e6f0, 0x92745c, .70));
        const key = new THREE.DirectionalLight(0xffd49e, .63);
        key.position.set(3, 6, 2);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xa1c9d6, .34);
        rim.position.set(-3, 4, -5);
        scene.add(rim);
        const building = new THREE.Group();
        for (const sign of [-1, 1]) {
            const lamp = new THREE.PointLight(0xffbf73, 1.75, 5, 1.6);
            lamp.position.set(sign * (WALL - .63), PICTURE_LIGHT_Y + .045, .20);
            building.add(lamp);
        }
        for (const [geo, material] of batches) {
            const repeat = new THREE.InstancedMesh(geo, material, radius * 2 + 1);
            repeat.frustumCulled = false;
            for (let i = -radius; i <= radius; i++) {
                repeat.setMatrixAt(i + radius, fixedMatrix.makeTranslation(0, 0, -i * BAY));
            }
            building.add(repeat);
        }
        scene.add(building);
        const slots = [];
        const initial = resource(achievements[0]);
        for (let n = -radius; n <= radius; n++) {
            for (let side = 0; side < 2; side++) {
                const frame = new THREE.Group();
                frame.rotation.y = wallAngle(side);
                frame.position.set(sideX(side) * ART_X, ART_Y, -BAY * n);
                const art = new THREE.Mesh(pane, initial.art);
                const label = new THREE.Mesh(plate, initial.label);
                label.position.set(ART_W / 2 + .26 + PLAQUE_W / 2, -ART_H * .29, -.079);
                frame.add(art, label);
                building.add(frame);
                const slot = { frame, art, label, n, side, bay: null, entry: null };
                art.userData.slot = label.userData.slot = slot;
                slots.push(slot);
            }
        }
        return { scene, building, slots, radius, center: null, origin: null };
    }
    const main = gallery(isSmall ? 3 : 4);
    const hitMeshes = main.slots.flatMap(s => [s.art, s.label]);
    function fill(view, center, origin) {
        if (view.center === center && view.origin === origin) return;
        view.center = center;
        view.origin = origin;
        view.building.position.z = -(center - origin) * BAY;
        for (const slot of view.slots) {
            slot.bay = center + slot.n;
            const item = achievements[mod(slot.bay * 2 + slot.side, achievements.length)];
            if (item === slot.entry) continue;
            slot.entry = item;
            const r = resource(item);
            slot.art.material = r.art;
            slot.label.material = r.label;
        }
        // Distant bays use small copies of the same print. Upgrade the nearest pair for reading.
        const order = [...view.slots].sort((a, b) => Math.abs(a.n) - Math.abs(b.n));
        for (const s of order) {
            loadPoster(s.entry, s.n === 0 || !s.entry.wallImage);
        }
        view.scene.updateMatrixWorld(true);
        trimTextures();
    }

    function nearestAddress(id, nearBay) {
        const base = byId.get(id);
        if (base === undefined) return null;
        // Choose the closest occurrence in the unbounded sequence. Odd exhibit counts
        // alternate wall sides naturally, including when walking backwards.
        const ordinal = base + Math.round((nearBay * 2 + .5 - base) / achievements.length) * achievements.length;
        return { bay: Math.floor(ordinal / 2), side: mod(ordinal, 2) };
    }

    function currentBay() {
        return logicalOrigin + Math.round(-camera.position.z / BAY);
    }

    function place(id, faceExhibit) {
        const a = nearestAddress(id, currentBay());
        if (!a) return false;
        focus(null);
        logicalOrigin = a.bay;
        const sign = sideX(a.side);
        const rect = canvas.getBoundingClientRect();
        const portrait = rect.width < rect.height * .85;
        camera.position.set(!faceExhibit && portrait ? sign * 1.8 : -sign * .80, EYE, faceExhibit ? .40 : 3.45);
        if (faceExhibit) camera.lookAt(sign * ART_X, ART_Y - .13, 0);
        else camera.lookAt(sign * (portrait ? 3.18 : 1.0), ART_Y - .28, -1.7);
        yaw = camera.rotation.y;
        pitch = camera.rotation.x;
        velocity.set(0, 0);
        keys.clear();
        selected = id;
        fill(main, a.bay, logicalOrigin);
        dirty = true;
        return true;
    }

    function pick(x = 0, y = 0) {
        camera.updateMatrixWorld();
        raycaster.setFromCamera(screenPoint.set(x, y), camera);
        raycaster.far = 8.5;
        return raycaster.intersectObjects(hitMeshes, false)[0]?.object || null;
    }

    function focus(slot) {
        const id = slot?.entry.id || null;
        if (focused === id) return;
        focused = id;
        onFocus(id);
    }

    function goTo(id, {faceExhibit = true} = {}) {
        if (!place(id, faceExhibit)) return false;
        onArrive(id);
        schedule();
        return true;
    }

    function stepThrough() {
        if (mode !== 'walk') return false;
        const exhibit = achievements[byId.get(focused || selected)];
        return exhibit?.relatedId ? goTo(exhibit.relatedId) : false;
    }

    function interact(clientX, clientY) {
        if (mode !== 'walk') return false;
        const box = canvas.getBoundingClientRect();
        const hit = Number.isFinite(clientX) && Number.isFinite(clientY)
            ? pick((clientX - box.left) / box.width * 2 - 1, 1 - (clientY - box.top) / box.height * 2)
            : pick();
        const slot = hit?.userData.slot;
        if (!slot) return false;
        onSelect(slot.entry.id);
        return true;
    }

    function updateMotion(dt) {
        const has = (...names) => names.some(name => keys.has(name));
        const forward = Number(has('forward', 'keyw', 'w', 'arrowup', 'up')) - Number(has('back', 'backward', 'keys', 's', 'arrowdown', 'down'));
        const strafe = Number(has('right', 'keyd', 'd', 'arrowright')) - Number(has('left', 'keya', 'a', 'arrowleft'));
        const speed = (has('shift', 'shiftleft', 'shiftright') ? 4.8 : 3.0) / (Math.hypot(strafe, forward) || 1);
        const smoothing = reducedMotion ? 1 : 1 - Math.exp(-13 * dt);
        velocity.x += (strafe * speed - velocity.x) * smoothing;
        velocity.y += (forward * speed - velocity.y) * smoothing;
        if (velocity.lengthSq() < .0006) {
            velocity.set(0, 0);
            return;
        }
        const dx = (Math.cos(yaw) * velocity.x - Math.sin(yaw) * velocity.y) * dt;
        const dz = (-Math.sin(yaw) * velocity.x - Math.cos(yaw) * velocity.y) * dt;
        camera.position.z += dz;
        const nextX = camera.position.x + dx;
        camera.position.x = clamp(nextX, -ART_X + .085, ART_X - .085);
        const bay = currentBay();
        if (Math.abs(bay - logicalOrigin) > 24) {
            camera.position.z += (bay - logicalOrigin) * BAY;
            logicalOrigin = bay;
        }
        if (main.center !== bay || main.origin !== logicalOrigin) {
            const side = camera.position.x < -.04 ? 0 : camera.position.x > .04 ? 1
                : main.slots.find(s => s.entry.id === selected)?.side ?? 1;
            fill(main, bay, logicalOrigin);
            selected = achievements[mod(bay * 2 + side, achievements.length)].id;
            onArrive(selected);
        }
        dirty = true;
    }

    function tick(now) {
        frameHandle = 0;
        if (disposed || retired || mode === 'paused') return;
        const elapsed = lastNow ? (now - lastNow) / 1000 : 0;
        const dt = Math.min(.05, elapsed);
        lastNow = now;
        if (mode === 'walk') updateMotion(dt);
        if (dirty) {
            dirty = false;
            focus(mode === 'walk' ? pick()?.userData.slot : null);
            renderer.render(main.scene, camera);
        }
        if (!warmed) {
            warmed = true;
            onReady();
        }
        if (mode === 'walk' || dirty) schedule();
    }
    function schedule() {
        if (!frameHandle && !disposed && !retired && mode !== 'paused') frameHandle = requestAnimationFrame(tick);
    }

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        if (w === frameWidth && h === frameHeight) return;
        frameWidth = w;
        frameHeight = h;
        camera.aspect = w / h;
        camera.fov = w / h < .9 ? 75 : 62;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        dirty = true;
        schedule();
    }

    function lost(event) {
        event.preventDefault();
        retired = true;
        cancelAnimationFrame(frameHandle);
        onError(new Error('The 3D graphics context was interrupted.'));
    }
    canvas.addEventListener('webglcontextlost', lost);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    place(byId.has(startId) ? startId : achievements[0].id, false);
    resize();
    schedule();

    // Keep the original baked architecture. Picture mouldings are instanced with
    // the rest of each bay, so their material and profile stay consistent down the hall.
    async function loadBlenderHall() {
        try {
            const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
                import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')
            ]);
            if (disposed || retired) return;
            draco = new DRACOLoader().setDecoderPath('./static/draco/gltf/').setWorkerLimit(1);
            const loader = new GLTFLoader().setDRACOLoader(draco);
            const gltf = await loader.loadAsync('./static/models/hall-gallery.glb');
            const meshes = [];
            gltf.scene.traverse(node => { if (node.isMesh) meshes.push(node); });
            const bakedMap = meshes.find(node => node.material.emissiveMap)?.material.emissiveMap;
            if (!disposed && !retired && bakedMap) {
                preservedMap = bakedMap;
                preservedMap.anisotropy = anisotropy;
                for (const mesh of meshes) {
                    const count = mesh.geometry.attributes.position.count;
                    const kind = count === 44 ? 'floor' : count === 16 ? 'wall' : count === 4 ? 'ceiling' : null;
                    if (!kind) continue;
                    const material = gradeBake(bakedMap, kind);
                    bakedSurfaces.push([mesh.geometry, material]);
                    const copy = new THREE.InstancedMesh(mesh.geometry, material, main.radius * 2 + 1);
                    copy.frustumCulled = false;
                    const sy = kind === 'ceiling' ? 2.785 : 2.136;
                    for (let n = -main.radius; n <= main.radius; n++) {
                        fixedMatrix.makeScale(WALL - .009, sy, BAY / 2);
                        fixedMatrix.setPosition(0, sy + .004, -BAY * n);
                        copy.setMatrixAt(n + main.radius, fixedMatrix);
                    }
                    main.building.add(copy);
                }
            }
            const materials = new Set();
            for (const mesh of meshes) {
                if (!bakedSurfaces.some(([g]) => g === mesh.geometry)) mesh.geometry.dispose();
                for (const mat of [].concat(mesh.material)) materials.add(mat);
            }
            const textures = new Set();
            for (const mat of materials) {
                for (const v of Object.values(mat)) if (v?.isTexture) textures.add(v);
                mat.dispose();
            }
            for (const t of textures) if (t !== preservedMap) t.dispose();
            dirty = true;
            schedule();
        } catch {
            // The modeled structural moldings remain visible if the optional bake
            // cannot load, including when a driver disables Draco workers.
        } finally {
            draco?.dispose();
            draco = null;
        }
    }

    let blenderRequested = false;
    return {
        setMode(next) {
            if (!['preview', 'walk', 'paused'].includes(next)) return;
            mode = next;
            lastNow = 0;
            keys.clear();
            velocity.set(0, 0);
            if (mode !== 'walk') {
                focus(null);
            } else if (!blenderRequested) {
                blenderRequested = true;
                loadBlenderHall();
            }
            if (mode === 'paused') {
                cancelAnimationFrame(frameHandle);
                frameHandle = 0;
            }
            dirty = true;
            resize();
            schedule();
        },
        goTo,
        stepThrough,
        move(key, pressed) {
            if (mode !== 'walk') return;
            key = String(key).toLowerCase();
            if (pressed) keys.add(key);
            else keys.delete(key);
        },
        look(dx, dy) {
            if (mode !== 'walk' || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
            yaw -= dx * .0032;
            pitch = clamp(pitch - dy * .0032, -1.12, 1.12);
            camera.rotation.set(pitch, yaw, 0, 'YXZ');
            dirty = true;
            schedule();
        },
        interact,
        dispose() {
            disposed = true;
            observer.disconnect();
            cancelAnimationFrame(frameHandle);
            canvas.removeEventListener('webglcontextlost', lost);
            for (const r of artCache.values()) releaseRecord(r);
            artCache.clear();
            const maps = new Set();
            for (const [g, m] of batches) {
                g.dispose();
                if (m.map) maps.add(m.map);
                m.dispose();
            }
            for (const m of maps) m.dispose();
            for (const [g, m] of bakedSurfaces) {
                g.dispose();
                m.dispose();
            }
            preservedMap?.dispose();
            pane.dispose();
            plate.dispose();
            renderer.dispose();
        }
    };
}
