# JeevikaSacredArtIN — 50s photo-motion film

`JeevikaSacredArtIN_50s_1080p.mp4` is the finished 50-second 9:16 ad with voiceover, music and the end-card bell. A 4K master (2160×3840) was rendered too. It is not in the repository because it is 212 MB, and GitHub caps files at 100 MB.

Every idol and the lamp come from the real catalogue photos. They are background-removed cutouts and sharpened crops, never redrawn by AI, so designs, faces, colours and proportions are unchanged. Backdrops, light, flames, gold dust, petals and typography are generated in `render_film.py`.

| Time | Scene | Photos used |
|---|---|---|
| 0–8 s | Brass peacock lamp lights up in a dark temple; brand name | JSA-PCL-05 |
| 8–18 s | Six idols on a black plinth in a carved niche | RKB-03, GNS-BRS-01, SHV-01, LKC-03, SRW-01, HNM-075-01 |
| 18–28 s | Detail close-ups with a gold light sweep | SHV-06, LKC-05, RKB-11, HNM-075-04, GNS-BRS-01, SRW-01 |
| 28–39 s | Idols at home, lit turtle diya | RKB-03, LKC-03, SRW-01, TRD-01 |
| 39–50 s | Real Jeevika logo, brand name, tagline, call to action, golden glow | JSA-PCL-05, logo from the photo badge |

`audio/` holds the narration lines, the music bed, the bell and the mixed soundtrack. `fonts/` holds Cinzel and Cormorant Garamond.

**Not in this version yet:** the family offering flowers and lighting a diya, a meditation corner and an AI-made home temple. Those six scene images are already generated in the brand's Runway account. They can be swapped into scene 4, and into scenes 1, 2 and 5 as backdrops, once Runway's file host is allowed in the cloud environment's network settings.

Re-render: `python3 render_film.py ASSETS out.mp4 --workers 4`, where ASSETS holds `cut/`, `up/` and `src/` as listed in the script. Then mux `audio/soundtrack-preview-50s.m4a`.
