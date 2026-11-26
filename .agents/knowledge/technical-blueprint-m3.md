# Technical Blueprint M3: Schema, Zod Contracts, API Map & Visual-First Gate

> **Milestone 3 (`M3`) Architecture Lock Document**
> Proyek: `clip-content-rewards` | Versi: `v1.1` | Status: **Reviewed by Tech Critic & QA (Ready for M4 Scaffolding)**
> Terakhir Diperbarui: `2026-11-26`

Dokumen ini menjadi *Single Source of Truth* teknis sebelum menulis baris kode pertama di **M4**, berisi:
1. Penutupan 7 Celah Lapangan (`PRD.md` v1.0 -> v1.1)
2. Final **Prisma Schema Blueprint** (11 Model, SQLite WAL + PostgreSQL-Portable)
3. Final **Zod Boundary Contracts** (Brief, Target Config, EDL v1.1, EDL Patch, Viral Score, Upload Playbook)
4. **REST API & SSE Endpoint Map** (`M4` - `M9`)
5. **Visual-First Engineering Gate**: ASCII Wireframe 5 Layar Utama (Desktop + Mobile) & Pilihan Arah Desain (`DESIGN.md` Gate)
6. **Tech Critic & QA Independent Pre-Mortem Review**

---

## 1. Matriks Penutupan 7 Celah Lapangan (`PRD.md v1.1`)

| No | Celah Lapangan Terdeteksi | Risiko Jika Tidak Ditangani | Solusi Terkunci di Blueprint M3 |
| :-: | :--- | :--- | :--- |
| **1** | **Video Mentah Panjang (>1 jam) vs Limit Whisper 25 MB** | Transkripsi gagal `413 Payload Too Large` untuk podcast/live stream. | Ekstrak audio mono 16kHz MP3 64kbps -> otomatis split per `10 menit` (overlap `2s`, ~4.8 MB/chunk) -> merge word timestamps dengan offset presisi + deduplikasi kata di zona overlap. |
| **2** | **Supporting Assets Wajib Campaign (Watermark/Logo/Outro/B-Roll)** | Kreator terpaksa edit ulang di aplikasi lain hanya untuk menempel logo/outro brief. | Kolom `media_assets.asset_type` mendukung `raw_video`, `watermark`, `outro`, `broll` + blok `supportingOverlays` di `EDL JSON v1.1`. |
| **3** | **Video Sumber 16:9 Berisi Teks/Presentasi di Pinggir** | Center crop langsung ke 9:16 memotong teks penting atau pembicara kedua. | 3 mode framing pada `EDL v1.1`: `center_crop`, `fit_blur_bg` (fit lebar + latar blur estetis), dan `split_screen` (atas-bawah). |
| **4** | **Pengisian Berulang Parameter Target untuk Multi-Akun** | Melelahkan mengisi 12+ parameter setiap campaign baru. | Tabel baru `target_profiles` (CRUD preset profil target audiens 1-klik, misal *"ID Gen-Z Santai"*, *"US Finance Hot-Take"*). |
| **5** | **AI Membuat 5 Variasi dari Momen Detik yang Sama Persis** | Batch variasi terasa duplikat dan boros waktu render. | Parameter `batchDiversityMode`: `distinct_moments` (validator menolak overlap antar clip > `30%`) vs `ab_hook_test` (sengaja 1 momen inti, variasi hook 0-3s, style & angle). |
| **6** | **Font Subtitle Inkonsisten di FFmpeg Windows** | Subtitle jatuh ke Arial tipis yang kurang mencolok di TikTok/Shorts. | Bundle font open-source (OFL) di `server/assets/fonts/` (`Montserrat-ExtraBold.ttf`, `Inter-Bold.ttf`, `PlusJakartaSans-ExtraBold.ttf`) dan panggil via `fontsdir` pada filter ASS FFmpeg. |
| **7** | **Audio Mentah Bisu / Terlalu Pelan / Penuh Musik** | User bingung memilih mode audio awal sebelum generate. | Jalankan `ffprobe` + `ebur128`/`volumedetect` saat upload selesai -> tampilkan **Audio Diagnostic Card** + saran otomatis (*Original*, *Ducking 20%*, atau *Mute 0%*). |

