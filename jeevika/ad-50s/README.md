# JeevikaSacredArtIN — 50s Brand Film · Production Pack

**Tagline:** Where Faith Meets Art.
**Format:** 9:16 vertical · 50.0 s · 4K UHD delivery (2160 × 3840)
**Generator:** Seedance 2.0 on Higgsfield (image-referenced) · finished in any editor (CapCut / Premiere / DaVinci)

Seedance renders 4–15 s per generation, below 4K (720p–1080p), and garbles long text. So the film is built like a real commercial:

1. **7 video clips** generated from your real product photos (prompts below).
2. **Voiceover, music and all on-screen text** added in the edit, so the brand name is pin-sharp.
3. **Upscale to 4K** and export.

---

## 0. Master timeline

| Time | Scene | Clip to generate | Gen length | Reference folder |
|---|---|---|---|---|
| 0:00–0:08 | 1 · A Divine Beginning | Clip 1 | 9 s | `refs/clip1-divine-beginning/` |
| 0:08–0:13 | 2 · Beauty of Divinity (a) | Clip 2A | 6 s | `refs/clip2a-divinity/` |
| 0:13–0:18 | 2 · Beauty of Divinity (b) | Clip 2B | 6 s | `refs/clip2b-divinity/` |
| 0:18–0:23 | 3 · Details That Inspire (a) | Clip 3A | 6 s | `refs/clip3a-details/` |
| 0:23–0:28 | 3 · Details That Inspire (b) | Clip 3B | 6 s | `refs/clip3b-details/` |
| 0:28–0:39 | 4 · Bring Divinity Home | Clip 4 | 12 s | `refs/clip4-home/` |
| 0:39–0:50 | 5 · Brand Reveal + CTA | Clip 5 | 11 s | `refs/clip5-brand-reveal/` |

Each clip is generated about 1 s longer than its slot. That extra second is a held "handle" for the dissolves. If your plan only offers fixed lengths (e.g. 5 / 10 / 15 s), pick the next length up and trim.

**Scenes 2 and 3 are split in two on purpose.** With 3 idols per generation instead of 6, Seedance keeps each idol's face and ornaments far more faithful.

### Reference images (already badge-free)

`refs/` holds your own catalogue photos. They come from `jeevika/clean/` where a clean version exists. The rest come from `with-logo/` with the round badge digitally removed, so the model never sees (or invents) a logo. Upload them **in filename order**: `image1_…` becomes `@image1`, `image2_…` becomes `@image2`, and so on. `refs-overview.jpg` shows them all at a glance.

| Deity / object | Product photo |
|---|---|
| Radha Krishna (brass, peacock base) | JSA-RKB-03, detail JSA-RKB-11 |
| Ganesha (brass, throne) | JSA-GNS-BRS-01 |
| Shiva (bronze, seated) | JSA-SHV-01, detail JSA-SHV-06 |
| Lakshmi (copper, lotus) | JSA-LKC-03, detail JSA-LKC-05 |
| Saraswati (white & gold, veena) | JSA-SRW-01 |
| Hanuman (kneeling, mace) | JSA-HNM-075-01, detail JSA-HNM-075-04 |
| Diya (brass peacock oil lamp) | JSA-PCL-05 |

### How to run each generation in Higgsfield

1. Seedance 2.0, aspect **9:16**, highest resolution offered, duration from the table.
2. Upload that clip's reference images in order (image1 first).
3. Paste the prompt exactly as written.
4. Generate **3–4 variations**. Keep the one where the idols match the photos most closely (see QC, section 4).

---

## 1. The seven prompts

> Every prompt asks for **effects audio only**. Music and voiceover go on in the edit so they run continuously across all clips. If a clip comes back with music or a voice in it, mute that clip's audio.

### CLIP 1 — A Divine Beginning · 9 s · refs: `clip1-divine-beginning`

