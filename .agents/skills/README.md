# Manifest Adopsi Skill Proyek (`clip-content-rewards`)

Proyek ini mengadopsi **25 Core Skills** dari total **62 skill unik global** (`61` di `C:\Users\ASUS\.gemini\config\skills\` + `1` unik `motion-design` di `C:\Users\ASUS\.agents\skills\`), ditambah **1 local domain skill** khusus proyek ini ([edl-video-renderer/SKILL.md](./edl-video-renderer/SKILL.md)).

---

## 1. Local Project Skill (Khusus `clip-content-rewards`)

| Skill Lokal | Lokasi | Fungsi Utama |
| :--- | :--- | :--- |
| **`edl-video-renderer`** | [.agents/skills/edl-video-renderer/SKILL.md](./edl-video-renderer/SKILL.md) | Resep teknis FFmpeg 8.1.2 `spawn` anti-injection, konversi EDL JSON -> filter_complex, audio mute/ducking/loudnorm, ASS Safe-Zone captions, dan FFprobe verification. |

---

## 2. Daftar 25 Global Core Skills Teradopsi (MVP v1.0)

| Kelompok | Nama Skill | Sumber Global | Tahap Penggunaan Utama |
| :--- | :--- | :--- | :--- |
| **Governance & Planning (5)** | `pm`, `goal-tracker`, `tech-critic`, `agentic-ai`, `graphify` | `~/.gemini/config/skills/` | `M1`, `M2`, `M3`, & Review Gate setiap milestone |
| **Video Auto-Editing & QA (5)** | `herk-edit-kit`, `hyperframes`, `motionmaxxing`, `showtime`, `hypit` | `~/.gemini/config/skills/` | `M5`, `M6`, `M7`, `M8` (pipeline cut, hook, caption, multi-varian, safe-zone QA) |
| **Engineering & UI Studio (7)** | `backend`, `frontend`, `shadcn-ui`, `untitled-ui`, `design-dna`, `paint`, `motion` | `~/.gemini/config/skills/` | `M3` - `M9` (Express TS, Nuxt 3/Vue 3, Pinia, Vue Query, Shadcn Vue) |
| **Anti-Slop Quality Suite (6)** | `antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-human`, `antislop-layoutmobile`, `antislop-code` | `~/.gemini/config/skills/` | Seluruh milestone & Mandatory Delivery Gate `M10` |
| **Verification & E2E (2)** | `qa`, `playwright` | `~/.gemini/config/skills/` | `M4` - `M10` (Unit, Integration, Media Probe, E2E) |

---

## 3. Skill Pendukung / Opsional Fase V2 (19 Skill - On-Demand)

- **Diagram & Dokumentasi:** `stack-diagram`, `archify`
- **Ekspansi Studio Video V2:** `openmotion`, `reelmimic`, `motlab`, `motlab-assets`, `ml-vision`, `webbrain`
- **Ekspor & UI Polish Tambahan:** `excel-export`, `playwright-skill`, `motion-design-skill`, `motion-design`, `21st-dev`, `magic-ui`, `react-bits`, `animate-ui`, `cast`, `animejs`, `_jutsu`

## 4. Skill Excluded (18 Skill - Di Luar Domain)

- `3d-configurator-simulator`, `diorama`, `teardown`, `ohmygame-studio`, 10 modul `threejs-*`, `mocha`, `posewear`, `code-animation-prompts`, `habblaud`.