---

## 2. Final Prisma Schema Blueprint (`prisma/schema.prisma`)

Dirancang untuk **SQLite (WAL Mode)** di lokal PC tanpa konfigurasi server eksternal, sekaligus **100% kompatibel migrasi ke PostgreSQL** (menggunakan `String` untuk enum/JSON dengan validasi ketat di lapisan Zod TypeScript agar bebas perbedaan tipe native SQLite vs Postgres).

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // file:../storage/clip_content_rewards.db
}

model User {
  id            String          @id @default(cuid())
  email         String          @unique
  name          String
  passwordHash  String          @map("password_hash")
  role          String          @default("admin") // admin | operator
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")

  apiKeys        ApiKey[]
  targetProfiles TargetProfile[]
  campaigns      Campaign[]

  @@map("users")
}

model ApiKey {
  id            String   @id @default(cuid())
  userId        String   @map("user_id")
  provider      String   // gemini | openai | anthropic | openrouter | groq | deepgram
  role          String   // brain | stt | tts
  label         String
  encryptedKey  String   @map("encrypted_key") // AES-256-GCM hex
  iv            String   // 12-byte hex
  authTag       String   @map("auth_tag") // 16-byte hex
  maskedPreview String   @map("masked_preview") // e.g. AIza...9x2k
  defaultModel  String   @map("default_model")
  isActive      Boolean  @default(true) @map("is_active")
  lastTestedAt  DateTime? @map("last_tested_at")
  lastTestOk    Boolean? @map("last_test_ok")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, role, isActive])
  @@map("api_keys")
}

model MasterPreset {
  id         String   @id @default(cuid())
  category   String   // country | age_group | editing_style | hook_type | controversy_level | framing_mode | prompt_preset
  code       String
  labelId    String   @map("label_id") // Tampilan Bahasa Indonesia
  configJson String   @map("config_json") // JSON metadata (timezone, promptTemplate, dsb.)
  sortOrder  Int      @default(0) @map("sort_order")
  isActive   Boolean  @default(true) @map("is_active")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@unique([category, code])
  @@index([category, isActive, sortOrder])
  @@map("master_presets")
}

model TargetProfile {
  id               String   @id @default(cuid())
  userId           String   @map("user_id")
  profileName      String   @map("profile_name")
  description      String?
  targetConfigJson String   @map("target_config_json")
  isDefault        Boolean  @default(false) @map("is_default")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  user    User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  batches GenerationBatch[]

  @@index([userId])
  @@map("target_profiles")
}

model Campaign {
  id                  String    @id @default(cuid())
  userId              String    @map("user_id")
  title               String
  brandOwner          String?   @map("brand_owner")
  platformTargetsJson String    @map("platform_targets_json") // ["tiktok", "youtube_shorts"]
  rewardNotes         String?   @map("reward_notes")
  deadlineAt          DateTime? @map("deadline_at")
  status              String    @default("draft") // draft | ready | processing | completed | archived
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  user        User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  brief       CampaignBrief?
  mediaAssets MediaAsset[]
  batches     GenerationBatch[]

  @@index([userId, status])
  @@map("campaigns")
}

model CampaignBrief {
  id                 String   @id @default(cuid())
  campaignId         String   @unique @map("campaign_id")
  sourceType         String   @map("source_type") // pdf | docx | doc | text
  originalFilename   String?  @map("original_filename")
  storedFilePath     String?  @map("stored_file_path")
  rawText            String   @map("raw_text")
  parsedRulebookJson String   @map("parsed_rulebook_json")
  confirmedByUser    Boolean  @default(false) @map("confirmed_by_user")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@map("campaign_briefs")
}

