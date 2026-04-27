# Specifiche Modello 3D Avatar — Kiosk + Three.js

## Formato di esportazione
- **Formato**: GLB (GLTF Binary) — un file unico, nessuna dipendenza esterna
- **Versione GLTF**: 2.0
- **Esportatore Blender**: File → Export → glTF 2.0 (.glb/.gltf)

---

## Geometria

| Parametro | Valore consigliato |
|---|---|
| Poligoni totali (tris) | 15.000 – 30.000 |
| Mesh separate | Il meno possibile (1–5 max) |
| Scala | 1 unità Blender = 1 metro |
| Orientamento | Asse Y verso l'alto, Z verso la telecamera |
| Origine | Ai piedi del personaggio (0, 0, 0) |

Evitare n-gon: usare solo triangoli o quad. Applicare tutti i modificatori prima dell'esportazione.

---

## Texture

| Parametro | Valore |
|---|---|
| Formato | PNG o JPG (no EXR, no TIFF) |
| Risoluzione | 1024×1024 o 2048×2048 max |
| Tipo | PBR: Base Color, Normal, Roughness/Metallic |
| Color Space | Base Color → sRGB / Normal → Non-Color |
| Embedding | Incluse nel GLB (opzione "Include → Textures") |

---

## Scheletro (Armature)

- **Tipo**: Human Metarig o scheletro custom
- **Naming convention**: compatibile Mixamo (`mixamorig:` o simile) per facilitare il riutilizzo di animazioni
- **Bone obbligatori per lip sync**:
  - `jaw` / `Jaw` — rotazione X per apertura bocca ← **fondamentale**
  - oppure morph target `jawOpen` (vedi sezione Morph Target)
- **Bone consigliati**:
  - `Head`, `Neck`, `Spine`, `Hips`
  - Ossa delle dita (opzionale, per gesture mani)
- **Max bone influences per vertice**: 4

---

## Morph Target (Shape Keys in Blender)

Per il lip sync più preciso aggiungere questi shape key alla mesh della testa:

| Nome | Descrizione |
|---|---|
| `jawOpen` | Apertura mandibola |
| `mouthSmile` | Sorriso (opzionale) |
| `eyeBlinkLeft` | Ammiccamento occhio sinistro (opzionale) |
| `eyeBlinkRight` | Ammiccamento occhio destro (opzionale) |

> In alternativa ai viseme completi (standard Ready Player Me), `jawOpen` da solo è sufficiente per un lip sync funzionale.

**Come crearli in Blender:**
1. Seleziona la mesh del viso
2. Properties → Object Data → Shape Keys → `+`
3. Aggiungi `Basis` (posa neutra) e `jawOpen` (bocca aperta)
4. Nell'esportazione GLB spuntare **Morph Targets**

---

## Animazioni

- **Incluse nel GLB**: sì (opzione "Include → Animations")
- **Tipo**: Skeletal animation (Armature keyframes)
- **Frame rate**: 30 FPS
- **Animazioni consigliate**:

| Nome action Blender | Descrizione | Range tipico |
|---|---|---|
| `idle` | Animazione di attesa (respiro, micro-movimenti) | 0–120 frames |
| `talking` | Gesticolazione mentre parla | 121–280 frames |
| `wave` | Saluto (opzionale) | 281–340 frames |

- Ogni animazione deve avere **keyframe all'inizio e alla fine** della propria finestra
- Nessun frame vuoto tra animazioni diverse
- Le action Blender diventano entries separate in `gltf.animations[]`

---

## Impostazioni esportazione Blender

```
File → Export → glTF 2.0

Include:
  ✅ Selected Objects (se vuoi esportare solo il personaggio)
  ✅ Visible Objects

Transform:
  ✅ Y Up

Geometry:
  ✅ Apply Modifiers
  ✅ UVs
  ✅ Normals
  ✅ Tangents (se usi normal map)

Armature:
  ✅ Export Deformation Bones Only (riduce dimensioni)

Skinning:
  ✅ Include Armature

Animation:
  ✅ Animations
  ✅ Shape Keys  ← per morph target
  ✅ Skinning
  ✅ NLA Tracks (se usi NLA editor per separare le action)

Sampling Rate: 1 (= 30fps se il progetto è a 30fps)
```

---

## Checklist pre-esportazione

- [ ] Tutti i modificatori applicati
- [ ] Scale applicata (Ctrl+A → Apply Scale)
- [ ] Origine ai piedi del personaggio
- [ ] Bone `jaw` presente nella armature (o shape key `jawOpen`)
- [ ] Texture embedded nel GLB (non file separati)
- [ ] Animazioni nominate correttamente in Blender (NLA Editor)
- [ ] Testato su [gltf.report](https://gltf.report) per validazione

---

## Dimensioni file target

| Elemento | Dimensione consigliata |
|---|---|
| File GLB totale | < 20 MB |
| Texture totali | < 8 MB |
| Geometria | < 2 MB |
| Animazioni | < 5 MB |

File più grandi rallentano il caricamento iniziale del kiosk.

---

## Note Three.js r128

- Usare **MeshStandardMaterial** (PBR) — supportato nativamente
- Evitare materiali **Emission** molto intensi (possono sembrare diversi dal render Blender)
- Il sistema di coordinate Blender (Z-up) viene convertito automaticamente da GLTFLoader
- `outputEncoding = THREE.sRGBEncoding` già impostato nel progetto