```
Vertical 9:16, 9 seconds, one continuous shot. Ultra-realistic cinematic product film.

SPACE: The inner sanctum of an ancient South Indian stone temple at night. Carved granite pillars and a row of hanging brass temple bells stand far behind in deep shadow, seen only as soft out-of-focus shapes. Polished dark stone floor.

SUBJECT: The tall brass peacock oil lamp from @image1 — peacock finial on top, five-petal lotus bowl, ornate turned stem, round base — stands centre-frame and fills the lower 55% of the frame. The upper 40% of the frame stays dark and empty.

0.0–1.5s: Near-total darkness. One tiny flame ignites at a tip of the lotus bowl, then the fire passes petal to petal until all five wicks burn.
1.5–5.0s: Warm light blooms outward and reveals the polished brass, which catches molten-gold highlights. Red rose and orange marigold petals drift down through the frame in slow motion. A ribbon of incense smoke curls up through the light from frame left. Far behind, the brass bells catch faint glints.
5.0–9.0s: The light settles, smoke keeps drifting, petals land softly on the stone floor. The frame holds.

CAMERA: One movement only — an extremely slow push-in toward the lamp, covering 10% of frame width from 0 to 5s, then locked-off and perfectly still from 5 to 9s. Eye level, 50mm lens look, shallow depth of field, lamp in sharp focus.

LIGHT: The five flames are the key light, 1800K, gentle flicker, soft moving shadows. A faint 2200K rim light from behind separates the lamp from the background. No cool light anywhere.

COLOUR: Deep warm blacks, molten-gold brass highlights, cream-white flame cores. The lamp's shape and brass finish stay exactly as in @image1.

SOUND (effects only — no music, no voice): one second of silence; a soft match strike and flame flutter as the wicks catch; one distant temple bell at 4 seconds; faint incense crackle and quiet temple room tone.

AVOID: text, letters, logos, watermarks, extra lamps, people, fast motion, camera shake, lens flares covering the lamp.
```

### CLIP 2A — Beauty of Divinity (Radha Krishna · Ganesha · Shiva) · 6 s · refs: `clip2a-divinity`

```
Vertical 9:16, 6 seconds, three shots joined by soft cross-dissolves. Ultra-realistic product film with a slow-motion feel.

SPACE (all shots): A dark set built like a temple alcove — warm near-black backdrop with faint carved-stone texture, a polished black stone plinth under each idol, thin incense haze catching the light.

SHOT 1 (0.0–2.0s): The brass Radha Krishna idol with the peacock at their side from @image1, front view, centred, filling 70% of frame height. Extremely slow push-in, 8% of frame width over 2 seconds.
SHOT 2 (2.0–3.6s): The brass seated Ganesha on his ornate footed throne from @image2, seen from a 45-degree front-left angle. Slow 10-degree lateral arc to the right.
SHOT 3 (3.6–6.0s): The bronze seated Shiva from @image3, front view, camera slightly below eye level looking up. Locked-off camera; a soft band of warm light slowly sweeps left to right across the sculpture, then the frame holds still from 5.0s.

LIGHT: Large soft key light from camera-left at 3200K wrapping the metal; thin 2700K rim light from behind tracing each silhouette in gold; deep shadow on the far side; soft golden reflections on the polished surfaces.

COLOUR: Warm black-and-gold environment. Each idol's colour, patina and finish exactly as in its reference photo — do not tint, recolour or desaturate the idols.

PRODUCT FIDELITY: Each idol is a rigid metal sculpture reproduced exactly from its reference — same faces, expressions, crowns, ornaments, proportions and base. Radha and Krishna have two arms each, Krishna holds his flute, the peacock stays at their side. Ganesha has exactly four arms. Shiva has two arms. The idols never move, blink, breathe or change shape — only the camera and the light move.

SOUND (effects only — no music, no voice): low temple-hall room tone, a soft metallic shimmer on each dissolve, faint incense crackle.

AVOID: text, letters, logos, badges, watermarks, extra or missing arms, melted or warped details, fast camera moves, cluttered backgrounds.
```

### CLIP 2B — Beauty of Divinity (Lakshmi · Saraswati · Hanuman) · 6 s · refs: `clip2b-divinity`