model MediaAsset {
  id                  String   @id @default(cuid())
  campaignId          String   @map("campaign_id")
  assetType           String   @map("asset_type") // raw_video | watermark | outro | broll
  originalFilename    String   @map("original_filename")
  filePath            String   @map("file_path") // relative path inside storage/
  mimeType            String   @map("mime_type")
  fileSizeBytes       Int      @map("file_size_bytes")
  durationSec         Float?   @map("duration_sec")
  width               Int?
  height              Int?
  fps                 Float?
  hasAudio            Boolean  @default(true) @map("has_audio")
  loudnessLufs        Float?   @map("loudness_lufs")
  audioDiagnosticJson String?  @map("audio_diagnostic_json")
  transcriptJson      String?  @map("transcript_json") // word-level timestamps
  silencesJson        String?  @map("silences_json") // [{ startSec, endSec }]
  status              String   @default("uploaded") // uploading | uploaded | analyzing | ready | failed
  errorMessage        String?  @map("error_message")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId, assetType])
  @@map("media_assets")
}

model GenerationBatch {
  id                 String   @id @default(cuid())
  campaignId         String   @map("campaign_id")
  targetProfileId    String?  @map("target_profile_id")
  targetConfigJson   String   @map("target_config_json")
  batchDiversityMode String   @default("distinct_moments") @map("batch_diversity_mode") // distinct_moments | ab_hook_test
  requestedCount     Int      @map("requested_count")
  status             String   @default("queued") // queued | processing | partial_success | completed | failed | cancelled
  estimatedTokens    Int?     @map("estimated_tokens")
  actualTokens       Int?     @map("actual_tokens")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  campaign      Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  targetProfile TargetProfile? @relation(fields: [targetProfileId], references: [id], onDelete: SetNull)
  clips         Clip[]

  @@index([campaignId, status])
  @@map("generation_batches")
}

model Clip {
  id              String   @id @default(cuid())
  batchId         String   @map("batch_id")
  sequenceIndex   Int      @map("sequence_index")
  angleTitle      String   @map("angle_title")
  hookSummary     String?  @map("hook_summary")
  activeVersionId String?  @map("active_version_id")
  isApproved      Boolean  @default(false) @map("is_approved")
  status          String   @default("queued") // queued | processing | ready | failed
  errorMessage    String?  @map("error_message")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  batch    GenerationBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  versions ClipVersion[]

  @@index([batchId, status])
  @@map("clips")
}

model ClipVersion {
  id                 String   @id @default(cuid())
  clipId             String   @map("clip_id")
  versionNumber      Int      @map("version_number")
  userPrompt         String?  @map("user_prompt") // null untuk v1 initial generate
  appliedPresetsJson String?  @map("applied_presets_json")
  edlJson            String   @map("edl_json")
  outputVideoPath    String?  @map("output_video_path")
  outputSrtPath      String?  @map("output_srt_path")
  outputAssPath      String?  @map("output_ass_path")
  coverImagePath     String?  @map("cover_image_path")
  actualDurationSec  Float?   @map("actual_duration_sec")
  viralScoreTotal    Int?     @map("viral_score_total") // 0-100
  briefCompliance    String?  @map("brief_compliance") // pass | warn | fail
  scoreBreakdownJson String?  @map("score_breakdown_json")
  impactCritiqueJson String?  @map("impact_critique_json")
  uploadPlaybookJson String?  @map("upload_playbook_json")
  renderDurationMs   Int?     @map("render_duration_ms")
  createdAt          DateTime @default(now()) @map("created_at")

  clip Clip @relation(fields: [clipId], references: [id], onDelete: Cascade)

  @@unique([clipId, versionNumber])
  @@index([clipId, viralScoreTotal])
  @@map("clip_versions")
}

model RenderJob {
  id           String    @id @default(cuid())
  jobType      String    @map("job_type") // transcribe_media | generate_batch | render_clip | regenerate_clip
  entityId     String    @map("entity_id")
  payloadJson  String    @map("payload_json")
  status       String    @default("queued") // queued | processing | completed | failed | cancelled
  progressPct  Int       @default(0) @map("progress_pct")
  stageLabel   String    @default("Menunggu antrean") @map("stage_label")
  errorMessage String?   @map("error_message")
  retryCount   Int       @default(0) @map("retry_count")
  maxRetries   Int       @default(2) @map("max_retries")
  startedAt    DateTime? @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@index([status, createdAt])
  @@index([entityId])
  @@map("render_jobs")
}
```

---

## 3. Kontrak Validasi Zod (`server/schemas/`)

Seluruh input HTTP dan output JSON dari AI API wajib melewati 6 skema kontrak utama ini sebelum menyentuh database maupun FFmpeg:

1. **`BriefRulebookSchema`**:
   - `campaignGoal: string`, `targetPlatforms: ('tiktok' | 'youtube_shorts' | 'youtube_long')[]`
   - `durationRules: { minSec: number; maxSec: number; idealSec?: number }`
   - `mandatoryDos: string[]` (CTA, hashtag wajib, mention akun, disclosure `#ad`, produk tampil)
   - `strictDonts: string[]` (klaim terlarang, topik sensitif, musik copyright terlarang)
   - `requiredHashtags: string[]`, `requiredMentions: string[]`, `brandTone: string`
2. **`TargetConfigSchema`**:
   - `platform: 'tiktok' | 'youtube_shorts' | 'youtube_long'`
   - `countryCode: string`, `languageStyle: string`, `ageGroup: string`, `genderFocus: 'all' | 'male' | 'female'`
   - `personaNiche: string`, `controversyLevel: 'safe_edu' | 'bold_opinion' | 'hot_take' | 'controlled_debate'`
   - `hookType: string`, `emotionalTrigger: string`, `primaryKpi: 'watch_time' | 'comments' | 'shares' | 'clicks'`
   - `editingStyle: string`, `framingMode: 'center_crop' | 'fit_blur_bg' | 'split_screen'`
   - `captionStyle: 'hormozi_bold' | 'clean_minimal' | 'bilingual' | 'off'`
   - `initialAudioMode: 'original_normalized' | 'ducking_20' | 'mute_for_platform_sound'`
   - `batchDiversityMode: 'distinct_moments' | 'ab_hook_test'`, `batchCount: number` (1..10)
   - `supportingAssets: { watermarkAssetId?: string | null; outroAssetId?: string | null }`
3. **`EdlSchema` (v1.1)**:
   - Validasi setiap segmen: `startSec >= 0`, `endSec > startSec`, dan *runtime clamp* `endSec <= mediaAsset.durationSec`.
   - Validasi `audio.originalVolume` antara `0.0` dan `1.5`, boolean `muteOriginal`, `intendedPlatformSound`.
   - Validasi `captions.verticalOffsetPct` berada di batas aman Safe-Zone (`55` - `80` untuk TikTok/YT Shorts).
4. **`EdlPatchSchema` (Untuk M8 Prompt Re-Editor)**:
   - Hanya mengizinkan perubahan parsial terstruktur (`audioPatch?`, `segmentsPatch?`, `hookBannerPatch?`, `captionsPatch?`, `framingMode?`, `supportingOverlaysPatch?`, `humanSummary: string`) sehingga prompt *"mute audio asli"* tidak secara tidak sengaja merusak potongan video yang sudah bagus!
5. **`ViralScoreCritiqueSchema`**:
   - `totalScore: number (0..100)`, `briefComplianceStatus: 'pass' | 'warn' | 'fail'`
   - `dimensions`: `hookStrength`, `retentionPacing`, `briefCompliance`, `audienceFit`, `engagementTrigger`, `audioSafeZone` (masing-masing `0..100` + 1 kalimat alasan nyata).
   - `briefChecklist`: `{ rule: string; status: 'pass' | 'warn' | 'fail'; evidence: string }[]`
   - `projectedImpact`: `{ firstThreeSeconds: string; midRetention: string; commentSharePotential: string; audienceReactionSummary: string }`
   - `critiques`: `{ id: string; timestampSec?: number; severity: 'high' | 'medium' | 'low'; issue: string; suggestedRegeneratePrompt: string }[]`
6. **`UploadPlaybookSchema`**:
   - `audioMusicGuide`: `{ renderedAudioState: string; recommendedMusicVibe: string; bpmRange: string; platformMixingInstruction: string }`
   - `titleOptions`: `string[]` (tepat 3 opsi A/B)
   - `captionDescription`: `string`
   - `hashtags`: `{ mandatory: string[]; niche: string[]; broad: string[] }`
   - `optimalSchedule`: `{ timezone: string; bestDays: string[]; bestTimeSlots: string[]; rationale: string }`
   - `engagementToolkit`: `{ pinnedComments: string[]; first15MinChecklist: string[]; coverFrameSec: number }`