```
Vertical 9:16, 6 seconds, three shots joined by soft cross-dissolves. Ultra-realistic product film with a slow-motion feel.

SPACE (all shots): The same dark temple-alcove set — warm near-black backdrop with faint carved-stone texture, a polished black stone plinth under each idol, thin incense haze in the light.

SHOT 1 (0.0–2.0s): The copper Goddess Lakshmi seated on her lotus from @image1, front view, centred, filling 70% of frame height. Extremely slow push-in, 8% of frame width over 2 seconds.
SHOT 2 (2.0–3.6s): The white-and-gold Goddess Saraswati with her veena, seated on the swan from @image2, seen from a 45-degree front-right angle. Slow 10-degree lateral arc to the left.
SHOT 3 (3.6–6.0s): The kneeling Hanuman with his golden mace from @image3, front view, camera slightly below eye level. Locked-off camera; a soft band of warm light slowly sweeps across the sculpture, then the frame holds still from 5.0s.

LIGHT: Large soft key light from camera-left at 3200K; thin 2700K golden rim light from behind; deep shadow on the far side; soft golden reflections on metal and glaze.

COLOUR: Warm black-and-gold environment. Each idol's colours exactly as in its reference — Lakshmi's copper, green and pink; Saraswati's white, gold, red and orange; Hanuman's ivory, gold and saffron. Do not tint, recolour or desaturate the idols.

PRODUCT FIDELITY: Each idol is a rigid sculpture reproduced exactly from its reference — same faces, expressions, crowns, ornaments, proportions and base. Lakshmi has exactly four arms, the upper two holding pink lotuses. Saraswati has exactly four arms and holds the veena; the swan stays beneath her. Hanuman has two arms, one hand raised in blessing, the mace resting beside him. The idols never move, blink, breathe or change shape — only the camera and the light move.

SOUND (effects only — no music, no voice): low temple-hall room tone, a soft metallic shimmer on each dissolve, a faint veena-string resonance under shot 2.

AVOID: text, letters, logos, badges, watermarks, extra or missing arms, melted or warped details, fast camera moves, cluttered backgrounds.
```

### CLIP 3A — Details That Inspire (Shiva · Lakshmi · Radha Krishna) · 6 s · refs: `clip3a-details`

```
Vertical 9:16, 6 seconds, three macro shots joined by soft cross-dissolves. Professional macro product cinematography.

SPACE: Macro tabletop set, warm dark background falling to soft black, very shallow depth of field.

SHOT 1 (0.0–2.0s): Extreme close-up matching @image1 — the coiled serpent and the strands of rudraksha beads across Shiva's bronze chest. Locked-off camera; a narrow strip of warm light glides slowly across the frame, catching the tops of the beads one by one.
SHOT 2 (2.0–4.0s): Extreme close-up matching @image2 — Lakshmi's foot with its gold anklets resting on the pink lotus above the carved copper base. Locked-off camera; slow rack focus from the carved petals in the foreground to the anklets.
SHOT 3 (4.0–6.0s): Close-up matching @image3 — the brass peacock's engraved feathers and the carved frieze of the Radha Krishna base. Extremely slow lateral slide to the right, 5% of frame width, then hold.

LIGHT: One soft key at 3000K raking low across each surface to reveal the engraving depth, soft golden specular reflections, gentle falloff into shadow.

COLOUR: Warm and golden around the sculptures; the metal, patina and paint colours exactly as in each reference photo.

PRODUCT FIDELITY: These are rigid sculptures shown at macro scale. Every carved line, bead, ornament and paint colour matches the reference photo exactly — nothing added, removed, smoothed or reshaped. The sculptures do not move; only light and focus change.

SOUND (effects only — no music, no voice): intimate close-mic room tone, a delicate metallic shimmer as the light passes, one soft bead-like tick per shot.

AVOID: text, letters, logos, watermarks, hands, people, invented ornaments, plastic-looking surfaces, motion blur, fast moves.
```

### CLIP 3B — Details That Inspire (Hanuman · Ganesha · Saraswati) · 6 s · refs: `clip3b-details`

```
Vertical 9:16, 6 seconds, three close-up shots joined by soft cross-dissolves. Professional macro product cinematography.

SPACE: Macro tabletop set, warm dark background falling to soft black, very shallow depth of field.

SHOT 1 (0.0–2.0s): Close-up matching @image1 — Hanuman's gold-painted ornaments, his hand raised in blessing and the ribbed golden head of his mace. Slow downward tilt of 10 degrees from the ornaments to the mace.
SHOT 2 (2.0–4.0s): Close-up of the brass Ganesha from @image2 — his crown, face, trunk and the fine engraved patterns on his body. Extremely slow push-in.
SHOT 3 (4.0–6.0s): Close-up of Saraswati from @image3 — her serene painted face, red-and-gold crown and the painted neck of the veena. Locked-off camera; warm light slowly blooms brighter across her face, then holds.

LIGHT: Soft key at 3000K from camera-left, golden rim at 2700K, soft golden reflections on brass and glaze, gentle falloff into shadow.

COLOUR: Warm and golden around the sculptures; every idol's colours exactly as in its reference — Hanuman ivory/gold/saffron, Ganesha antique brass, Saraswati white/gold/red.

PRODUCT FIDELITY: Rigid sculptures shown close up. Faces, expressions, crowns, ornaments, proportions and paint colours match the reference photos exactly — nothing added, removed, smoothed or reshaped. Ganesha keeps four arms and his trunk shape. The sculptures do not move; only camera, light and focus change.

SOUND (effects only — no music, no voice): intimate close-mic room tone, a soft metallic shimmer as the light blooms, one faint distant temple bell at 5 seconds.

AVOID: text, letters, logos, watermarks, people, invented ornaments, changed faces, plastic-looking surfaces, motion blur, fast moves.
```