---

## 4. REST API & SSE Endpoint Map (`M4` - `M9`)

Seluruh endpoint menggunakan **relative path `/api/...`** melalui proxy Nuxt 3 dan mengembalikan format JSON murni `{ success, data, error, meta }`.

| Modul | Method & Endpoint | Auth | Fungsi Utama |
| :--- | :--- | :-: | :--- |
| **System & Auth (M4)** | `GET /api/health` | Publik | Health check server |
| | `GET /api/auth/setup-status`, `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Mixed | Setup akun pertama, login cookie HttpOnly, cek sesi |
| | `GET /api/system/doctor` | Auth | Cek versi FFmpeg/FFprobe, bundled fonts, ruang disk `storage/` |
| **BYOK & Presets (M4)** | `GET/POST/DELETE /api/api-keys`, `POST /api/api-keys/:id/test` | Auth | CRUD API Key terenkripsi + masking + Test Connection |
| | `GET/POST/PATCH/DELETE /api/presets` | Auth | CRUD `master_presets` dinamis (anti-hardcode) |
| | `GET/POST/PATCH/DELETE /api/target-profiles` | Auth | CRUD Profil Preset Target Audiens reusable |
| **Campaign & Brief (M5)** | `GET/POST/PATCH/DELETE /api/campaigns`, `GET /api/campaigns/:id` | Auth | Manajemen campaign Content Rewards |
| | `POST /api/campaigns/:id/brief/upload`, `PATCH /api/campaigns/:id/brief` | Auth | Upload & parse `.pdf/.docx/.doc`/teks -> edit & konfirmasi rulebook |
| **Raw Media (M5)** | `POST /api/campaigns/:id/media/chunk`, `POST /api/campaigns/:id/media/complete` | Auth | Chunked upload video besar & supporting assets (watermark/outro/B-roll) |
| | `POST /api/media/:id/analyze`, `GET /api/media/:id`, `DELETE /api/media/:id` | Auth | FFprobe + Audio Diagnostic + Auto-Chunked Whisper Transcript + Silences |
| **Auto-Editor (M6)** | `POST /api/campaigns/:id/batches/estimate` | Auth | Hitung estimasi token AI & estimasi waktu render lokal sebelum eksekusi |
| | `POST /api/campaigns/:id/batches` | Auth | Mulai job queue batch multi-varian |
| | `GET /api/batches/:batchId`, `GET /api/batches/:batchId/stream` (SSE) | Auth | Status batch & live progress streaming per clip |
| | `POST /api/batches/:batchId/cancel`, `POST /api/clips/:clipId/retry` | Auth | Batalkan batch atau retry parsial 1 clip gagal |
| **Review & Re-Edit (M7-M8)** | `GET /api/clips/:clipId`, `GET /api/clips/:clipId/stream-video` (Range) | Auth | Detail clip, versi, skor, kritik, playbook, & video streaming HTTP Range |
| | `POST /api/clips/:clipId/regenerate` | Auth | Prompt natural + preset lapangan + inline subtitle edits -> render versi baru |
| | `PATCH /api/clips/:clipId/active-version`, `PATCH /api/clips/:clipId/approve` | Auth | Rollback/pilih versi final & tandai siap export |
| **Export & Hygiene (M9)** | `GET /api/clips/:clipId/download` (`?type=mp4|playbook|srt|cover`) | Auth | Single file download |
| | `POST /api/batches/:batchId/export-zip` | Auth | Streaming Bulk ZIP (`archiver`) berdasarkan filter skor/pilihan |
| | `POST /api/system/cleanup-temp` | Auth | Bersihkan folder `storage/temp` & versi usang yang dipilih |

---

## 5. Visual-First Engineering Gate (ASCII Wireframes & Design Direction)

### 5A. ASCII Wireframe 5 Layar Utama (Desktop 1440px + Mobile 390px)

#### Layar 1: Campaign Dashboard (`/campaigns`)
```text
+---------------------------------------------------------------------------------+
| [Logo] ClipStudio   [Campaigns*] [Profil Target] [API Keys (OK)] [Doctor: Green]|
+---------------------------------------------------------------------------------+
|  Campaign Content Rewards                                [+ Buat Campaign Baru] |
|  [Cari campaign...]  [Status: Semua v]  [Platform: Semua v]                     |
|                                                                                 |
|  +---------------------------------+  +---------------------------------+       |
|  | Brand X - Promo Ramadhan        |  | Podcaster Y - Clipping Batch #2 |       |
|  | [TikTok 9:16] [YT Shorts]       |  | [TikTok 9:16]                   |       |
|  | Brief: Terkonfirmasi | 8 Clips  |  | Brief: Belum Upload | 0 Clips   |       |
|  | Top Score: 91/100  | Deadline.. |  | Deadline: 3 hari lagi           |       |
|  | [Buka Studio ->]  [Export ZIP]  |  | [Lanjutkan Setup ->]            |       |
|  +---------------------------------+  +---------------------------------+       |
+---------------------------------------------------------------------------------+
```

#### Layar 2: Campaign Studio - Brief, Media & Target Configurator (`/campaigns/:id/studio`)
```text
+---------------------------------------------------------------------------------+
| <- Kembali | Brand X - Promo Ramadhan        Step: (1) Brief -> (2) Media -> (3)|
+---------------------------------------------------------------------------------+
| [1. Dokumen Brief]              | [2. Video Mentah & Supporting Assets]         |
| +-----------------------------+ | +-------------------------------------------+ |
| | Drop .pdf / .docx / .doc    | | | Drop Raw Video (Chunked hingga 2 GB)      | |
| | atau Paste Teks Brief       | | | [podcast_ep12.mp4 - 42:10 - 16:9 - OK]    | |
| +-----------------------------+ | | Audio Diagnostic: Vokal Jernih (-18 LUFS) | |
| Ringkasan Aturan (Bisa Diedit): | | Saran: Original Normalized / Ducking 20%  | |
| [x] Durasi: 20-45 detik         | | Transkrip: 6.420 kata siap (4 chunks OK)  | |
| [x] Wajib: #BrandX, CTA bio     | | Supporting: [logo.png] [+ Outro / B-Roll] | |
| [!] Larangan: Klaim medis       | +-------------------------------------------+ |
| [Konfirmasi Aturan Brief]       |                                               |
+---------------------------------+-----------------------------------------------+
| [3. Konfigurasi Target Audiens & Strategi Viral]    [Muat Profil v] [Simpan]    |
| Platform: [TikTok 9:16*] [YT Shorts]  | Country: [Indonesia v] | Usia: [18-24 v]|
| Persona: [Mahasiswa & Pekerja Muda]   | Kontroversi: [Hot Take - Policy Safe v] |
| Hook 3s: [Curiosity Gap v]            | Emosi: [FOMO v] | KPI: [Watch-Time v]   |
| Gaya Edit: [Fast-Cut Retention v]     | Framing: [Fit-Width + Blur BG v]        |
| Caption: [Hormozi Bold - SafeZone v]  | Audio Awal: [Ducking 20% utk Sound TT v]|
| Mode Batch: (*) Distinct Moments (<=30% overlap)  ( ) A/B Hook Test             |
| Jumlah Variasi: [ 5 ]  | Estimasi Token: ~18.5k (~Rp 400) | [Generate 5 Variasi]|
+---------------------------------------------------------------------------------+
```

#### Layar 3: Multi-Variant Results & Live SSE Board (`/campaigns/:id/batches/:batchId`)
```text
+---------------------------------------------------------------------------------+
| Batch #1 (Indonesia, 18-24, Hot Take) | 4/5 Selesai | [Download Semua ZIP (4)]  |
| Filter: [Semua] [Score >= 80] [Brief PASS]          | Urut: [Skor Tertinggi v]  |
+---------------------------------------------------------------------------------+
| +--------------------+ +--------------------+ +--------------------+ +--------+ |
| | [Preview 9:16]     | | [Preview 9:16]     | | [Preview 9:16]     | | [FAIL] | |
| | Score: 92 [PASS]   | | Score: 86 [PASS]   | | Score: 74 [WARN]   | | Rate   | |
| | Hook: "Jangan..."  | | Hook: "3 Kesalahan"| | Hook: "Sebenarnya.." | Limit  | |
| | Audio: Duck 20%    | | Audio: Mute 0%     | | Audio: Orig 100%   | |        | |
| | [Inspeksi & Edit]  | | [Inspeksi & Edit]  | | [Inspeksi & Edit]  | |[Retry] | |
| | [Unduh MP4]        | | [Unduh MP4]        | | [Unduh MP4]        | |        | |
| +--------------------+ +--------------------+ +--------------------+ +--------+ |
+---------------------------------------------------------------------------------+
```

#### Layar 4: Clip Inspector, Safe-Zone Player, Playbook & Prompt Re-Editor (`/clips/:clipId`)
```text
+---------------------------------------------------------------------------------+
| <- Kembali ke Batch | Clip #01: Angle Hot Take | Versi: [v2 Aktif v] (v1 -> v2) |
+---------------------------------+-----------------------------------------------+
|  [Video Player 9:16]            | [Tab: Skor & Kritik] [Playbook*] [Edit Prompt]|
|  +---------------------------+  | --------------------------------------------- |
|  |   (Area Aman Atas)        |  | [Contoh saat Tab: Edit Prompt aktif]          |
|  |   [Hook Banner 0-3s]      |  | Quick Presets Lapangan (1-Klik):              |
|  |                           |  | [Mute Audio Asli 0%] [Kecilkan Audio 15%]     |
|  |      VIDEO PREVIEW        |  | [Potong 2s Awal] [Perketat Jeda Hening]       |
|  |                  [Like]   |  | [Naikkan Subtitle] [Edit Typo Subtitle]       |
|  |   [SUBTITLE]     [Cmt]    |  |                                               |
|  |                  [Shr]    |  | Prompt Penyesuaian Video Ini Saja:            |
|  |   (Safe-Zone Caption)     |  | +-------------------------------------------+ |
|  +---------------------------+  | | Suara audio asli belum sesuai brief,      | |
|  Overlay: [Off] [TikTok*] [YT]  | | kecilkan ke 15% karena akan diganti sound | |
|  Skor: 84 (v1) -> 92 (v2) (+8)  | | musik trending di TikTok.                 | |
|  [Unduh MP4] [Copy Playbook]    | +-------------------------------------------+ |
|  [Tandai Final] [Rollback v1]   | [Preview Perubahan EDL] [Regenerate Versi v3] |
+---------------------------------+-----------------------------------------------+
```

#### Layar 5: Mobile Responsive Preview & Download (`390x844` via Wi-Fi LAN Lokal)
```text
+-----------------------------+
| <- Batch #1   Clip #01 (v2) |
+-----------------------------+
|   +---------------------+   |
|   |   Video Player 9:16 |   |
|   |   [TikTok SafeZone] |   |
|   +---------------------+   |
|  Skor: 92/100 | Brief PASS  |
|  [Unduh MP4 ke HP] (44px+)  |
|  [Salin Semua Playbook]     |
|-----------------------------|
| [Playbook] [Kritik] [Edit]  |
| Musik: Audio 15% + Sound TT |
| Jam Tayang: 19:00-21:00 WIB |
| Caption & Hashtag [Salin]   |
+-----------------------------+
```

### 5B. Draft Arah Visual (`DESIGN.md` Gate - Menunggu Pilihan Anda Sebelum M4)
Mematuhi aturan `antislop` (R-37: arah visual adalah hak pilihan pemilik produk, bukan dipaksakan sepihak oleh AI):
- **Opsi A - Dark Editing Room (Rekomendasi untuk Studio Video):** Permukaan gelap netral (`#0F1115` / `#171A21`) agar warna preview video & overlay Safe-Zone menonjol jelas, aksen tunggal tajam **Emerald Studio (`#10B981`)** untuk aksi/skor tinggi + **Amber (`#F59E0B`)** & **Rose (`#F43F5E`)** semantik untuk *Warn/Fail*, tipografi bersih `Plus Jakarta Sans` + `JetBrains Mono` untuk timestamp/skor.
- **Opsi B - Crisp Daylight Studio:** Permukaan terang bersih (`#F8FAFC` / `#FFFFFF`), kontras teks `#0F172A`, panel video tetap berlatar gelap netral (`#111318`) agar fokus pada frame video.
- **Opsi C - Dual Theme (Default Dark + Toggle Light):** Mendukung keduanya melalui CSS tokens Tailwind tanpa bloat.

---

## 6. Independent Pre-Mortem Review (`Tech Critic` & `QA`)

### Steelman (Versi Terkuat Rancangan M3)
Arsitektur **Nuxt 3 + Express TS + SQLite WAL + Local Persistent Job Queue + Local FFmpeg 8.1.2 + BYOK AI Adapters** adalah pilihan sangat pragmatis untuk mode lokal PC: nol biaya hosting VPS, nol ketergantungan Docker/Redis, nol biaya token render video, aman terhadap shell injection (`spawn`), dan memiliki jalur migrasi mulus ke PostgreSQL di masa depan.

### Tech Critic Audit (Checklist Fallacy & Pre-Mortem)
1. **Golden Hammer & Premature Optimization Check:** **LOLOS.** Tidak memaksakan Redis/Docker/Microservices di PC lokal; menggunakan SQLite WAL + in-process persistent job queue (`render_jobs`).
2. **Confirmation Bias Check (Skenario Gagal):** Ditemukan 3 skenario kritis yang wajib dikunci sebagai syarat implementasi M4-M8:
   - *Counter-Scenario 1 (Crash / Laptop Restart Saat Render Berjalan):* Jika Express restart saat `render_jobs.status = 'processing'`, job bisa tersangkut selamanya (*zombie job*). **Mitigasi wajib di M4/M6:** Pada startup Express, otomatis reset seluruh job berstatus `processing` kembali ke `queued` (atau `failed` dengan pesan *"Terhenti saat server dimatikan, klik Retry"*).
   - *Counter-Scenario 2 (Windows Path Escaping pada Filter `ass=` FFmpeg):* Di Windows, path `C:\Users\...` memiliki huruf drive + colon `:` yang sering memecah syntax `filter_complex` FFmpeg (`ass=C\:/...`). **Mitigasi wajib di M6:** Jalankan `ffmpeg` dengan `cwd` pada folder kerja clip (atau gunakan path relatif bersih tanpa drive colon `ass=subtitles.ass:fontsdir=../../server/assets/fonts`) agar 100% kebal bug backslash/colon Windows!
   - *Counter-Scenario 3 (HTTP Range Streaming untuk Video Preview di Browser/Safari/Chrome):* Jika endpoint video hanya memakai `res.sendFile()` tanpa dukungan `206 Partial Content` yang tepat, scrubbing/loncat timestamp di Video Player (misal klik timestamp kritik detik `00:18`) akan gagal/mental ke detik `00:00`. **Mitigasi wajib di M6/M7:** Endpoint `/api/clips/:clipId/stream-video` wajib mendukung penuh `Range: bytes=...` (`206 Partial Content`)!