### CLIP 4 — Bring Divinity Home · 12 s · refs: `clip4-home`

```
Vertical 9:16, 12 seconds, four shots joined by soft cross-dissolves. Ultra-realistic lifestyle film.

SPACE: A calm, elegant modern Indian home — warm teak wood, white marble, brass accents, carved jaali screens, morning sunlight.

SHOT 1 (0.0–3.0s): A carved teak home temple (mandir) with a white marble shelf. Inside, the brass Radha Krishna from @image1 stands centred and the brass Ganesha from @image2 sits to its left, with fresh marigold garlands and a small brass bell. Sunlight falls through a jaali screen in soft patterned beams. Extremely slow push-in, 8% of frame width.
SHOT 2 (3.0–5.5s): A peaceful meditation corner beside a tall window. The bronze Shiva from @image3 rests on a low stone plinth; in the soft-focus foreground a woman in a cream cotton kurta sits cross-legged, eyes closed. Locked-off camera; slow rack focus from her to the Shiva idol.
SHOT 3 (5.5–8.5s): At the home temple, a grandmother, a mother and a young daughter in traditional silk clothing gently offer marigold and rose petals before the copper Lakshmi from @image4; petals fall in slow motion around the idol. Slow 8-degree lateral arc.
SHOT 4 (8.5–12.0s): The father lights the brass peacock oil lamp from @image5 with a long matchstick; the flame blooms warm; the whole family joins their palms in namaste, faces softly lit by the diya. Locked-off camera, frame holds still from 10.5s.

PEOPLE: A natural, warm Indian family with realistic skin texture, natural hands with five fingers, calm and reverent expressions, modest traditional clothing. They never touch, lift or move the idols.

LIGHT: Morning daylight at 4500K through windows and the jaali, mixed with diya flames at 1900K; soft shadows; warm, inviting.

COLOUR: Warm golden interior; idol colours exactly as in their reference photos.

PRODUCT FIDELITY: Every idol and the lamp are reproduced exactly from their references — same faces, ornaments, proportions, colours and bases. They are rigid objects that never move or change shape.

SOUND (effects only — no music, no voice): soft birdsong outside, a small brass hand bell tinkling, petals landing, a match strike and flame bloom in shot 4.

AVOID: text, letters, logos, watermarks, extra fingers, distorted faces, idols changing size or design, clutter, fast camera moves.
```

### CLIP 5 — Brand Reveal & Call to Action · 11 s · refs: `clip5-brand-reveal`

```
Vertical 9:16, 11 seconds, one continuous shot. Ultra-realistic cinematic product film.

SPACE: Endless warm darkness filled with slowly drifting gold dust and soft golden bokeh.

SUBJECT: The brass peacock oil lamp from @image1 with all five wicks burning, centred in the lower 45% of the frame. The upper 50% of the frame is an empty warm-dark gradient with only faint drifting gold dust.

0.0–3.0s: The shot opens as an extreme close-up of one flame; the camera slowly pulls back to reveal the whole lamp.
3.0–9.5s: The camera is locked-off and perfectly still; flames flicker gently; gold dust rises slowly through the empty upper frame.
9.5–11.0s: A soft golden glow blooms outward from the flames until the whole frame fills with warm gold light.

CAMERA: One movement only — a slow, smooth pull-back from 0 to 3s, then completely still.

LIGHT: The flames are the key light at 1800K; warm 2200K glow on the brass; gold particles catch the light.

COLOUR: Deep warm blacks rising to radiant gold; the lamp's shape and brass finish exactly as in @image1.

SOUND (effects only — no music, no voice): soft warm room tone and a faint flame flutter; one gentle temple bell strike at 9 seconds, ringing out to the end.

AVOID: text, letters, logos, watermarks, people, extra lamps, camera shake.
```