### Structured Verdict (`tech-critic` Schema)

```json
{
  "role": "tech-critic",
  "target_subtask_id": "M3_TECHNICAL_BLUEPRINT",
  "result": "approved",
  "findings": [
    {
      "type": "confirmation_bias_mitigated",
      "detail": "Zombie render_jobs setelah restart server lokal wajib di-recover otomatis saat startup Express."
    },
    {
      "type": "windows_environment_edge_case",
      "detail": "Filter ass= FFmpeg di Windows rawan pecah oleh drive colon (C:); wajib pakai relative path dengan cwd lokal per job."
    },
    {
      "type": "media_playback_requirement",
      "detail": "Video preview player membutuhkan HTTP 206 Partial Content Range streaming agar klik loncat timestamp kritik bekerja mulus."
    }
  ],
  "counter_scenario": "User me-restart laptop saat batch 5 video baru selesai 2, lalu membuka Clip Inspector dan mengklik timestamp kritik 00:24 pada video v1.",
  "pragmatic_alternative": "Tambahkan startup job recovery + relative cwd pada FfmpegCommandBuilder + HTTP Range streaming handler sejak awal M4-M6.",
  "note": "Blueprint M3 disetujui untuk lanjut ke M4 dengan 3 mitigasi teknis wajib di atas dimasukkan langsung ke kontrak implementasi."
}
```