---

## 2. Voiceover (record or generate separately)

**Voice:** warm, calm, unhurried; clear Indian-English or neutral international accent; about 130 words per minute; a light, intimate room reverb. Leave natural pauses at the ellipses.

| In | Out | Line |
|---|---|---|
| 0:01.5 | 0:07.0 | "Some things are more than art… they are a symbol of faith, devotion and love." |
| 0:09.0 | 0:16.5 | "Discover the divine beauty of sacred Indian art, where every creation tells a beautiful story." |
| 0:19.0 | 0:26.0 | "Every detail reflects creativity, devotion and the timeless beauty of Indian tradition." |
| 0:29.0 | 0:38.0 | "Make your home more beautiful. Celebrate your traditions. Bring a touch of divinity into your everyday life." |
| 0:40.5 | 0:46.0 | *(optional)* "JeevikaSacredArtIN… where faith meets art. Explore our sacred collection today." |

The brief gives no voiceover for Scene 5, so the last line is optional. Without it, Scene 5 plays with music, the bell and on-screen text only.

## 3. Music, on-screen text and finishing

**Music (one continuous track, licensed or AI-generated):** devotional instrumental at 60–66 BPM. Tanpura drone throughout, bansuri flute melody, santoor shimmer and soft temple-bell accents. Build gently from 0:28, swell at 0:39 for the brand reveal, and resolve on the final bell at about 0:48–0:50. Duck the music about 8 dB under the voiceover.

**On-screen text (added in the editor, never in Seedance):**

| In–Out | Text | Placement |
|---|---|---|
| 0:04.5–0:07.8 | **JEEVIKASACREDARTIN** | upper third, slow fade + letter-spacing reveal |
| 0:40.0–0:50.0 | **JEEVIKASACREDARTIN** (your real round logo above it, if you have the file) | upper third |
| 0:42.0–0:50.0 | *Where Faith Meets Art.* | under the brand name |
| 0:44.5–0:47.0 | Explore Our Sacred Collection Today! | centre, above the lamp |
| 0:47.0–0:50.0 | Find Your Divine Favourite. | replaces the line above |

- **Fonts:** Cinzel (brand name) + Cormorant Garamond Italic (tagline/CTA), both free on Google Fonts.
- **Colour:** gold gradient #F5D27A → #B8862B with a faint warm glow.
- **Safe zone:** keep all text between 12% and 70% of frame height and away from the right edge, where Reels/Shorts buttons sit.

**Assembly and 4K:**

1. Upscale every chosen clip to **2160 × 3840** first (Topaz Video AI or CapCut "Enhance quality"), then edit on a 2160 × 3840 timeline.
2. Lay clips into their slots from the master timeline. Use **0.5 s cross-dissolves** centred on each boundary, built from the 1 s handles. Use a slow fade into warm gold at the very end.
3. Apply one light, shared warm grade across all clips so they match. Keep the idol colours true; don't push saturation on painted idols.
4. Add music, voiceover and text as above. Mute any clip audio that contains music or voices.
5. Export H.264 or H.265, 2160 × 3840, 24 or 30 fps, 40–60 Mbps, AAC 320 kbps. Length **exactly 50.00 s**.

## 4. Quality check (before you publish)

Check every idol frame-by-frame against its photo in `refs/`:

- [ ] Faces, expressions and crowns identical; no melting or morphing during camera moves
- [ ] Arm counts: Ganesha 4 · Lakshmi 4 · Saraswati 4 · Shiva 2 · Hanuman 2 · Radha 2 · Krishna 2 (with flute)
- [ ] Colours unchanged (copper Lakshmi, white-and-gold Saraswati, ivory-gold Hanuman, antique brass and bronze)
- [ ] Bases and attributes present: peacock, swan, veena, lotuses, mace, trident, throne
- [ ] No text, logos or watermarks generated inside any clip
- [ ] Family in Clip 4: natural hands (5 fingers), natural faces, nobody handling the idols
- [ ] Brand name spelled **JEEVIKASACREDARTIN** everywhere

**If an idol drifts:** first regenerate that clip. If it still drifts, regenerate just that one shot as its own 4–5 s clip. For any close-up that won't stay faithful, use the real product photo itself in the edit with a slow 5% zoom and a light sweep. That is 100% faithful and looks the same in motion.
